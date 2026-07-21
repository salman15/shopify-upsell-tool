import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { useFetcher, useLoaderData, useNavigate } from "react-router";
import { authenticate } from "../shopify.server";
import { deleteRule, listRules, setRuleEnabled } from "../lib/upsell/rules.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const rules = await listRules(session.shop);
  return { rules };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent");
  const id = String(formData.get("id"));

  if (intent === "toggle") {
    await setRuleEnabled(session.shop, id, formData.get("enabled") === "true");
  } else if (intent === "delete") {
    await deleteRule(session.shop, id);
  }

  return { ok: true };
};

const TOOL_LABEL: Record<string, string> = {
  POPUP: "Post-add-to-cart popup",
  CART_BUNDLE: "Cart bundle",
};

export default function RulesIndex() {
  const { rules } = useLoaderData<typeof loader>();
  const fetcher = useFetcher();
  const navigate = useNavigate();

  return (
    <s-page heading="Upsell rules">
      <s-button slot="primary-action" onClick={() => navigate("/app/rules/new")}>
        Create rule
      </s-button>
      <s-section heading="All rules">
        {rules.length === 0 && (
          <s-paragraph>
            No rules yet.{" "}
            <s-link href="/app/rules/new">Create your first upsell rule</s-link>{" "}
            to get started.
          </s-paragraph>
        )}
        {rules.length > 0 && (
          <s-table>
            <s-table-header-row>
              <s-table-header>Name</s-table-header>
              <s-table-header>Tool</s-table-header>
              <s-table-header>Trigger</s-table-header>
              <s-table-header>Priority</s-table-header>
              <s-table-header>Enabled</s-table-header>
              <s-table-header></s-table-header>
            </s-table-header-row>
            <s-table-body>
              {rules.map((rule) => (
                <s-table-row key={rule.id}>
                  <s-table-cell>
                    <s-link href={`/app/rules/${rule.id}`}>{rule.name}</s-link>
                  </s-table-cell>
                  <s-table-cell>{TOOL_LABEL[rule.toolType] ?? rule.toolType}</s-table-cell>
                  <s-table-cell>
                    {rule.triggerType === "PRODUCT" ? "Product(s)" : "Collection(s)"} ·{" "}
                    {rule.triggerIds.length}
                  </s-table-cell>
                  <s-table-cell>{rule.priority}</s-table-cell>
                  <s-table-cell>
                    <s-checkbox
                      label=""
                      {...(rule.enabled ? { checked: true } : {})}
                      onChange={(event) =>
                        fetcher.submit(
                          {
                            intent: "toggle",
                            id: rule.id,
                            enabled: String(event.currentTarget.checked),
                          },
                          { method: "post" },
                        )
                      }
                    />
                  </s-table-cell>
                  <s-table-cell>
                    <s-button
                      variant="tertiary"
                      tone="critical"
                      onClick={() => {
                        if (confirm(`Delete rule "${rule.name}"?`)) {
                          fetcher.submit(
                            { intent: "delete", id: rule.id },
                            { method: "post" },
                          );
                        }
                      }}
                    >
                      Delete
                    </s-button>
                  </s-table-cell>
                </s-table-row>
              ))}
            </s-table-body>
          </s-table>
        )}
      </s-section>
      <s-section slot="aside" heading="Global settings">
        <s-paragraph>
          Master on/off switches for each tool live on the{" "}
          <s-link href="/app/settings">settings page</s-link>.
        </s-paragraph>
      </s-section>
    </s-page>
  );
}
