import type { RunInput, FunctionRunResult, Discount } from "../generated/api";
import { DiscountApplicationStrategy } from "../generated/api";

const EMPTY_DISCOUNT: FunctionRunResult = {
  discountApplicationStrategy: DiscountApplicationStrategy.All,
  discounts: [],
};

// Written by the admin app (see app/lib/upsell/discount.server.ts) into
// this discount's own `$app:upsell-discount.function-configuration` metafield
// whenever a rule or the global tool settings change. Keyed by UpsellRule id,
// so the Function can independently re-derive the discount rather than
// trusting the (client-editable) cart line properties. triggerProductIds and
// offerProductIds are snapshots of which product GIDs satisfy this rule's
// trigger/offer (collections already expanded to their member products at
// config-build time).
type RuleDiscountConfig = {
  mode: "FREE" | "PERCENTAGE" | "FIXED";
  value: number;
  triggerProductIds: string[];
  offerProductIds: string[];
};

type Configuration = Record<string, RuleDiscountConfig>;

export function run(input: RunInput): FunctionRunResult {
  const configuration: Configuration = JSON.parse(
    input.discountNode?.metafield?.value ?? "{}",
  );

  if (Object.keys(configuration).length === 0) return EMPTY_DISCOUNT;

  const cartProductIds = new Set<string>();
  for (const line of input.cart.lines) {
    if (line.merchandise.__typename === "ProductVariant" && line.merchandise.product) {
      cartProductIds.add(line.merchandise.product.id);
    }
  }

  // A cart line, once chosen to carry one rule's discount, is removed from
  // further consideration — otherwise the same physical unit could be
  // "claimed" by two different rules, or one rule discounting the same line
  // twice, neither of which makes sense for a "buy X get 1 Y free" offer.
  const claimedLineIds = new Set<string>();
  const discounts: Discount[] = [];

  for (const [ruleId, rule] of Object.entries(configuration)) {
    // The trigger product must still be present somewhere in the cart —
    // otherwise a customer could add the trigger, accept the free/discounted
    // upsell item, then remove the trigger and keep the discount for free.
    const triggerStillInCart = rule.triggerProductIds.some((id) => cartProductIds.has(id));
    if (!triggerStillInCart) continue;

    // Prefer the line our own storefront UI tagged when the offer was
    // accepted (it reflects deliberate intent and lets multiple rules for
    // the same product disambiguate cleanly); if no tagged line remains
    // (e.g. removed and the product re-added normally, or the customer just
    // added it themselves without going through our popup/bundle), fall
    // back to any other untaken cart line for one of this rule's offer
    // products — matching how a native Shopify "buy X get Y" discount
    // behaves regardless of how the line was created.
    const candidates = input.cart.lines.filter((line) => {
      if (claimedLineIds.has(line.id)) return false;
      if (line.merchandise.__typename !== "ProductVariant" || !line.merchandise.product) return false;
      return rule.offerProductIds.includes(line.merchandise.product.id);
    });
    if (candidates.length === 0) continue;

    const taggedCandidate = candidates.find((line) => line.attribute?.value === ruleId);
    const chosen = taggedCandidate ?? candidates[0];
    claimedLineIds.add(chosen.id);

    // Cap at 1 unit regardless of the line's actual quantity — a "buy X get
    // 1 Y free" offer discounts exactly one unit, not the whole line. Without
    // this, bumping the quantity of a free line would make every extra unit
    // free too.
    const target = { cartLine: { id: chosen.id, quantity: 1 } } as const;

    if (rule.mode === "FREE") {
      discounts.push({
        targets: [target],
        value: { percentage: { value: 100 } },
        message: "Free with your order",
      });
    } else if (rule.mode === "PERCENTAGE") {
      discounts.push({
        targets: [target],
        value: { percentage: { value: rule.value } },
        message: `${rule.value}% off upsell item`,
      });
    } else {
      discounts.push({
        targets: [target],
        value: { fixedAmount: { amount: rule.value, appliesToEachItem: true } },
        message: "Upsell discount",
      });
    }
  }

  if (discounts.length === 0) return EMPTY_DISCOUNT;

  return {
    discountApplicationStrategy: DiscountApplicationStrategy.All,
    discounts,
  };
}
