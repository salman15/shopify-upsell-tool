import { z } from "zod";

export const toolTypeSchema = z.enum(["POPUP", "CART_BUNDLE"]);
export const targetTypeSchema = z.enum(["PRODUCT", "COLLECTION"]);
export const discountModeSchema = z.enum(["FREE", "PERCENTAGE", "FIXED"]);
export const variantOptionModeSchema = z.enum([
  "INDEPENDENT",
  "MIRRORED",
  "FIXED",
]);

export const offerInputSchema = z.object({
  targetType: targetTypeSchema,
  targetIds: z.array(z.string().min(1)).min(1, "Pick at least one product or collection"),
  variantOptionMode: variantOptionModeSchema.default("INDEPENDENT"),
  fixedVariantId: z.string().nullable().optional(),
  sortOrder: z.number().int().default(0),
});

export const ruleInputSchema = z
  .object({
    toolType: toolTypeSchema,
    enabled: z.boolean().default(true),
    name: z.string().min(1, "Give this rule an internal name"),
    priority: z.number().int().default(0),

    triggerType: targetTypeSchema,
    triggerIds: z.array(z.string().min(1)).min(1, "Pick at least one trigger product or collection"),

    discountMode: discountModeSchema.default("FREE"),
    discountValue: z.number().min(0).default(0),

    maxImpressionsPerSession: z.number().int().min(0).default(0),
    hideIfOfferAlreadyInCart: z.boolean().default(true),
    placement: z.string().default("default"),
    headline: z.string().nullable().optional(),
    subheading: z.string().nullable().optional(),
    buttonText: z.string().nullable().optional(),

    startAt: z.string().datetime().optional().or(z.literal("")),
    endAt: z.string().datetime().optional().or(z.literal("")),

    offers: z.array(offerInputSchema).min(1, "Add at least one offer"),
  })
  .refine(
    (rule) =>
      rule.discountMode === "FREE" ||
      (rule.discountValue > 0 &&
        (rule.discountMode !== "PERCENTAGE" || rule.discountValue <= 100)),
    {
      message: "Discount value must be > 0 (and ≤ 100 for percentage)",
      path: ["discountValue"],
    },
  );

export type RuleInput = z.infer<typeof ruleInputSchema>;
export type OfferInput = z.infer<typeof offerInputSchema>;

export const toolSettingsInputSchema = z.object({
  popupEnabled: z.boolean(),
  cartBundleEnabled: z.boolean(),
});

export type ToolSettingsInput = z.infer<typeof toolSettingsInputSchema>;
