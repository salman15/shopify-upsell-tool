import type { StorybookConfig } from "@storybook/react-vite";

// @storybook/builder-vite auto-discovers and merges the project's root
// vite.config.ts. That config wires up the @react-router/dev Vite plugin
// (route file-system conventions, SSR build, etc.), which throws
// ("requires the use of a Vite config file") when Vite is invoked
// programmatically by Storybook's builder instead of via the real
// react-router CLI. None of that plugin applies to rendering plain
// components in isolation anyway, so viteFinal strips it back out of the
// merged config.
function stripReactRouterPlugins(plugins: unknown[]): unknown[] {
  return plugins
    .map((plugin) => (Array.isArray(plugin) ? stripReactRouterPlugins(plugin) : plugin))
    .filter((plugin) => {
      if (Array.isArray(plugin)) return plugin.length > 0;
      const name = (plugin as { name?: string } | null | undefined)?.name ?? "";
      return !name.includes("react-router");
    });
}

const config: StorybookConfig = {
  stories: ["../app/components/**/*.stories.@(ts|tsx)"],
  addons: [],
  framework: {
    name: "@storybook/react-vite",
    options: {},
  },
  async viteFinal(viteConfig) {
    return {
      ...viteConfig,
      plugins: stripReactRouterPlugins(viteConfig.plugins ?? []),
    };
  },
};

export default config;
