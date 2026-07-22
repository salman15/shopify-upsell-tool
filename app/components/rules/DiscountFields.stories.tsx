import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { DiscountFields, type DiscountFieldsProps } from "./DiscountFields";

// DiscountFields is a controlled component (value + onChange), so each story
// wraps it in a tiny stateful shell — Storybook's args flow in as the
// initial state, and edits made in the rendered controls actually stick,
// the same way they would inside the real rule editor's parent state.
function InteractiveDiscountFields(props: DiscountFieldsProps) {
  const [discountMode, setDiscountMode] = useState(props.discountMode);
  const [discountValue, setDiscountValue] = useState(props.discountValue);
  return (
    <DiscountFields
      discountMode={discountMode}
      discountValue={discountValue}
      onDiscountModeChange={setDiscountMode}
      onDiscountValueChange={setDiscountValue}
    />
  );
}

const meta: Meta<typeof DiscountFields> = {
  title: "Rules/DiscountFields",
  component: DiscountFields,
  render: (args) => <InteractiveDiscountFields {...args} />,
  argTypes: {
    discountMode: { control: "select", options: ["FREE", "PERCENTAGE", "FIXED"] },
  },
};
export default meta;

type Story = StoryObj<typeof DiscountFields>;

export const Free: Story = {
  args: { discountMode: "FREE", discountValue: 0 },
};

export const PercentageOff: Story = {
  args: { discountMode: "PERCENTAGE", discountValue: 25 },
};

export const FixedAmountOff: Story = {
  args: { discountMode: "FIXED", discountValue: 5 },
};
