import type { RunInput, FunctionRunResult, Discount } from "../generated/api";
import { DiscountApplicationStrategy } from "../generated/api";

const EMPTY_DISCOUNT: FunctionRunResult = {
  discountApplicationStrategy: DiscountApplicationStrategy.All,
  discounts: [],
};

// Written by the admin app (see app/lib/upsell/discountConfig.server.ts) into
// this discount's own `$app:upsell-discount.function-configuration` metafield
// whenever a rule or the global tool settings change. Keyed by UpsellRule id,
// so the Function can independently re-derive the discount rather than
// trusting the (client-editable) cart line properties.
type RuleDiscountConfig = {
  mode: "FREE" | "PERCENTAGE" | "FIXED";
  value: number;
};

type Configuration = Record<string, RuleDiscountConfig>;

export function run(input: RunInput): FunctionRunResult {
  const configuration: Configuration = JSON.parse(
    input.discountNode?.metafield?.value ?? "{}",
  );

  if (Object.keys(configuration).length === 0) return EMPTY_DISCOUNT;

  const discounts: Discount[] = [];

  for (const line of input.cart.lines) {
    const ruleId = line.attribute?.value;
    if (!ruleId) continue;

    const rule = configuration[ruleId];
    if (!rule) continue;

    if (line.merchandise.__typename !== "ProductVariant") continue;

    const target = { cartLine: { id: line.id } } as const;

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
