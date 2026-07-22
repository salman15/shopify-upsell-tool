import type { Prisma } from "@prisma/client";
import prisma from "../../db.server";
import { log } from "../logger.server";
import type { OfferInput, RuleInput } from "./schema";

type RuleWithOfferRows = Prisma.UpsellRuleGetPayload<{ include: { offers: true } }>;

export type RuleWithOffers = Awaited<ReturnType<typeof getRule>>;

function parseIds(json: string): string[] {
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function serializeOffer(offer: OfferInput) {
  return {
    targetType: offer.targetType,
    targetIds: JSON.stringify(offer.targetIds),
    variantOptionMode: offer.variantOptionMode,
    fixedVariantId: offer.variantOptionMode === "FIXED" ? offer.fixedVariantId : null,
    sortOrder: offer.sortOrder,
  };
}

export function serializeRule(rule: RuleWithOfferRows) {
  return {
    ...rule,
    triggerIds: parseIds(rule.triggerIds),
    offers: rule.offers.map((offer) => ({
      ...offer,
      targetIds: parseIds(offer.targetIds),
    })),
  };
}

export async function listRules(shop: string) {
  const rules = await prisma.upsellRule.findMany({
    where: { shop },
    include: { offers: { orderBy: { sortOrder: "asc" } } },
    orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
  });
  return rules.map(serializeRule);
}

export async function getRule(shop: string, id: string) {
  const rule = await prisma.upsellRule.findFirst({
    where: { id, shop },
    include: { offers: { orderBy: { sortOrder: "asc" } } },
  });
  return rule ? serializeRule(rule) : null;
}

export async function createRule(shop: string, input: RuleInput) {
  log.info(`[createRule] shop=${shop} name="${input.name}" toolType=${input.toolType}`);
  const rule = await prisma.upsellRule.create({
    data: {
      shop,
      toolType: input.toolType,
      enabled: input.enabled,
      name: input.name,
      priority: input.priority,
      triggerType: input.triggerType,
      triggerIds: JSON.stringify(input.triggerIds),
      discountMode: input.discountMode,
      discountValue: input.discountValue,
      maxImpressionsPerSession: input.maxImpressionsPerSession,
      hideIfOfferAlreadyInCart: input.hideIfOfferAlreadyInCart,
      placement: input.placement,
      headline: input.headline || null,
      subheading: input.subheading || null,
      buttonText: input.buttonText || null,
      backgroundColor: input.backgroundColor || null,
      textColor: input.textColor || null,
      buttonColor: input.buttonColor || null,
      buttonTextColor: input.buttonTextColor || null,
      borderRadius: input.borderRadius || null,
      fontFamily: input.fontFamily || null,
      startAt: input.startAt ? new Date(input.startAt) : null,
      endAt: input.endAt ? new Date(input.endAt) : null,
      offers: { create: input.offers.map(serializeOffer) },
    },
  });
  return rule;
}

export async function updateRule(shop: string, id: string, input: RuleInput) {
  log.info(`[updateRule] shop=${shop} id=${id} name="${input.name}"`);
  // Ownership check: never let one shop mutate another shop's rule.
  const existing = await prisma.upsellRule.findFirst({ where: { id, shop } });
  if (!existing) throw new Error("Rule not found");

  await prisma.upsellOffer.deleteMany({ where: { ruleId: id } });

  return prisma.upsellRule.update({
    where: { id },
    data: {
      toolType: input.toolType,
      enabled: input.enabled,
      name: input.name,
      priority: input.priority,
      triggerType: input.triggerType,
      triggerIds: JSON.stringify(input.triggerIds),
      discountMode: input.discountMode,
      discountValue: input.discountValue,
      maxImpressionsPerSession: input.maxImpressionsPerSession,
      hideIfOfferAlreadyInCart: input.hideIfOfferAlreadyInCart,
      placement: input.placement,
      headline: input.headline || null,
      subheading: input.subheading || null,
      buttonText: input.buttonText || null,
      backgroundColor: input.backgroundColor || null,
      textColor: input.textColor || null,
      buttonColor: input.buttonColor || null,
      buttonTextColor: input.buttonTextColor || null,
      borderRadius: input.borderRadius || null,
      fontFamily: input.fontFamily || null,
      startAt: input.startAt ? new Date(input.startAt) : null,
      endAt: input.endAt ? new Date(input.endAt) : null,
      offers: { create: input.offers.map(serializeOffer) },
    },
  });
}

export async function deleteRule(shop: string, id: string) {
  log.info(`[deleteRule] shop=${shop} id=${id}`);
  const existing = await prisma.upsellRule.findFirst({ where: { id, shop } });
  if (!existing) throw new Error("Rule not found");
  await prisma.upsellRule.delete({ where: { id } });
}

export async function setRuleEnabled(shop: string, id: string, enabled: boolean) {
  const existing = await prisma.upsellRule.findFirst({ where: { id, shop } });
  if (!existing) throw new Error("Rule not found");
  await prisma.upsellRule.update({ where: { id }, data: { enabled } });
}

export async function getToolSettings(shop: string) {
  const settings = await prisma.toolSettings.findUnique({ where: { shop } });
  if (settings) return settings;
  return prisma.toolSettings.create({ data: { shop } });
}

export async function updateToolSettings(
  shop: string,
  input: { popupEnabled: boolean; cartBundleEnabled: boolean },
) {
  log.info(
    `[updateToolSettings] shop=${shop} popupEnabled=${input.popupEnabled} cartBundleEnabled=${input.cartBundleEnabled}`,
  );
  return prisma.toolSettings.upsert({
    where: { shop },
    create: { shop, ...input },
    update: input,
  });
}

export async function recordEvent(
  ruleId: string,
  shop: string,
  type: "shown" | "accepted" | "dismissed",
  cartToken?: string,
) {
  await prisma.upsellEvent.create({
    data: { ruleId, shop, type, cartToken },
  });
}
