import type { DiscountMode } from "./types";

export type DiscountFieldsProps = {
  discountMode: DiscountMode;
  discountValue: number;
  onDiscountModeChange: (mode: DiscountMode) => void;
  onDiscountValueChange: (value: number) => void;
};

export function DiscountFields({
  discountMode,
  discountValue,
  onDiscountModeChange,
  onDiscountValueChange,
}: DiscountFieldsProps) {
  return (
    <s-stack direction="block" gap="base">
      <s-select
        label="Discount mode"
        value={discountMode}
        onChange={(e) => {
          if (e.currentTarget) onDiscountModeChange(e.currentTarget.value as DiscountMode);
        }}
      >
        <s-option value="FREE">Free</s-option>
        <s-option value="PERCENTAGE">Percentage off</s-option>
        <s-option value="FIXED">Fixed amount off</s-option>
      </s-select>
      {discountMode !== "FREE" && (
        <s-number-field
          label={discountMode === "PERCENTAGE" ? "Percent off" : "Amount off"}
          value={String(discountValue)}
          onChange={(e) => {
            if (e.currentTarget) onDiscountValueChange(Number(e.currentTarget.value));
          }}
        />
      )}
    </s-stack>
  );
}
