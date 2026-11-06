import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "@/integrations/supabase/types";

export const Route = createFileRoute("/api/public/photo-worker")({
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
    const { data: verified, error: verificationError } = await publicClient.rpc("verify_photo_callback", { p_id: input.data.id, p_token: input.data.token });
    if (verificationError || !verified) return new Response("Unauthorized", { status: 401 });
    // A per-job random capability is verified before privileged access. Each
    // callback claims exactly one row; duplicate callbacks cannot repeat AI work.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: claimed, error: claimError } = await supabaseAdmin.rpc("claim_photo_job", { p_id: input.data.id });
    if (claimError) return new Response("Couldn't claim photo", { status: 503 });
    const job = claimed?.[0];
    if (!job) return Response.json({ ok: true });
    const { data: pause, error: pauseError } = await supabaseAdmin.from("photo_queue_state").select("*").eq("user_id", job.user_id).maybeSingle();
    if (pauseError) {
      await supabaseAdmin.from("photo_jobs").update({ status: "failed", error_message: "Couldn't check processing status. Please retry.", lease_until: null }).eq("id", job.id);
      return new Response("Status unavailable", { status: 503 });
    }
    if (pause) {
      await supabaseAdmin.from("photo_jobs").update({ status: "paused", pause_kind: pause.pause_kind, error_message: pause.reason, lease_until: null }).eq("id", job.id);
      return Response.json({ paused: true });
    }
    try {
      const { readPhotoBooks } = await import("@/lib/photo-catalog.server");
      const books = await readPhotoBooks(job.image);
      const { error } = await supabaseAdmin.rpc("finish_photo_job", { p_id: job.id, p_books: books });
      if (error) throw new Error("Couldn't save the result. Please retry this photo.");
      return Response.json({ ok: true });
    } catch (error) {
      const { GatewayError } = await import("@lovable.dev/ai-gateway");
      const { PhotoRefusal } = await import("@/lib/photo-catalog.server");
      let message = error instanceof Error ? error.message : "Couldn't read this photo. Please retry.";
      let pauseKind = "";
      if (error instanceof PhotoRefusal) pauseKind = "refusal";
      if (error instanceof GatewayError) {
        console.error("Photo queue gateway failure", { code: error.code, ids: error.ids, outcome: error.outcome, httpStatus: error.httpStatus });
        if (error.httpStatus === 402) { pauseKind = "credits"; message = "AI credits have run out. Top up, then retry to resume."; }
        else if (error.httpStatus === 403) { pauseKind = "access"; message = "Photo reading access was denied. Restore access before retrying."; }
        else if (error.httpStatus === 429) { pauseKind = "rate"; message = "Photo reading is busy. Wait a little before retrying to resume."; }
        else message = "Photo reading stopped before a result was saved. Retry only when you're ready to try again.";
      }
      if (pauseKind) {
        const { error: pauseSaveError } = await supabaseAdmin.from("photo_queue_state").upsert({ user_id: job.user_id, pause_kind: pauseKind, reason: message });
        if (pauseSaveError) console.error("Couldn't persist photo queue pause", pauseSaveError.code);
      }
      const { error: saveError } = await supabaseAdmin.from("photo_jobs").update({ status: pauseKind ? "paused" : "failed", pause_kind: pauseKind, error_message: message.slice(0, 500), lease_until: null }).eq("id", job.id).eq("status", "processing");
      if (saveError) return new Response("Couldn't save photo status", { status: 503 });
      return Response.json({ ok: false });
    }
  } } },
});