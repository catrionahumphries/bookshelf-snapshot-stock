import { describe, expect, it } from "vitest";
import { photoCounts, needsPhotoAttention, photoUploadSchema, type PhotoJob } from "@/lib/photo-queue";

const job = (status: string): PhotoJob => ({ id: "photo", sku: "BOX-12", status, result_count: 0, error_message: "", pause_kind: "", created_at: "2026-11-06T07:00:00Z", lease_until: "2026-11-06T07:15:00Z" });
describe("Photo queue", () => {
  it("preserves a free-text item source with the uploaded photo", () => {
    const upload = photoUploadSchema.parse({ id: "12345678-1234-4234-8234-123456789abc", image: "data:image/jpeg;base64,fixture", sku: "BOX-12", source: 'School fair, stall "B" — donated by Jo', preview: true });
    expect(upload.source).toBe('School fair, stall "B" — donated by Jo');
  });
  it("keeps the source optional for older uploads", () => {
    const upload = photoUploadSchema.parse({ id: "12345678-1234-4234-8234-123456789abc", image: "data:image/jpeg;base64,fixture", sku: "BOX-12", preview: true });
    expect(upload.source).toBe("");
  });
  it("counts photos rather than books and separates failed work", () => {
    expect(photoCounts([job("queued"), job("processing"), { ...job("completed"), result_count: 9 }, job("failed")], Date.parse("2026-11-06T07:01:00Z"))).toEqual({ pending: 2, completed: 1, attention: 1 });
  });
  it("offers recovery for interrupted processing without automatic replay", () => {
    expect(needsPhotoAttention(job("processing"), Date.parse("2026-11-06T07:16:00Z"))).toBe(true);
    expect(needsPhotoAttention(job("processing"), Date.parse("2026-11-06T07:01:00Z"))).toBe(false);
  });
});