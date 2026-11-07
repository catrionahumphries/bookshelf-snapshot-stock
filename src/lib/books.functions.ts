import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { BOOK_PHOTO_PROMPT } from "@/lib/book-photo-prompt";

const schema = z.object({
  image: z.string().startsWith("data:image/").max(8_000_000, "Image too large"),
  skuStart: z.string().max(100).default(""),
});

export const extractBooks = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => schema.parse(d))
  .handler(async ({ data, context }) => {
    const { generateResponse, GatewayError } = await import("@lovable.dev/ai-gateway");
    let found: { title: string; author: string; series_name: string; volume: string; uncertain: boolean; note: string }[] = [];
    try {
      const res = await generateResponse({
        model: "openai/gpt-6-astra",
        tools: [{ type: "web_search" }],
        input: [
          {
            role: "user",
            content: [
              { type: "input_text", text: BOOK_PHOTO_PROMPT },
              { type: "input_image", image_url: data.image, detail: "high" },
            ],
          },
        ],
      });
      let text = "";
      for (const item of (res as { output?: unknown[] }).output ?? []) {
        const content = (item as { content?: { type: string; text?: string }[] }).content;
        for (const c of content ?? []) if (c.type === "output_text" && c.text) text += c.text;
      }
      const match = text.match(/\{[\s\S]*\}/);
      const parsed = match ? JSON.parse(match[0]) : {};
      const s = (v: unknown) => String(v ?? "").trim();
      found = (Array.isArray(parsed.books) ? parsed.books : []).map((b: { title?: unknown; author?: unknown; series_name?: unknown; volume?: unknown; uncertain?: unknown; note?: unknown }) => ({
        title: s(b.title),
        author: s(b.author),
        series_name: s(b.series_name),
        volume: s(b.volume),
        uncertain: Boolean(b.uncertain) || !s(b.title) || !s(b.author),
        note: s(b.note),
      }));
    } catch (e) {
      console.error(e);
      if (e instanceof GatewayError) {
        if (e.httpStatus === 429) throw new Error("Too many requests — wait a moment and try again.");
        if (e.httpStatus === 402) throw new Error("AI credits have run out. Please top up.");
      }
      throw new Error("Couldn't read that photo. Try again.");
    }
    if (!found.length) return { count: 0 };
    const rows = found.map((b) => ({
      user_id: context.userId,
      title: b.title,
      author: b.author,
      series_name: b.series_name,
      volume: b.volume,
      sku: data.skuStart.trim(),
      needs_review: b.uncertain,
      review_note: b.note,
    }));
    const { error } = await context.supabase.from("books").insert(rows);
    if (error) throw new Error("Couldn't save books.");
    return { count: rows.length, uncertain: rows.filter((r) => r.needs_review).length };
  });
