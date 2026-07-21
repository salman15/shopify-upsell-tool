import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";
import prisma from "../../db.server";
import { log } from "../logger.server";
import { listRules, getToolSettings } from "./rules.server";

const METAFIELD_NAMESPACE = "$app:upsell-discount";
const METAFIELD_KEY = "function-configuration";
const FUNCTION_HANDLE = "upsell-discount";

type AdminContext = AdminApiContext;

type DiscountConfiguration = Record<string, { mode: string; value: number }>;

function withinSchedule(rule: { startAt: Date | null; endAt: Date | null }, now: Date) {
  if (rule.startAt && now < rule.startAt) return false;
  if (rule.endAt && now > rule.endAt) return false;
  return true;
}

// Rebuilds the { ruleId: { mode, value } } map the Function reads at checkout
// time. Only rules that are enabled, in-schedule, and whose tool is globally
// on are included — so disabling a rule (or the whole tool) stops the
// discount immediately, even for a line already sitting in an existing cart.
export async function buildDiscountConfiguration(shop: string): Promise<DiscountConfiguration> {
  const [settings, rules] = await Promise.all([getToolSettings(shop), listRules(shop)]);
  const now = new Date();

  const config: DiscountConfiguration = {};
  for (const rule of rules) {
    const toolEnabled = rule.toolType === "POPUP" ? settings.popupEnabled : settings.cartBundleEnabled;
    if (!rule.enabled || !toolEnabled || !withinSchedule(rule, now)) continue;
    config[rule.id] = { mode: rule.discountMode, value: rule.discountValue };
  }
  return config;
}

async function graphqlOrThrow(admin: AdminContext, query: string, variables: Record<string, unknown>) {
  const response = await admin.graphql(query, { variables });
  const json = (await response.json()) as { data?: unknown; errors?: unknown };
  if (json.errors) throw new Error(`GraphQL error: ${JSON.stringify(json.errors)}`);
  return json.data;
}

// Creates the automatic discount backed by the upsell-discount Function, if
// the merchant hasn't activated it yet. Safe to call repeatedly — a no-op
// once ToolSettings.discountId is set.
export async function activateDiscount(admin: AdminContext, shop: string) {
  const settings = await getToolSettings(shop);
  if (settings.discountId) return settings.discountId;

  const configuration = await buildDiscountConfiguration(shop);

  const data = (await graphqlOrThrow(
    admin,
    `#graphql
      mutation ActivateUpsellDiscount($discount: DiscountAutomaticAppInput!) {
        discountAutomaticAppCreate(automaticAppDiscount: $discount) {
          automaticAppDiscount { discountId }
          userErrors { field message }
        }
      }`,
    {
      discount: {
        title: "Upsell rules discount",
        functionHandle: FUNCTION_HANDLE,
        startsAt: new Date().toISOString(),
        discountClasses: ["PRODUCT"],
        metafields: [
          {
            namespace: METAFIELD_NAMESPACE,
            key: METAFIELD_KEY,
            type: "json",
            value: JSON.stringify(configuration),
          },
        ],
      },
    },
  )) as {
    discountAutomaticAppCreate: {
      automaticAppDiscount: { discountId: string } | null;
      userErrors: { field: string[]; message: string }[];
    };
  };

  const result = data.discountAutomaticAppCreate;
  if (result.userErrors.length > 0) {
    throw new Error(result.userErrors.map((e) => e.message).join("; "));
  }
  if (!result.automaticAppDiscount) {
    throw new Error("discountAutomaticAppCreate returned no discount");
  }

  const discountId = result.automaticAppDiscount.discountId;
  await prisma.toolSettings.update({ where: { shop }, data: { discountId } });
  log.info(`[activateDiscount] shop=${shop} discountId=${discountId}`);
  return discountId;
}

// Re-pushes the current rule configuration to the discount's metafield.
// Call after any rule or tool-settings mutation. No-op until the merchant has
// activated the discount at least once.
export async function syncDiscountMetafield(admin: AdminContext, shop: string) {
  const settings = await getToolSettings(shop);
  if (!settings.discountId) return;

  const configuration = await buildDiscountConfiguration(shop);

  const data = (await graphqlOrThrow(
    admin,
    `#graphql
      mutation SyncUpsellDiscount($id: ID!, $discount: DiscountAutomaticAppInput!) {
        discountAutomaticAppUpdate(id: $id, automaticAppDiscount: $discount) {
          userErrors { field message }
        }
      }`,
    {
      id: settings.discountId,
      discount: {
        metafields: [
          {
            namespace: METAFIELD_NAMESPACE,
            key: METAFIELD_KEY,
            type: "json",
            value: JSON.stringify(configuration),
          },
        ],
      },
    },
  )) as { discountAutomaticAppUpdate: { userErrors: { field: string[]; message: string }[] } };

  const errors = data.discountAutomaticAppUpdate.userErrors;
  if (errors.length > 0) {
    log.warn(`[syncDiscountMetafield] shop=${shop} userErrors=${JSON.stringify(errors)}`);
  }
}
