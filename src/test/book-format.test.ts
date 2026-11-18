import { describe, it, expect } from "vitest";
import { BOOK_FORMATS, isBookFormat } from "@/lib/book-format";
describe("book format", () => {
  it("offers the five formats", () => expect(BOOK_FORMATS).toEqual(["Hardcover with DJ", "Hardcover no DJ", "Paperback small", "Paperback medium", "Paperback large"]));
  it("allows blank but rejects other values", () => { expect(isBookFormat("")).toBe(true); expect(isBookFormat("Ebook")).toBe(false); });
});
