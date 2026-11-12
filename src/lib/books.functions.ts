import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const schema = z.object({
  image: z.string().startsWith("data:image/").max(8_000_000, "Image too large"),
  skuStart: z.string().max(100).default(""),
});

export const extractBooks = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => schema.parse(d))
  .handler(async ({ data, context }) => {
    const { GatewayError } = await import("@lovable.dev/ai-gateway");
    let found: { title: string; author: string; series_name: string; volume: string; uncertain: boolean; note: string }[] = [];
    let noBooksReason = "";
    try {
      const { readPhotoBooks } = await import("@/lib/photo-catalog.server");
      const result = await readPhotoBooks(data.image);
      found = result.books;
      noBooksReason = result.no_books_reason;
    } catch (e) {
      console.error(e);
      if (e instanceof GatewayError) {
        if (e.httpStatus === 429) throw new Error("Too many requests — wait a moment and try again.");
        if (e.httpStatus === 402) throw new Error("AI credits have run out. Please top up.");
      }
      throw new Error("Couldn't read that photo. Try again.");
    }
    if (!found.length) return { count: 0, no_books_reason: noBooksReason };
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
