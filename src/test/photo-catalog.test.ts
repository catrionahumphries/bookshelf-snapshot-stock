import { beforeEach, describe, expect, it, vi } from "vitest";
import { readPhotoBooks } from "@/lib/photo-catalog.server";

const { generateResponse } = vi.hoisted(() => ({ generateResponse: vi.fn() }));
vi.mock("@lovable.dev/ai-gateway", () => ({ generateResponse }));

function result(books: unknown[], no_books_reason = "") {
  return { status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify({ books, no_books_reason }) }] }] };
}

describe("Strict photo recognition results", () => {
  beforeEach(() => generateResponse.mockReset());

  it("includes a magazine's issue month and year in its saved title", async () => {
    generateResponse.mockResolvedValue(result([{ title: "Australian healthy food guide", magazine_issue_date: "November 2021", author: "", series_name: "", volume: "November 2021", uncertain: false, note: "" }]));
    const read = await readPhotoBooks("data:image/jpeg;base64,fixture");
    expect(read.books[0]?.title).toBe("Australian healthy food guide November 2021");
    expect(read.books[0]).not.toHaveProperty("magazine_issue_date");
  });

  it("does not duplicate a magazine date already included in the title", async () => {
    generateResponse.mockResolvedValue(result([{ title: "Australian healthy food guide November 2021", magazine_issue_date: "November 2021", author: "", series_name: "", volume: "November 2021", uncertain: false, note: "" }]));
    expect((await readPhotoBooks("data:image/jpeg;base64,fixture")).books[0]?.title).toBe("Australian healthy food guide November 2021");
  });

  it("does not invent an unknown magazine issue date", async () => {
    generateResponse.mockResolvedValue(result([{ title: "Australian healthy food guide", magazine_issue_date: "", author: "", series_name: "", volume: "", uncertain: true, note: "Issue date could not be verified" }]));
    expect((await readPhotoBooks("data:image/jpeg;base64,fixture")).books[0]?.title).toBe("Australian healthy food guide");
  });

  it("returns no inventory candidates when the reader finds no qualifying books", async () => {
    generateResponse.mockResolvedValue(result([], "Only shadows and background book fragments are visible."));
    expect(await readPhotoBooks("data:image/jpeg;base64,fixture")).toEqual({ books: [], no_books_reason: "Only shadows and background book fragments are visible." });
    expect(generateResponse).toHaveBeenCalledTimes(1);
  });

  it("keeps a qualifying book flagged when its author remains unknown", async () => {
    generateResponse.mockResolvedValue(result([{ title: "Women Who Changed the World", author: "", series_name: "", volume: "", uncertain: false, note: "Author could not be verified" }], "Author not visible"));
    expect(await readPhotoBooks("data:image/jpeg;base64,fixture")).toEqual({ books: [
      { title: "Women Who Changed the World", author: "", series_name: "", volume: "", uncertain: true, note: "Author could not be verified" },
    ], no_books_reason: "" });
  });
  it("explains honestly when an empty response omits a reason", async () => {
    generateResponse.mockResolvedValue(result([]));
    expect((await readPhotoBooks("data:image/jpeg;base64,fixture")).no_books_reason).toBe("The photo reader returned no books without explaining why. Try a closer photo of the complete cover or spine with readable text.");
  });
  it("keeps a readable foreground cover without a readable spine", async () => {
    const book = { title: "The Strongest Girl in the World", author: "", series_name: "", volume: "", uncertain: false, note: "Author could not be verified" };
    generateResponse.mockResolvedValue(result([book]));
    const read = await readPhotoBooks("data:image/jpeg;base64,fixture");
    expect(read.books).toEqual([{ ...book, uncertain: true }]);
    expect(read.no_books_reason).toBe("");
  });
  it("does not turn unfinished processing into a no-books result", async () => {
    generateResponse.mockResolvedValue({ ...result([]), status: "incomplete" });
    await expect(readPhotoBooks("data:image/jpeg;base64,fixture")).rejects.toThrow("The photo reading did not finish");
  });
});