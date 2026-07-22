import type { Meta, StoryObj } from "@storybook/react-vite";
import { RulePreview } from "./RulePreview";

const meta: Meta<typeof RulePreview> = {
  title: "Rules/RulePreview",
  component: RulePreview,
  argTypes: {
    borderRadius: {
      control: "select",
      options: ["none", "small", "medium", "large", "pill"],
    },
    discountMode: {
      control: "select",
      options: ["FREE", "PERCENTAGE", "FIXED"],
    },
  },
};
export default meta;

type Story = StoryObj<typeof RulePreview>;

const base = {
  backgroundColor: "#ffffff",
  textColor: "#1a1a1a",
  fontFamily: "",
  borderRadius: "medium" as const,
  headline: "Complete your routine",
  subheading: "Add a refill and save",
  buttonColor: "#1a1a1a",
  buttonTextColor: "#ffffff",
  buttonText: "Add to cart",
};

export const Free: Story = {
  args: { ...base, discountMode: "FREE", discountValue: 0 },
};

export const PercentageOff: Story = {
  args: { ...base, discountMode: "PERCENTAGE", discountValue: 25 },
};

export const FixedAmountOff: Story = {
  args: { ...base, discountMode: "FIXED", discountValue: 5 },
};

export const PillButtonsCustomBrandColors: Story = {
  args: {
    ...base,
    discountMode: "PERCENTAGE",
    discountValue: 20,
    borderRadius: "pill",
    backgroundColor: "#fef6f0",
    textColor: "#7a3b12",
    buttonColor: "#d9622b",
    buttonTextColor: "#ffffff",
  },
};

export const NoHeadlineOrSubheading: Story = {
  args: { ...base, headline: "", subheading: "", discountMode: "FREE", discountValue: 0 },
};

export const SquareCorners: Story = {
  args: { ...base, borderRadius: "none", discountMode: "FIXED", discountValue: 10 },
};
