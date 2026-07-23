// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

// upsell-common.js is a plain browser script — served as a classic (non-
// module) <script> tag by the theme, so it must never contain an `export`
// statement. That means it can't be `import()`ed and type-checked as an ES
// module the way a normal .ts file could. Instead, read its source and
// execute it directly: bare `window`/`document`/`sessionStorage` references
// inside resolve against jsdom's globals exactly as they would in a real
// browser, and it attaches window.UpsellCommon as a side effect — same
// runtime behavior as loading it via <script>, with no source changes.
//
// This file must live outside extensions/upsell-storefront entirely — the
// Shopify theme extension bundler only accepts assets/blocks/snippets/locales
// as top-level directories (and, within assets/, only a fixed allowlist of
// file extensions). Either violation fails the *entire* app preview at
// startup, not just this file — so this lives at the repo root instead.
let U: any;

beforeAll(() => {
  const code = readFileSync(
    join(__dirname, "../../extensions/upsell-storefront/assets/upsell-common.js"),
    "utf-8",
  );
  new Function(code)();
  U = (window as any).UpsellCommon;
});

beforeEach(() => {
  sessionStorage.clear();
});

describe("toGid", () => {
  it("builds a Shopify GID from a resource kind and legacy numeric id", () => {
    expect(U.toGid("Product", 123)).toBe("gid://shopify/Product/123");
    expect(U.toGid("ProductVariant", "456")).toBe("gid://shopify/ProductVariant/456");
  });
});

describe("formatMoney", () => {
  it("formats a decimal amount using the default USD currency", () => {
    expect(U.formatMoney(9.99)).toContain("9.99");
  });
});

describe("priceMarkup", () => {
  const variant = { price: "20.00" };

  it("shows a struck-through original price, Free, and the full amount saved for FREE mode", () => {
    const html = U.priceMarkup({ discount: { mode: "FREE", value: 0 } }, variant);
    expect(html).toContain("upsell-price-original");
    expect(html).toContain(">Free<");
    expect(html).toContain("Save");
    expect(html).toContain("20.00");
  });

  it("computes the discounted price and save label for PERCENTAGE mode", () => {
    const html = U.priceMarkup({ discount: { mode: "PERCENTAGE", value: 25 } }, variant);
    expect(html).toContain("15.00"); // 20 - 25%
    expect(html).toContain("Save 25%");
  });

  it("computes the discounted price and save label for FIXED mode", () => {
    const html = U.priceMarkup({ discount: { mode: "FIXED", value: 5 } }, variant);
    expect(html).toContain("15.00"); // 20 - 5
    expect(html).toContain("Save");
  });

  it("floors a FIXED discount at 0 rather than going negative", () => {
    const html = U.priceMarkup({ discount: { mode: "FIXED", value: 100 } }, { price: "5.00" });
    expect(html).toContain("$0.00");
    expect(html).not.toMatch(/-\$/);
  });
});

describe("pickMatchingRule", () => {
  function rule(overrides: Record<string, unknown> = {}) {
    return {
      id: "r1",
      priority: 0,
      triggerProductIds: ["gid://shopify/Product/1"],
      display: { maxImpressionsPerSession: 0 },
      ...overrides,
    };
  }

  it("returns null when no rule's trigger matches the added products", () => {
    const match = U.pickMatchingRule([rule()], ["gid://shopify/Product/999"]);
    expect(match).toBeNull();
  });

  it("returns the matching rule when a trigger id is among the added products", () => {
    const r = rule();
    const match = U.pickMatchingRule([r], ["gid://shopify/Product/1"]);
    expect(match).toBe(r);
  });

  it("picks the highest-priority rule when more than one matches", () => {
    const low = rule({ id: "low", priority: 1 });
    const high = rule({ id: "high", priority: 5 });
    const match = U.pickMatchingRule([low, high], ["gid://shopify/Product/1"]);
    expect(match.id).toBe("high");
  });

  it("excludes a rule once its per-session impression cap is reached", () => {
    const r = rule({ id: "capped", display: { maxImpressionsPerSession: 1 } });
    U.markShown("capped");
    expect(U.pickMatchingRule([r], ["gid://shopify/Product/1"])).toBeNull();
  });

  it("does not cap a rule when maxImpressionsPerSession is 0 (unlimited)", () => {
    const r = rule({ id: "uncapped", display: { maxImpressionsPerSession: 0 } });
    U.markShown("uncapped");
    U.markShown("uncapped");
    U.markShown("uncapped");
    expect(U.pickMatchingRule([r], ["gid://shopify/Product/1"])).toBe(r);
  });
});

describe("session storage helpers", () => {
  it("tracks how many times a rule has been shown", () => {
    expect(U.timesShown("r1")).toBe(0);
    U.markShown("r1");
    U.markShown("r1");
    expect(U.timesShown("r1")).toBe(2);
  });

  it("tracks whether a rule's offer was accepted, independently per rule", () => {
    expect(U.alreadyAccepted("r1")).toBe(false);
    U.markAccepted("r1");
    expect(U.alreadyAccepted("r1")).toBe(true);
    expect(U.alreadyAccepted("r2")).toBe(false);
  });
});

describe("applyDisplayStyles", () => {
  it("applies background, text, button colors and font to the container/button", () => {
    document.body.innerHTML = '<div id="c"><div class="upsell-option"></div></div>';
    const container = document.getElementById("c") as HTMLElement;
    const addBtn = document.createElement("button");

    U.applyDisplayStyles(container, addBtn, {
      backgroundColor: "#111111",
      textColor: "#222222",
      buttonColor: "#333333",
      buttonTextColor: "#444444",
      borderRadius: "large",
      fontFamily: "Georgia, serif",
    });

    expect(container.style.background).toBe("rgb(17, 17, 17)");
    expect(container.style.color).toBe("rgb(34, 34, 34)");
    expect(container.style.fontFamily).toBe("Georgia, serif");
    expect(container.style.borderRadius).toBe("16px");
    expect(addBtn.style.background).toBe("rgb(51, 51, 51)");
    expect(addBtn.style.color).toBe("rgb(68, 68, 68)");
    expect((container.querySelector(".upsell-option") as HTMLElement).style.borderRadius).toBe("16px");
  });

  it("maps pill radius on the container to a medium radius on its options", () => {
    document.body.innerHTML = '<div id="c"><div class="upsell-option"></div></div>';
    const container = document.getElementById("c") as HTMLElement;

    U.applyDisplayStyles(container, null, { borderRadius: "pill" });

    expect(container.style.borderRadius).toBe("999px");
    expect((container.querySelector(".upsell-option") as HTMLElement).style.borderRadius).toBe("8px");
  });

  it("leaves styles untouched for fields the rule didn't set", () => {
    document.body.innerHTML = '<div id="c"></div>';
    const container = document.getElementById("c") as HTMLElement;

    U.applyDisplayStyles(container, null, {});

    expect(container.style.background).toBe("");
    expect(container.style.borderRadius).toBe("");
  });
});
