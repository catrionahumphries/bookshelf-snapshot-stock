import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "@/integrations/supabase/types";

export const Route = createFileRoute("/api/public/isbn-worker")({
  server: { handlers: { POST: async ({ request }) => {
    const input = z.object({ id: z.string().uuid(), token: z.string().uuid() }).safeParse(await request.json().catch(() => null));
    if (!input.success) return new Response("Invalid request", { status: 400 });
    const url = process.env['SUPABASE_URL'];
    const key = process.env['SUPABASE_PUBLISHABLE_KEY'];
    if (!url || !key) return new Response("Not configured", { status: 503 });
    const publicClient = createClient<Database>(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { fetch: (resource, init) => {
        const headers = new Headers(init?.headers);
        if (key.startsWith("sb_") && headers.get("Authorization") === `Bearer ${key}`) headers.delete("Authorization");
        headers.set("apikey", key);
        return fetch(resource, { ...init, headers });
      } },
    });
    const { data: verified, error: verifyError } = await publicClient.rpc("verify_isbn_callback", { p_id: input.data.id, p_token: input.data.token });
    if (verifyError || !verified) return new Response("Unauthorized", { status: 401 });
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: claimed, error: claimError } = await supabaseAdmin.rpc("claim_isbn_job", { p_id: input.data.id, p_token: input.data.token });
    if (claimError) return new Response("Couldn't claim scan", { status: 503 });
    const job = claimed?.[0];
    if (!job) return Response.json({ ok: true });
    let details: { title: string; author: string } = { title: "", author: "" };
    let errorMessage = "";
    try {
      const { lookupIsbn } = await import("@/lib/isbn-catalog.server");
      details = await lookupIsbn(job.isbn);
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : "Couldn't look up this ISBN. Please retry.";
    }
    const { error } = await supabaseAdmin.rpc("finish_isbn_job", { p_id: job.id, p_token: input.data.token, p_details: details, p_error: errorMessage });
    if (error) return new Response("Couldn't save result", { status: 503 });
    return Response.json({ ok: !errorMessage });
  } } },
});