import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { DisplayFields, type DisplayFieldsProps } from "./DisplayFields";

type Values = Pick<
  DisplayFieldsProps,
  | "headline"
  | "subheading"
  | "buttonText"
  | "backgroundColor"
  | "textColor"
  | "buttonColor"
  | "buttonTextColor"
  | "borderRadius"
  | "fontFamily"
  | "maxImpressions"
  | "hideIfInCart"
>;

// DisplayFields is a controlled component driven entirely by its parent's
// state in the real rule editor — this wrapper reproduces just enough of
// that so the color pickers, radius select, and checkbox are actually
// editable inside Storybook rather than frozen at their initial args.
function InteractiveDisplayFields(props: Values) {
  const [headline, setHeadline] = useState(props.headline);
  const [subheading, setSubheading] = useState(props.subheading);
  const [buttonText, setButtonText] = useState(props.buttonText);
  const [backgroundColor, setBackgroundColor] = useState(props.backgroundColor);
  const [textColor, setTextColor] = useState(props.textColor);
  const [buttonColor, setButtonColor] = useState(props.buttonColor);
  const [buttonTextColor, setButtonTextColor] = useState(props.buttonTextColor);
  const [borderRadius, setBorderRadius] = useState(props.borderRadius);
  const [fontFamily, setFontFamily] = useState(props.fontFamily);
  const [maxImpressions, setMaxImpressions] = useState(props.maxImpressions);
  const [hideIfInCart, setHideIfInCart] = useState(props.hideIfInCart);

  return (
    <DisplayFields
      headline={headline}
      subheading={subheading}
      buttonText={buttonText}
      backgroundColor={backgroundColor}
      textColor={textColor}
      buttonColor={buttonColor}
      buttonTextColor={buttonTextColor}
      borderRadius={borderRadius}
      fontFamily={fontFamily}
      maxImpressions={maxImpressions}
      hideIfInCart={hideIfInCart}
      onHeadlineChange={setHeadline}
      onSubheadingChange={setSubheading}
      onButtonTextChange={setButtonText}
      onBackgroundColorChange={setBackgroundColor}
      onTextColorChange={setTextColor}
      onButtonColorChange={setButtonColor}
      onButtonTextColorChange={setButtonTextColor}
      onBorderRadiusChange={setBorderRadius}
      onFontFamilyChange={setFontFamily}
      onMaxImpressionsChange={setMaxImpressions}
      onHideIfInCartChange={setHideIfInCart}
    />
  );
}

const meta: Meta<Values> = {
  title: "Rules/DisplayFields",
  render: (args) => <InteractiveDisplayFields {...args} />,
  argTypes: {
    borderRadius: {
      control: "select",
      options: ["none", "small", "medium", "large", "pill"],
    },
  },
};
export default meta;

type Story = StoryObj<Values>;

export const Defaults: Story = {
  args: {
    headline: "",
    subheading: "",
    buttonText: "",
    backgroundColor: "#ffffff",
    textColor: "#1a1a1a",
    buttonColor: "#1a1a1a",
    buttonTextColor: "#ffffff",
    borderRadius: "medium",
    fontFamily: "",
    maxImpressions: 0,
    hideIfInCart: true,
  },
};

export const FilledIn: Story = {
  args: {
    headline: "Complete your routine",
    subheading: "Add a refill and save",
    buttonText: "Add to cart",
    backgroundColor: "#fef6f0",
    textColor: "#7a3b12",
    buttonColor: "#d9622b",
    buttonTextColor: "#ffffff",
    borderRadius: "pill",
    fontFamily: "Georgia, serif",
    maxImpressions: 3,
    hideIfInCart: false,
  },
};
