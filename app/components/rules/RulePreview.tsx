import { BORDER_RADIUS_PX, type BorderRadius, type DiscountMode } from "./types";

export type RulePreviewProps = {
  backgroundColor: string;
  textColor: string;
  fontFamily: string;
  borderRadius: BorderRadius;
  headline: string;
  subheading: string;
  discountMode: DiscountMode;
  discountValue: number;
  buttonColor: string;
  buttonTextColor: string;
  buttonText: string;
};

// Approximate, static mockup of how a rule's headline/subheading/option/button
// will look on the storefront — mirrors the inline styles the theme extension
// applies via applyDisplayStyles() in upsell-common.js, so a merchant sees the
// same colors/radius/font here as customers eventually will.
export function RulePreview({
  backgroundColor,
  textColor,
  fontFamily,
  borderRadius,
  headline,
  subheading,
  discountMode,
  discountValue,
  buttonColor,
  buttonTextColor,
  buttonText,
}: RulePreviewProps) {
  return (
    <div
      style={{
        background: backgroundColor || "#ffffff",
        color: textColor || "#1a1a1a",
        fontFamily: fontFamily || "inherit",
        border: "1px solid rgba(0,0,0,0.1)",
        borderRadius: BORDER_RADIUS_PX[borderRadius],
        padding: 16,
      }}
    >
      {headline && <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 2 }}>{headline}</div>}
      {subheading && <div style={{ opacity: 0.7, fontSize: 13, marginBottom: 10 }}>{subheading}</div>}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          border: "1px solid rgba(0,0,0,0.15)",
          borderRadius: BORDER_RADIUS_PX[borderRadius === "pill" ? "medium" : borderRadius],
          padding: 8,
          marginBottom: 10,
        }}
      >
        <div style={{ width: 32, height: 32, borderRadius: 4, background: "rgba(0,0,0,0.08)", flexShrink: 0 }} />
        <span style={{ flex: 1, fontSize: 13 }}>Sample product</span>
        <span style={{ fontSize: 13, fontWeight: 600 }}>
          {discountMode === "FREE"
            ? "Free"
            : discountMode === "PERCENTAGE"
              ? `${discountValue}% off`
              : `$${discountValue} off`}
        </span>
      </div>
      <div
        style={{
          background: buttonColor || "#1a1a1a",
          color: buttonTextColor || "#ffffff",
          borderRadius: BORDER_RADIUS_PX[borderRadius],
          textAlign: "center",
          padding: "10px 0",
          fontSize: 14,
        }}
      >
        {buttonText || "Add to cart"}
      </div>
    </div>
  );
}
