import { describe, expect, it } from "vitest";
import { normalizeIsbn, acceptBarcode } from "@/lib/isbn";
import { googleIsbnMatch } from "@/lib/isbn-catalog.server";

describe("ISBN scans", () => {
  it("accepts a valid book barcode", () => expect(normalizeIsbn("9780140328721")).toBe("9780140328721"));
  it("converts ISBN-10 to ISBN-13", () => expect(normalizeIsbn("0-14-032872-6")).toBe("9780140328721"));
  it("rejects a non-book barcode", () => expect(normalizeIsbn("4006381333931")).toBeNull());
  it("rejects a bad checksum", () => expect(normalizeIsbn("9780140328722")).toBeNull());
  it("does not create repeated entries while the same barcode stays in view", () => expect(acceptBarcode({ isbn: "9780140328721", time: 1000 }, "9780140328721", 1200)).toBe(false));
  it("allows scanning the next book immediately", () => expect(acceptBarcode({ isbn: "9780140328721", time: 1000 }, "9780439064873", 1200)).toBe(true));
  it("allows another copy after the barcode leaves the view", () => expect(acceptBarcode({ isbn: "9780140328721", time: 1000 }, "9780140328721", 3100)).toBe(true));
  it("only accepts exact ISBN catalogue matches", () => {
    const book = { volumeInfo: { title: "Matilda", authors: ["Roald Dahl"], industryIdentifiers: [{ identifier: "0140328726" }] } };
    expect(googleIsbnMatch({ items: [book] }, "9780140328721")).toEqual({ title: "Matilda", author: "Roald Dahl" });
    expect(googleIsbnMatch({ items: [book] }, "9780439064873")).toBeNull();
  });
});