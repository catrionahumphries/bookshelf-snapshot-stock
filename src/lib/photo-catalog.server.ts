import { generateResponse } from "@lovable.dev/ai-gateway";
import { z } from "zod";

const bookSchema = z.object({
  title: z.string().trim(), author: z.string().trim(), series_name: z.string().trim(),
  volume: z.string().trim(), uncertain: z.boolean(), note: z.string().trim(),
});
export class PhotoRefusal extends Error {}

export async function readPhotoBooks(image: string) {
  const response = await generateResponse({
    model: "openai/gpt-6-astra",
    tools: [{ type: "web_search" }],
    input: [{ role: "user", content: [
      { type: "input_text", text: `You catalogue books for a second-hand bookseller.
1. Find EVERY distinct book visible in this photo (covers or spines), in left-to-right / top-to-bottom order.
2. Read what you can, then use web search to fill in missing details (full title, author, series name, volume number) and to verify what you read.
3. Mark a book "uncertain": true if the text is blurry/partly hidden, or you could not confirm it via search, and explain briefly in "note".
Reply ONLY with JSON: {"books":[{"title":string,"author":string,"series_name":string,"volume":string,"uncertain":boolean,"note":string}]}
Use "" for unknown fields. "volume" is just the number (e.g. "3"), "" if not part of a series.` },
      { type: "input_image", image_url: image, detail: "high" },
    ] }],
  });
  let text = "";
  for (const item of response.output) {
    if (item.type !== "message") continue;
    for (const part of item.content) {
      if (part.type === "refusal") throw new PhotoRefusal("The photo reader declined this photo. Choose another photo to continue.");
      if (part.type === "output_text") text += part.text;
    }
  }
  if (response.status !== "completed" || !text) throw new Error("The photo reading did not finish. You can retry this photo.");
  const parsed = z.object({ books: z.array(bookSchema) }).parse(JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g, "")));
  return parsed.books.map((book) => ({ ...book, uncertain: book.uncertain || !book.title || !book.author }));
}