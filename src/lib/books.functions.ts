import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const schema = z.object({
  image: z
    .string()
    .startsWith("data:image/")
    .max(8_000_000, "Image too large"),
});

export const extractBook = createServerFn({ method: "POST" })
  .inputValidator((d) => schema.parse(d))
  .handler(async ({ data }) => {
    const { generateResponse, GatewayError } = await import("@lovable.dev/ai-gateway");
    try {
      const res = await generateResponse({
        model: "openai/gpt-6-astra",
        input: [
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text:
                  'Read this book photo (cover or spine). Reply ONLY with JSON: {"title":string,"author":string,"series":string}. Use "" for series if none or unknown. Use "" if a field is unreadable.',
              },
              { type: "input_image", image_url: data.image, detail: "auto" },
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
      return {
        title: String(parsed.title ?? "").trim(),
        author: String(parsed.author ?? "").trim(),
        series: String(parsed.series ?? "").trim(),
      };
    } catch (e) {
      if (e instanceof GatewayError) {
        if (e.httpStatus === 429) throw new Error("Too many requests — wait a moment and try again.");
        if (e.httpStatus === 402) throw new Error("AI credits have run out. Please top up.");
      }
      throw new Error("Couldn't read that photo. Try again.");
    }
  });
