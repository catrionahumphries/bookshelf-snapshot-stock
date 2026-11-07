import { beforeEach, describe, expect, it, vi } from "vitest";
import { readPhotoBooks } from "@/lib/photo-catalog.server";

const { generateResponse } = vi.hoisted(() => ({ generateResponse: vi.fn() }));
vi.mock("@lovable.dev/ai-gateway", () => ({ generateResponse }));

function result(books: unknown[]) {
  return { status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify({ books }) }] }] };
}

describe("Strict photo recognition results", () => {
  beforeEach(() => generateResponse.mockReset());

  it("returns no inventory candidates when the reader finds no qualifying books", async () => {
    generateResponse.mockResolvedValue(result([]));
    expect(await readPhotoBooks("data:image/jpeg;base64,fixture")).toEqual([]);
    expect(generateResponse).toHaveBeenCalledTimes(1);
  });

  it("keeps a qualifying book flagged when its author remains unknown", async () => {
    generateResponse.mockResolvedValue(result([{ title: "Visible book", author: "", series_name: "", volume: "", uncertain: false, note: "Author could not be verified" }]));
    expect(await readPhotoBooks("data:image/jpeg;base64,fixture")).toEqual([
      { title: "Visible book", author: "", series_name: "", volume: "", uncertain: true, note: "Author could not be verified" },
    ]);
  });
});