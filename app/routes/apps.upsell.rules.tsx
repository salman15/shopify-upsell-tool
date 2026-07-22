import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { getToolSettings, listRules } from "../lib/upsell/rules.server";
import { resolveTargets } from "../lib/upsell/resolve.server";
import { log } from "../lib/logger.server";

function withinSchedule(rule: { startAt: Date | null; endAt: Date | null }, now: Date) {
  if (rule.startAt && now < rule.startAt) return false;
  if (rule.endAt && now > rule.endAt) return false;
  return true;
}

// Public endpoint (behind Shopify's App Proxy signature verification) that the
// storefront Theme App Extension polls for the currently-active upsell rules.
// GET /apps/upsell/rules -> { popupEnabled, cartBundleEnabled, rules: [...] }
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session, storefront } = await authenticate.public.appProxy(request);

  if (!session || !storefront) {
    return Response.json({ popupEnabled: false, cartBundleEnabled: false, rules: [] });
  }

  const [settings, rules] = await Promise.all([
    getToolSettings(session.shop),
    listRules(session.shop),
  ]);

  const now = new Date();
  const activeRules = rules.filter(
    (rule) =>
      rule.enabled &&
      withinSchedule(rule, now) &&
      ((rule.toolType === "POPUP" && settings.popupEnabled) ||
        (rule.toolType === "CART_BUNDLE" && settings.cartBundleEnabled)),
  );

  const resolved = await Promise.all(
    activeRules.map(async (rule) => {
      const [triggerProducts, offers] = await Promise.all([
        resolveTargets(storefront, rule.triggerType, rule.triggerIds),
        Promise.all(
          rule.offers.map(async (offer) => ({
            variantOptionMode: offer.variantOptionMode,
            fixedVariantId: offer.fixedVariantId,
            products: await resolveTargets(storefront, offer.targetType, offer.targetIds),
          })),
        ),
      ]);

      return {
        id: rule.id,
        toolType: rule.toolType,
        priority: rule.priority,
        triggerProductIds: triggerProducts.map((p) => p.id),
        discount: { mode: rule.discountMode, value: rule.discountValue },
        display: {
          maxImpressionsPerSession: rule.maxImpressionsPerSession,
          hideIfOfferAlreadyInCart: rule.hideIfOfferAlreadyInCart,
          placement: rule.placement,
          headline: rule.headline,
          subheading: rule.subheading,
          buttonText: rule.buttonText,
          backgroundColor: rule.backgroundColor,
          textColor: rule.textColor,
          buttonColor: rule.buttonColor,
          buttonTextColor: rule.buttonTextColor,
          borderRadius: rule.borderRadius,
          fontFamily: rule.fontFamily,
        },
        offers,
      };
    }),
  );

  log.info(`[apps.upsell.rules] shop=${session.shop} activeRules=${resolved.length}`);

  return Response.json({
    popupEnabled: settings.popupEnabled,
    cartBundleEnabled: settings.cartBundleEnabled,
    rules: resolved,
  });
};
