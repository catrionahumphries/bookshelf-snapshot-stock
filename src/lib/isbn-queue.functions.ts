import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { isBookFormat } from "@/lib/book-format";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { normalizeIsbn } from "./isbn";

export const queueIsbn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid(), isbn: z.string(), sku: z.string().max(100), format: z.string().refine(isBookFormat).default("") }).parse(input))
  .handler(async ({ data, context }) => {
    const isbn = normalizeIsbn(data.isbn);
    if (!isbn) throw new Error("Enter a valid book ISBN.");
    const { data: bookId, error } = await context.supabase.rpc("enqueue_isbn_job", { p_id: data.id, p_isbn: isbn, p_sku: data.sku, p_format: data.format });
    if (error) throw new Error("Couldn't save this scan. Retry it before leaving the scanner.");
    return { id: bookId, isbn };
  });

export const retryIsbn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("retry_isbn_job", { p_id: data.id });
    if (error) throw new Error("Couldn't retry this ISBN. It may still be processing.");
    return { ok: true };
  });