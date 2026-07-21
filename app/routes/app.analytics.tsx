import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";
import { getRuleStats } from "../lib/upsell/analytics.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const stats = await getRuleStats(session.shop);
  return { stats };
};

const TOOL_LABEL: Record<string, string> = {
  POPUP: "Post-add-to-cart popup",
  CART_BUNDLE: "Cart bundle",
};

function formatRate(rate: number | null) {
  return rate === null ? "—" : `${Math.round(rate * 100)}%`;
}

export default function Analytics() {
  const { stats } = useLoaderData<typeof loader>();

  return (
    <s-page heading="Upsell analytics">
      <s-section heading="Performance by rule">
        {stats.length === 0 ? (
          <s-paragraph>
            No rules yet. <s-link href="/app/rules/new">Create one</s-link> to start
            collecting data.
          </s-paragraph>
        ) : (
          <s-table>
            <s-table-header-row>
              <s-table-header>Rule</s-table-header>
              <s-table-header>Tool</s-table-header>
              <s-table-header>Status</s-table-header>
              <s-table-header>Shown</s-table-header>
              <s-table-header>Accepted</s-table-header>
              <s-table-header>Dismissed</s-table-header>
              <s-table-header>Conversion</s-table-header>
            </s-table-header-row>
            <s-table-body>
              {stats.map((row) => (
                <s-table-row key={row.ruleId}>
                  <s-table-cell>
                    <s-link href={`/app/rules/${row.ruleId}`}>{row.name}</s-link>
                  </s-table-cell>
                  <s-table-cell>{TOOL_LABEL[row.toolType] ?? row.toolType}</s-table-cell>
                  <s-table-cell>
                    <s-badge tone={row.enabled ? "success" : undefined}>
                      {row.enabled ? "Enabled" : "Disabled"}
                    </s-badge>
                  </s-table-cell>
                  <s-table-cell>{row.shown}</s-table-cell>
                  <s-table-cell>{row.accepted}</s-table-cell>
                  <s-table-cell>{row.dismissed}</s-table-cell>
                  <s-table-cell>{formatRate(row.conversionRate)}</s-table-cell>
                </s-table-row>
              ))}
            </s-table-body>
          </s-table>
        )}
      </s-section>
      <s-section slot="aside" heading="About this data">
        <s-paragraph>
          &quot;Shown&quot; counts each time a popup or bundle module was
          displayed to a customer (capped by that rule&apos;s session
          impression limit). &quot;Accepted&quot; counts successful
          add-to-carts from that module. &quot;Conversion&quot; is accepted ÷
          shown.
        </s-paragraph>
      </s-section>
    </s-page>
  );
}
