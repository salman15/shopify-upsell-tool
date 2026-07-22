import { describe, expect, it } from "vitest";
import { offerInputSchema, ruleInputSchema } from "./schema";

function baseOffer() {
  return {
    targetType: "PRODUCT" as const,
    targetIds: ["gid://shopify/Product/1"],
  };
}

function baseRule(overrides: Record<string, unknown> = {}) {
  return {
    toolType: "POPUP" as const,
    name: "Test rule",
    triggerType: "PRODUCT" as const,
    triggerIds: ["gid://shopify/Product/1"],
    offers: [baseOffer()],
    ...overrides,
  };
}

describe("offerInputSchema", () => {
  it("accepts a minimal valid offer and fills in defaults", () => {
    const parsed = offerInputSchema.parse(baseOffer());
    expect(parsed.variantOptionMode).toBe("INDEPENDENT");
    expect(parsed.sortOrder).toBe(0);
  });

  it("rejects an offer with no target ids", () => {
    const result = offerInputSchema.safeParse({ ...baseOffer(), targetIds: [] });
    expect(result.success).toBe(false);
  });
});

describe("ruleInputSchema — basics", () => {
  it("accepts a minimal valid FREE rule", () => {
    const result = ruleInputSchema.safeParse(baseRule());
    expect(result.success).toBe(true);
  });

  it("rejects a rule with a blank internal name", () => {
    const result = ruleInputSchema.safeParse(baseRule({ name: "" }));
    expect(result.success).toBe(false);
  });

  it("rejects a rule with no trigger ids", () => {
    const result = ruleInputSchema.safeParse(baseRule({ triggerIds: [] }));
    expect(result.success).toBe(false);
  });

  it("rejects a rule with no offers", () => {
    const result = ruleInputSchema.safeParse(baseRule({ offers: [] }));
    expect(result.success).toBe(false);
  });
});

describe("ruleInputSchema — discount value rules", () => {
  it("allows discountValue of 0 for FREE mode", () => {
    const result = ruleInputSchema.safeParse(baseRule({ discountMode: "FREE", discountValue: 0 }));
    expect(result.success).toBe(true);
  });

  it("rejects PERCENTAGE mode with a value of 0", () => {
    const result = ruleInputSchema.safeParse(baseRule({ discountMode: "PERCENTAGE", discountValue: 0 }));
    expect(result.success).toBe(false);
  });

  it("rejects PERCENTAGE mode with a value over 100", () => {
    const result = ruleInputSchema.safeParse(baseRule({ discountMode: "PERCENTAGE", discountValue: 101 }));
    expect(result.success).toBe(false);
  });

  it("accepts PERCENTAGE mode with a value of exactly 100", () => {
    const result = ruleInputSchema.safeParse(baseRule({ discountMode: "PERCENTAGE", discountValue: 100 }));
    expect(result.success).toBe(true);
  });

  it("rejects FIXED mode with a value of 0", () => {
    const result = ruleInputSchema.safeParse(baseRule({ discountMode: "FIXED", discountValue: 0 }));
    expect(result.success).toBe(false);
  });

  it("accepts FIXED mode with a value over 100 (no upper bound, unlike PERCENTAGE)", () => {
    const result = ruleInputSchema.safeParse(baseRule({ discountMode: "FIXED", discountValue: 250 }));
    expect(result.success).toBe(true);
  });
});

describe("ruleInputSchema — display color fields", () => {
  it("accepts a well-formed hex color", () => {
    const result = ruleInputSchema.safeParse(baseRule({ backgroundColor: "#ff00aa" }));
    expect(result.success).toBe(true);
  });

  it("accepts null/omitted colors (falls back to CSS defaults on the storefront)", () => {
    const result = ruleInputSchema.safeParse(baseRule({ backgroundColor: null }));
    expect(result.success).toBe(true);
  });

  it("rejects a malformed color string", () => {
    const result = ruleInputSchema.safeParse(baseRule({ backgroundColor: "not-a-color" }));
    expect(result.success).toBe(false);
  });

  it("rejects a 3-digit hex shorthand (only 6-digit hex is supported)", () => {
    const result = ruleInputSchema.safeParse(baseRule({ backgroundColor: "#fff" }));
    expect(result.success).toBe(false);
  });
});
