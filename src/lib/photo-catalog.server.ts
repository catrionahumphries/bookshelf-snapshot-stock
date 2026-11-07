import { generateResponse } from "@lovable.dev/ai-gateway";
import { z } from "zod";
import { BOOK_PHOTO_PROMPT } from "@/lib/book-photo-prompt";

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
      { type: "input_text", text: BOOK_PHOTO_PROMPT },
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