import type { OfferState, TargetType, ToolType, VariantOptionMode } from "./types";

export type OfferEditorProps = {
  toolType: ToolType;
  offer: OfferState;
  canRemove: boolean;
  onTargetTypeChange: (value: TargetType) => void;
  onPick: () => void;
  onVariantModeChange: (value: VariantOptionMode) => void;
  onFixedVariantChange: (value: string) => void;
  onRemove: () => void;
};

// One bundle-component / radio-option slot in the rule editor's "Offer(s)"
// section — a target type + resource picker + (for cart-bundle rules) the
// variant-selection mode. `onPick` is injected by the caller rather than
// calling shopify.resourcePicker() directly, so this component has no
// App Bridge dependency and can be rendered (and story'd) standalone.
export function OfferEditor({
  toolType,
  offer,
  canRemove,
  onTargetTypeChange,
  onPick,
  onVariantModeChange,
  onFixedVariantChange,
  onRemove,
}: OfferEditorProps) {
  return (
    <s-box padding="base" borderWidth="base" borderRadius="base">
      <s-stack direction="block" gap="base">
        <s-select
          label="Offer type"
          value={offer.targetType}
          onChange={(e) => {
            if (e.currentTarget) onTargetTypeChange(e.currentTarget.value as TargetType);
          }}
        >
          <s-option value="PRODUCT">Specific products</s-option>
          <s-option value="COLLECTION">A collection</s-option>
        </s-select>
        <s-button onClick={onPick}>{offer.targetType === "PRODUCT" ? "Pick products" : "Pick collection"}</s-button>
        <s-stack direction="inline" gap="small">
          {offer.selections.map((s) => (
            <s-badge key={s.id}>{s.title}</s-badge>
          ))}
        </s-stack>
        {toolType === "CART_BUNDLE" && (
          <s-select
            label="Variant selection"
            value={offer.variantOptionMode}
            onChange={(e) => {
              if (e.currentTarget) onVariantModeChange(e.currentTarget.value as VariantOptionMode);
            }}
          >
            <s-option value="INDEPENDENT">Independent — customer picks freely</s-option>
            <s-option value="MIRRORED">Mirrored — default to anchor&apos;s option</s-option>
            <s-option value="FIXED">Fixed — always the same variant</s-option>
          </s-select>
        )}
        {toolType === "CART_BUNDLE" &&
          offer.variantOptionMode === "FIXED" &&
          (offer.targetType !== "PRODUCT" || offer.selections.length !== 1 ? (
            <s-paragraph>
              Fixed mode needs exactly one product picked above (not a collection) so there&apos;s a single variant
              list to choose from.
            </s-paragraph>
          ) : (
            <s-select
              label="Fixed variant"
              value={offer.fixedVariantId}
              onChange={(e) => {
                if (e.currentTarget) onFixedVariantChange(e.currentTarget.value);
              }}
            >
              <s-option value="">Select a variant…</s-option>
              {(offer.selections[0].variants ?? []).map((v) => (
                <s-option key={v.id} value={v.id}>
                  {v.title}
                </s-option>
              ))}
            </s-select>
          ))}
        {canRemove && (
          <s-button variant="tertiary" tone="critical" onClick={onRemove}>
            Remove this slot
          </s-button>
        )}
      </s-stack>
    </s-box>
  );
}
