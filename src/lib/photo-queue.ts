import { z } from "zod";
import { isBookFormat } from "@/lib/book-format";

export const photoUploadSchema = z.object({
  id: z.string().uuid(), image: z.string().startsWith("data:image/").max(8_000_000),
  sku: z.string().max(100), format: z.string().refine(isBookFormat).default(""),
  source: z.string().max(2000).default(""), preview: z.boolean(),
});

export type PhotoJob = {
  id: string;
  sku: string;
  status: string;
  result_count: number;
  error_message: string;
  pause_kind: string;
  created_at: string;
  lease_until: string | null;
};

export function needsPhotoAttention(job: PhotoJob, now = Date.now()) {
  return job.status === "failed" || job.status === "paused" ||
    (job.status === "processing" && !!job.lease_until && Date.parse(job.lease_until) < now) ||
    (job.status === "queued" && Date.parse(job.created_at) + 15 * 60_000 < now);
}

export function photoCounts(jobs: PhotoJob[], now = Date.now()) {
  return {
    pending: jobs.filter((job) => ["queued", "processing"].includes(job.status) && !needsPhotoAttention(job, now)).length,
    completed: jobs.filter((job) => job.status === "completed").length,
    attention: jobs.filter((job) => needsPhotoAttention(job, now)).length,
  };
}