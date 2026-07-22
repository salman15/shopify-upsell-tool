import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: [
      "app/**/*.test.ts",
      "extensions/upsell-storefront/**/*.test.ts",
    ],
  },
});
