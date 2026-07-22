import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { OfferEditor } from "./OfferEditor";
import type { OfferState, ToolType } from "./types";

function InteractiveOfferEditor(props: { toolType: ToolType; offer: OfferState; canRemove: boolean }) {
  const [offer, setOffer] = useState(props.offer);

  return (
    <OfferEditor
      toolType={props.toolType}
      offer={offer}
      canRemove={props.canRemove}
      onTargetTypeChange={(targetType) => setOffer((o) => ({ ...o, targetType, selections: [] }))}
      onPick={() => {
        // The real editor calls shopify.resourcePicker() here, which needs a
        // live App Bridge session that isn't available in Storybook —
        // simulate picking a product instead so the badges and (for cart
        // bundle rules) the variant fields stay explorable.
        setOffer((o) => ({
          ...o,
          selections: [
            {
              id: "gid://shopify/Product/1",
              title: "Mouth Spray Refill – Citrus",
              image: null,
              variants: [
                { id: "gid://shopify/ProductVariant/1", title: "Citrus" },
                { id: "gid://shopify/ProductVariant/2", title: "Mint" },
              ],
            },
          ],
        }));
      }}
      onVariantModeChange={(variantOptionMode) => setOffer((o) => ({ ...o, variantOptionMode }))}
      onFixedVariantChange={(fixedVariantId) => setOffer((o) => ({ ...o, fixedVariantId }))}
      onRemove={() => {}}
    />
  );
}

const meta: Meta<typeof InteractiveOfferEditor> = {
  title: "Rules/OfferEditor",
  component: InteractiveOfferEditor,
  argTypes: {
    toolType: { control: "select", options: ["POPUP", "CART_BUNDLE"] },
  },
};
export default meta;

type Story = StoryObj<typeof InteractiveOfferEditor>;

export const PopupEmptySlot: Story = {
  args: {
    toolType: "POPUP",
    canRemove: false,
    offer: { targetType: "PRODUCT", selections: [], variantOptionMode: "INDEPENDENT", fixedVariantId: "" },
  },
};

export const PopupWithSelection: Story = {
  args: {
    toolType: "POPUP",
    canRemove: true,
    offer: {
      targetType: "PRODUCT",
      selections: [{ id: "gid://shopify/Product/1", title: "Mouth Spray Refill – Citrus", image: null }],
      variantOptionMode: "INDEPENDENT",
      fixedVariantId: "",
    },
  },
};

export const CartBundleIndependentVariants: Story = {
  args: {
    toolType: "CART_BUNDLE",
    canRemove: true,
    offer: {
      targetType: "PRODUCT",
      selections: [
        {
          id: "gid://shopify/Product/1",
          title: "Mouth Spray Refill",
          image: null,
          variants: [
            { id: "gid://shopify/ProductVariant/1", title: "Citrus" },
            { id: "gid://shopify/ProductVariant/2", title: "Mint" },
          ],
        },
      ],
      variantOptionMode: "INDEPENDENT",
      fixedVariantId: "",
    },
  },
};

export const CartBundleFixedVariant: Story = {
  args: {
    toolType: "CART_BUNDLE",
    canRemove: true,
    offer: {
      targetType: "PRODUCT",
      selections: [
        {
          id: "gid://shopify/Product/1",
          title: "Mouth Spray Refill",
          image: null,
          variants: [
            { id: "gid://shopify/ProductVariant/1", title: "Citrus" },
            { id: "gid://shopify/ProductVariant/2", title: "Mint" },
          ],
        },
      ],
      variantOptionMode: "FIXED",
      fixedVariantId: "gid://shopify/ProductVariant/1",
    },
  },
};

export const CartBundleFixedModeNeedsAProduct: Story = {
  args: {
    toolType: "CART_BUNDLE",
    canRemove: true,
    offer: {
      targetType: "COLLECTION",
      selections: [{ id: "gid://shopify/Collection/1", title: "Refills collection", image: null }],
      variantOptionMode: "FIXED",
      fixedVariantId: "",
    },
  },
};
