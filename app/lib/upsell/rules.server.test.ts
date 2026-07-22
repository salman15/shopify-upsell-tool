import { describe, expect, it } from "vitest";
import { serializeRule } from "./rules.server";

type FakeRow = Parameters<typeof serializeRule>[0];

// serializeRule only reads/transforms triggerIds and offers[].targetIds — the
// rest of the Prisma row shape passes through untouched, so a plain object
// (cast past the generated Prisma type) is enough to exercise it without a
// real database.
function fakeRuleRow(overrides: Record<string, unknown> = {}) {
  const row = {
    id: "rule_1",
    shop: "test.myshopify.com",
    toolType: "POPUP",
    enabled: true,
    name: "Test rule",
    priority: 0,
    triggerType: "PRODUCT",
    triggerIds: JSON.stringify(["gid://shopify/Product/1", "gid://shopify/Product/2"]),
    discountMode: "FREE",
    discountValue: 0,
    maxImpressionsPerSession: 0,
    hideIfOfferAlreadyInCart: true,
    placement: "default",
    headline: null,
    subheading: null,
    buttonText: null,
    backgroundColor: null,
    textColor: null,
    buttonColor: null,
    buttonTextColor: null,
    borderRadius: null,
    fontFamily: null,
    startAt: null,
    endAt: null,
    createdAt: new Date("2026-01-01"),
    updatedAt: new Date("2026-01-01"),
    offers: [
      {
        id: "offer_1",
        ruleId: "rule_1",
        targetType: "PRODUCT",
        targetIds: JSON.stringify(["gid://shopify/Product/9"]),
        variantOptionMode: "INDEPENDENT",
        fixedVariantId: null as string | null,
        sortOrder: 0,
      },
    ],
    ...overrides,
  };
  return row as unknown as FakeRow;
}

describe("serializeRule", () => {
  it("parses the JSON-encoded triggerIds into a string array", () => {
    const result = serializeRule(fakeRuleRow());
    expect(result.triggerIds).toEqual(["gid://shopify/Product/1", "gid://shopify/Product/2"]);
  });

  it("parses each offer's JSON-encoded targetIds into a string array", () => {
    const result = serializeRule(fakeRuleRow());
    expect(result.offers[0].targetIds).toEqual(["gid://shopify/Product/9"]);
  });

  it("falls back to an empty array for malformed triggerIds JSON", () => {
    const result = serializeRule(fakeRuleRow({ triggerIds: "{not valid json" }));
    expect(result.triggerIds).toEqual([]);
  });

  it("falls back to an empty array when the parsed JSON isn't an array", () => {
    const result = serializeRule(fakeRuleRow({ triggerIds: JSON.stringify({ not: "an array" }) }));
    expect(result.triggerIds).toEqual([]);
  });

  it("falls back to an empty array for a malformed offer targetIds JSON", () => {
    const result = serializeRule(
      fakeRuleRow({
        offers: [
          {
            id: "offer_1",
            ruleId: "rule_1",
            targetType: "PRODUCT",
            targetIds: "not json",
            variantOptionMode: "INDEPENDENT",
            fixedVariantId: null,
            sortOrder: 0,
          },
        ],
      }),
    );
    expect(result.offers[0].targetIds).toEqual([]);
  });

  it("preserves every other field on the rule untouched", () => {
    const result = serializeRule(fakeRuleRow({ name: "Buy 1 get 1 free" }));
    expect(result.name).toBe("Buy 1 get 1 free");
    expect(result.toolType).toBe("POPUP");
    expect(result.discountMode).toBe("FREE");
  });

  it("handles multiple offers independently", () => {
    const result = serializeRule(
      fakeRuleRow({
        offers: [
          {
            id: "o1",
            ruleId: "rule_1",
            targetType: "PRODUCT",
            targetIds: JSON.stringify(["a"]),
            variantOptionMode: "INDEPENDENT",
            fixedVariantId: null,
            sortOrder: 0,
          },
          {
            id: "o2",
            ruleId: "rule_1",
            targetType: "COLLECTION",
            targetIds: JSON.stringify(["b", "c"]),
            variantOptionMode: "FIXED",
            fixedVariantId: "gid://shopify/ProductVariant/1",
            sortOrder: 1,
          },
        ],
      }),
    );
    expect(result.offers).toHaveLength(2);
    expect(result.offers[0].targetIds).toEqual(["a"]);
    expect(result.offers[1].targetIds).toEqual(["b", "c"]);
    expect(result.offers[1].fixedVariantId).toBe("gid://shopify/ProductVariant/1");
  });
});
