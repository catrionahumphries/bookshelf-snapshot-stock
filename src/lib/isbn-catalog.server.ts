import { z } from "zod";
import { normalizeIsbn } from "./isbn";

const googleSchema = z.object({ items: z.array(z.object({ volumeInfo: z.object({
  title: z.string(), authors: z.array(z.string()).optional(),
  industryIdentifiers: z.array(z.object({ identifier: z.string() })).optional(),
}) })).optional() });
const openSchema = z.record(z.object({ title: z.string(), authors: z.array(z.object({ name: z.string() })).optional() }));

export function googleIsbnMatch(payload: unknown, isbn: string) {
  const parsed = googleSchema.safeParse(payload);
  if (!parsed.success) return null;
  const match = parsed.data.items?.find(({ volumeInfo }) => volumeInfo.industryIdentifiers?.some(({ identifier }) => normalizeIsbn(identifier) === isbn));
  return match ? { title: match.volumeInfo.title, author: match.volumeInfo.authors?.join(", ") ?? "" } : null;
}

export async function lookupIsbn(isbn: string) {
  let unavailable = false;
  try {
    const response = await fetch(`https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}`, { signal: AbortSignal.timeout(20000) });
    if (response.ok) {
      const match = googleIsbnMatch(await response.json(), isbn);
      if (match) return match;
    } else unavailable = true;
  } catch { unavailable = true; }
  try {
    const key = `ISBN:${isbn}`;
    const response = await fetch(`https://openlibrary.org/api/books?bibkeys=${key}&jscmd=data&format=json`, { signal: AbortSignal.timeout(20000) });
    if (response.ok) {
      const parsed = openSchema.safeParse(await response.json());
      const match = parsed.success ? parsed.data[key] : undefined;
      if (match) return { title: match.title, author: match.authors?.map(({ name }) => name).join(", ") ?? "" };
    } else unavailable = true;
  } catch { unavailable = true; }
  throw new Error(unavailable ? "Book catalogues are unavailable. Retry later, or enter the details yourself." : "No exact ISBN match was found. Enter the book details yourself, or retry later.");
}