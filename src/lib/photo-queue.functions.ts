import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const queuePhoto = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({
    id: z.string().uuid(), image: z.string().startsWith("data:image/").max(8_000_000),
    sku: z.string().max(100), preview: z.boolean(),
  }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("enqueue_photo_job", {
      p_id: data.id, p_image: data.image, p_sku: data.sku, p_preview: data.preview,
    });
    if (error) throw new Error("Couldn't queue your photo. Your photo and SKU are still here — try again.");
    return { id: data.id };
  });

export const retryPhoto = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("retry_photo_job", { p_id: data.id });
    if (error) throw new Error("Couldn't retry that photo. It may still be processing.");
    return { ok: true };
  });