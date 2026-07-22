import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./rules.server", () => ({
  getToolSettings: vi.fn(),
  listRules: vi.fn(),
}));

import { buildDiscountConfiguration } from "./discount.server";
import { getToolSettings, listRules } from "./rules.server";

type Settings = Awaited<ReturnType<typeof getToolSettings>>;
type Rules = Awaited<ReturnType<typeof listRules>>;
type AdminArg = Parameters<typeof buildDiscountConfiguration>[0];

type FakeOffer = { targetType: string; targetIds: string[] };
type FakeRule = {
  id: string;
  toolType: string;
  enabled: boolean;
  startAt: Date | null;
  endAt: Date | null;
  triggerType: string;
  triggerIds: string[];
  discountMode: string;
  discountValue: number;
  offers: FakeOffer[];
};

function mockSettings(settings: { popupEnabled: boolean; cartBundleEnabled: boolean }) {
  vi.mocked(getToolSettings).mockResolvedValue(settings as unknown as Settings);
}

function mockRules(rules: FakeRule[]) {
  vi.mocked(listRules).mockResolvedValue(rules as unknown as Rules);
}

// Fakes the Admin GraphQL client's collection->products lookup used to
// expand COLLECTION-type triggers/offers into product id snapshots.
function fakeAdmin(collectionProducts: Record<string, string[]> = {}): AdminArg {
  return {
    graphql: vi.fn(async (_query: string, opts: { variables: { id: string } }) => {
      const nodes = (collectionProducts[opts.variables.id] || []).map((id) => ({ id }));
      return {
        json: async () => ({ data: { collection: { products: { nodes } } } }),
      };
    }),
  } as unknown as AdminArg;
}

function fakeRule(overrides: Partial<FakeRule> = {}): FakeRule {
  return {
    id: "rule_1",
    toolType: "POPUP",
    enabled: true,
    startAt: null,
    endAt: null,
    triggerType: "PRODUCT",
    triggerIds: ["gid://shopify/Product/1"],
    discountMode: "FREE",
    discountValue: 0,
    offers: [{ targetType: "PRODUCT", targetIds: ["gid://shopify/Product/2"] }],
    ...overrides,
  };
}

beforeEach(() => {
  vi.mocked(getToolSettings).mockReset();
  vi.mocked(listRules).mockReset();
});

describe("buildDiscountConfiguration", () => {
  it("excludes a disabled rule", async () => {
    mockSettings({ popupEnabled: true, cartBundleEnabled: true });
    mockRules([fakeRule({ enabled: false })]);

    const config = await buildDiscountConfiguration(fakeAdmin(), "shop.myshopify.com");
    expect(config).toEqual({});
  });

  it("excludes a rule whose tool is globally disabled", async () => {
    mockSettings({ popupEnabled: false, cartBundleEnabled: true });
    mockRules([fakeRule({ toolType: "POPUP" })]);

    const config = await buildDiscountConfiguration(fakeAdmin(), "shop.myshopify.com");
    expect(config).toEqual({});
  });

  it("excludes a rule scheduled to start in the future", async () => {
    mockSettings({ popupEnabled: true, cartBundleEnabled: true });
    const future = new Date(Date.now() + 1000 * 60 * 60 * 24);
    mockRules([fakeRule({ startAt: future })]);

    const config = await buildDiscountConfiguration(fakeAdmin(), "shop.myshopify.com");
    expect(config).toEqual({});
  });

  it("excludes a rule scheduled to have already ended", async () => {
    mockSettings({ popupEnabled: true, cartBundleEnabled: true });
    const past = new Date(Date.now() - 1000 * 60 * 60 * 24);
    mockRules([fakeRule({ endAt: past })]);

    const config = await buildDiscountConfiguration(fakeAdmin(), "shop.myshopify.com");
    expect(config).toEqual({});
  });

  it("includes an enabled, in-schedule rule with PRODUCT ids passed through directly", async () => {
    mockSettings({ popupEnabled: true, cartBundleEnabled: true });
    mockRules([fakeRule()]);

    const config = await buildDiscountConfiguration(fakeAdmin(), "shop.myshopify.com");
    expect(config["rule_1"]).toEqual({
      mode: "FREE",
      value: 0,
      triggerProductIds: ["gid://shopify/Product/1"],
      offerProductIds: ["gid://shopify/Product/2"],
    });
  });

  it("expands a COLLECTION trigger to its member product ids", async () => {
    mockSettings({ popupEnabled: true, cartBundleEnabled: true });
    mockRules([fakeRule({ triggerType: "COLLECTION", triggerIds: ["gid://shopify/Collection/1"] })]);
    const admin = fakeAdmin({
      "gid://shopify/Collection/1": ["gid://shopify/Product/10", "gid://shopify/Product/11"],
    });

    const config = await buildDiscountConfiguration(admin, "shop.myshopify.com");
    expect(config["rule_1"].triggerProductIds.sort()).toEqual([
      "gid://shopify/Product/10",
      "gid://shopify/Product/11",
    ]);
  });

  it("expands and de-dupes offer product ids across multiple offers/collections", async () => {
    mockSettings({ popupEnabled: true, cartBundleEnabled: true });
    mockRules([
      fakeRule({
        offers: [
          { targetType: "COLLECTION", targetIds: ["gid://shopify/Collection/A"] },
          { targetType: "PRODUCT", targetIds: ["gid://shopify/Product/20"] },
        ],
      }),
    ]);
    const admin = fakeAdmin({
      "gid://shopify/Collection/A": ["gid://shopify/Product/20", "gid://shopify/Product/21"],
    });

    const config = await buildDiscountConfiguration(admin, "shop.myshopify.com");
    expect(config["rule_1"].offerProductIds.sort()).toEqual([
      "gid://shopify/Product/20",
      "gid://shopify/Product/21",
    ]);
  });

  it("builds independent config entries for multiple qualifying rules", async () => {
    mockSettings({ popupEnabled: true, cartBundleEnabled: true });
    mockRules([
      fakeRule({ id: "rule_a", discountMode: "PERCENTAGE", discountValue: 20 }),
      fakeRule({ id: "rule_b", discountMode: "FIXED", discountValue: 5 }),
    ]);

    const config = await buildDiscountConfiguration(fakeAdmin(), "shop.myshopify.com");
    expect(Object.keys(config).sort()).toEqual(["rule_a", "rule_b"]);
    expect(config["rule_a"].mode).toBe("PERCENTAGE");
    expect(config["rule_b"].mode).toBe("FIXED");
  });
});
