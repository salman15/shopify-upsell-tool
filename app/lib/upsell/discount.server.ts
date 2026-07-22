import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";
import prisma from "../../db.server";
import { log } from "../logger.server";
import { listRules, getToolSettings } from "./rules.server";

const METAFIELD_NAMESPACE = "$app:upsell-discount";
const METAFIELD_KEY = "function-configuration";
const FUNCTION_HANDLE = "upsell-discount";

type AdminContext = AdminApiContext;

type DiscountConfiguration = Record<
  string,
  { mode: string; value: number; triggerProductIds: string[]; offerProductIds: string[] }
>;

function withinSchedule(rule: { startAt: Date | null; endAt: Date | null }, now: Date) {
  if (rule.startAt && now < rule.startAt) return false;
  if (rule.endAt && now > rule.endAt) return false;
  return true;
}

// Product-type targets are already a list of product GIDs; collection-type
// targets are expanded to their current member product GIDs here, since the
// checkout-time Function can't run arbitrary collection-membership queries
// (its input query is fixed at build time, not parameterizable per rule).
// This is a point-in-time snapshot — it goes stale only until the next rule
// or settings change re-syncs it, which is an acceptable tradeoff. Shared by
// both trigger resolution and offer-product resolution below.
async function resolveProductIds(
  admin: AdminContext,
  targetType: string,
  targetIds: string[],
): Promise<string[]> {
  if (targetType === "PRODUCT") return targetIds;

  const ids = new Set<string>();
  await Promise.all(
    targetIds.map(async (collectionId) => {
      const response = await admin.graphql(
        `#graphql
          query TargetCollectionProducts($id: ID!) {
            collection(id: $id) {
              products(first: 250) { nodes { id } }
            }
          }`,
        { variables: { id: collectionId } },
      );
      const json = (await response.json()) as {
        data?: { collection: { products: { nodes: { id: string }[] } } | null };
      };
      for (const node of json.data?.collection?.products.nodes ?? []) {
        ids.add(node.id);
      }
    }),
  );
  return [...ids];
}

// Rebuilds the { ruleId: { mode, value, triggerProductIds, offerProductIds } }
// map the Function reads at checkout time. Only rules that are enabled,
// in-schedule, and whose tool is globally on are included — so disabling a
// rule (or the whole tool) stops the discount immediately, even for a line
// already sitting in an existing cart. triggerProductIds lets the Function
// confirm the trigger product is *still* in the cart before discounting —
// without it, removing the trigger after accepting a free/discounted offer
// item would leave that item discounted with nothing bought. offerProductIds
// lets the Function discount *any* qualifying cart line for this rule, not
// only the one line our own storefront JS tagged when the offer was
// accepted — a customer who separately adds the same product the normal way
// still gets the "buy X get Y" discount on one unit of it, matching how a
// native Shopify BOGO discount behaves.
export async function buildDiscountConfiguration(admin: AdminContext, shop: string): Promise<DiscountConfiguration> {
  const [settings, rules] = await Promise.all([getToolSettings(shop), listRules(shop)]);
  const now = new Date();

  const config: DiscountConfiguration = {};
  for (const rule of rules) {
    const toolEnabled = rule.toolType === "POPUP" ? settings.popupEnabled : settings.cartBundleEnabled;
    if (!rule.enabled || !toolEnabled || !withinSchedule(rule, now)) continue;

    const triggerProductIds = await resolveProductIds(admin, rule.triggerType, rule.triggerIds);

    const offerIdSet = new Set<string>();
    await Promise.all(
      rule.offers.map(async (offer) => {
        const ids = await resolveProductIds(admin, offer.targetType, offer.targetIds);
        for (const id of ids) offerIdSet.add(id);
      }),
    );

    config[rule.id] = {
      mode: rule.discountMode,
      value: rule.discountValue,
      triggerProductIds,
      offerProductIds: [...offerIdSet],
    };
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

  const configuration = await buildDiscountConfiguration(admin, shop);

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

  const configuration = await buildDiscountConfiguration(admin, shop);

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
