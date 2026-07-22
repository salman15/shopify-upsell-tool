import type { Preview } from "@storybook/react-vite";

const preview: Preview = {
  parameters: {
    controls: { expanded: true },
    layout: "padded",
  },
  decorators: [
    (Story) => (
      <div style={{ fontFamily: "Inter, sans-serif", maxWidth: 420 }}>
        <Story />
      </div>
    ),
  ],
};

export default preview;
