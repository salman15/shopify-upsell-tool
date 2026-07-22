export type ToolType = "POPUP" | "CART_BUNDLE";
export type TargetType = "PRODUCT" | "COLLECTION";
export type DiscountMode = "FREE" | "PERCENTAGE" | "FIXED";
export type VariantOptionMode = "INDEPENDENT" | "MIRRORED" | "FIXED";
export type BorderRadius = "none" | "small" | "medium" | "large" | "pill";

export const BORDER_RADIUS_PX: Record<BorderRadius, string> = {
  none: "0px",
  small: "4px",
  medium: "8px",
  large: "16px",
  pill: "999px",
};

export type VariantOption = { id: string; title: string };

export type Selection = {
  id: string;
  title: string;
  image: string | null;
  variants?: VariantOption[];
};

export type OfferState = {
  targetType: TargetType;
  selections: Selection[];
  variantOptionMode: VariantOptionMode;
  fixedVariantId: string;
};
