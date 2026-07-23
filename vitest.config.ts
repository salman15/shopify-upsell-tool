import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: [
      "app/**/*.test.ts",
      "test/**/*.test.ts",
    ],
  },
});
