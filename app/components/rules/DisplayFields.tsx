import type { BorderRadius } from "./types";

export type DisplayFieldsProps = {
  headline: string;
  subheading: string;
  buttonText: string;
  backgroundColor: string;
  textColor: string;
  buttonColor: string;
  buttonTextColor: string;
  borderRadius: BorderRadius;
  fontFamily: string;
  maxImpressions: number;
  hideIfInCart: boolean;
  onHeadlineChange: (value: string) => void;
  onSubheadingChange: (value: string) => void;
  onButtonTextChange: (value: string) => void;
  onBackgroundColorChange: (value: string) => void;
  onTextColorChange: (value: string) => void;
  onButtonColorChange: (value: string) => void;
  onButtonTextColorChange: (value: string) => void;
  onBorderRadiusChange: (value: BorderRadius) => void;
  onFontFamilyChange: (value: string) => void;
  onMaxImpressionsChange: (value: number) => void;
  onHideIfInCartChange: (value: boolean) => void;
};

export function DisplayFields({
  headline,
  subheading,
  buttonText,
  backgroundColor,
  textColor,
  buttonColor,
  buttonTextColor,
  borderRadius,
  fontFamily,
  maxImpressions,
  hideIfInCart,
  onHeadlineChange,
  onSubheadingChange,
  onButtonTextChange,
  onBackgroundColorChange,
  onTextColorChange,
  onButtonColorChange,
  onButtonTextColorChange,
  onBorderRadiusChange,
  onFontFamilyChange,
  onMaxImpressionsChange,
  onHideIfInCartChange,
}: DisplayFieldsProps) {
  return (
    <s-stack direction="block" gap="base">
      <s-text-field
        label="Headline"
        value={headline}
        onChange={(e) => {
          if (e.currentTarget) onHeadlineChange(e.currentTarget.value);
        }}
      />
      <s-text-field
        label="Subheading"
        value={subheading}
        onChange={(e) => {
          if (e.currentTarget) onSubheadingChange(e.currentTarget.value);
        }}
      />
      <s-text-field
        label="Button text"
        value={buttonText}
        onChange={(e) => {
          if (e.currentTarget) onButtonTextChange(e.currentTarget.value);
        }}
      />
      <s-color-field
        label="Background color"
        value={backgroundColor}
        onChange={(e) => {
          if (e.currentTarget) onBackgroundColorChange(e.currentTarget.value);
        }}
      />
      <s-color-field
        label="Text color"
        value={textColor}
        onChange={(e) => {
          if (e.currentTarget) onTextColorChange(e.currentTarget.value);
        }}
      />
      <s-color-field
        label="Button color"
        value={buttonColor}
        onChange={(e) => {
          if (e.currentTarget) onButtonColorChange(e.currentTarget.value);
        }}
      />
      <s-color-field
        label="Button text color"
        value={buttonTextColor}
        onChange={(e) => {
          if (e.currentTarget) onButtonTextColorChange(e.currentTarget.value);
        }}
      />
      <s-select
        label="Corner style"
        value={borderRadius}
        onChange={(e) => {
          if (e.currentTarget) onBorderRadiusChange(e.currentTarget.value as BorderRadius);
        }}
      >
        <s-option value="none">Square</s-option>
        <s-option value="small">Slightly rounded</s-option>
        <s-option value="medium">Rounded</s-option>
        <s-option value="large">Very rounded</s-option>
        <s-option value="pill">Pill</s-option>
      </s-select>
      <s-text-field
        label="Font family"
        value={fontFamily}
        onChange={(e) => {
          if (e.currentTarget) onFontFamilyChange(e.currentTarget.value);
        }}
        details="CSS font-family value, e.g. Georgia, serif. Leave blank to match your theme's font."
      />
      <s-number-field
        label="Max times shown per session (0 = unlimited)"
        value={String(maxImpressions)}
        onChange={(e) => {
          if (e.currentTarget) onMaxImpressionsChange(Number(e.currentTarget.value));
        }}
      />
      <s-checkbox
        label="Hide if offer item is already in cart"
        {...(hideIfInCart ? { checked: true } : {})}
        onChange={(e) => {
          if (e.currentTarget) onHideIfInCartChange(e.currentTarget.checked);
        }}
      />
    </s-stack>
  );
}
