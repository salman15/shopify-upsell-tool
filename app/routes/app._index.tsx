import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { getToolSettings, listRules } from "../lib/upsell/rules.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const [settings, rules] = await Promise.all([
    getToolSettings(session.shop),
    listRules(session.shop),
  ]);

  return {
    settings,
    ruleCount: rules.length,
    activeRuleCount: rules.filter((r) => r.enabled).length,
    popupRuleCount: rules.filter((r) => r.toolType === "POPUP").length,
    bundleRuleCount: rules.filter((r) => r.toolType === "CART_BUNDLE").length,
  };
};

export default function Index() {
  const { settings, ruleCount, activeRuleCount, popupRuleCount, bundleRuleCount } =
    useLoaderData<typeof loader>();

  return (
    <s-page heading="Upsell tools">
      <s-button slot="primary-action" onClick={() => (window.location.href = "/app/rules/new")}>
        Create rule
      </s-button>

      <s-section heading="Overview">
        <s-stack direction="inline" gap="large">
          <s-box padding="base" borderWidth="base" borderRadius="base">
            <s-stack direction="block" gap="small">
              <s-text>Total rules</s-text>
              <s-heading>{ruleCount}</s-heading>
            </s-stack>
          </s-box>
          <s-box padding="base" borderWidth="base" borderRadius="base">
            <s-stack direction="block" gap="small">
              <s-text>Active rules</s-text>
              <s-heading>{activeRuleCount}</s-heading>
            </s-stack>
          </s-box>
          <s-box padding="base" borderWidth="base" borderRadius="base">
            <s-stack direction="block" gap="small">
              <s-text>Popup rules (A)</s-text>
              <s-heading>{popupRuleCount}</s-heading>
            </s-stack>
          </s-box>
          <s-box padding="base" borderWidth="base" borderRadius="base">
            <s-stack direction="block" gap="small">
              <s-text>Cart bundle rules (B)</s-text>
              <s-heading>{bundleRuleCount}</s-heading>
            </s-stack>
          </s-box>
        </s-stack>
      </s-section>

      <s-section heading="Tool status">
        <s-stack direction="block" gap="small">
          <s-paragraph>
            Post-add-to-cart popup:{" "}
            <s-badge tone={settings.popupEnabled ? "success" : "critical"}>
              {settings.popupEnabled ? "On" : "Off"}
            </s-badge>
          </s-paragraph>
          <s-paragraph>
            Cart bundle builder:{" "}
            <s-badge tone={settings.cartBundleEnabled ? "success" : "critical"}>
              {settings.cartBundleEnabled ? "On" : "Off"}
            </s-badge>
          </s-paragraph>
        </s-stack>
        <s-link href="/app/settings">Manage global settings</s-link>
      </s-section>

      <s-section slot="aside" heading="Get started">
        <s-unordered-list>
          <s-list-item>
            <s-link href="/app/rules">View and manage upsell rules</s-link>
          </s-list-item>
          <s-list-item>
            <s-link href="/app/rules/new">Create a new rule</s-link>
          </s-list-item>
          <s-list-item>
            <s-link href="/app/settings">Toggle tools on/off globally</s-link>
          </s-list-item>
        </s-unordered-list>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
