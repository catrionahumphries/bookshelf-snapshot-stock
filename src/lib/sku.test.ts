import { describe, it, expect, vi } from "vitest";
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
vi.mock("@tanstack/react-start", () => ({ createServerFn: () => ({ middleware: () => ({ inputValidator: () => ({ handler: () => null }) }) }) }));
import { nextSku } from "./books.functions";

describe("nextSku", () => {
  it("auto-increments numbered SKUs", () => {
    expect(nextSku("SKU-1001", 0)).toBe("SKU-1001");
    expect(nextSku("SKU-1001", 2)).toBe("SKU-1003");
  });
  it("keeps leading zeros", () => expect(nextSku("A009", 1)).toBe("A010"));
  it("blank stays blank", () => expect(nextSku("", 3)).toBe(""));
});
