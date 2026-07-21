import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { Form, useLoaderData, useNavigation } from "react-router";
import { authenticate } from "../shopify.server";
import { getToolSettings, updateToolSettings } from "../lib/upsell/rules.server";
import { activateDiscount, syncDiscountMetafield } from "../lib/upsell/discount.server";
import { toolSettingsInputSchema } from "../lib/upsell/schema";
import { log } from "../lib/logger.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const settings = await getToolSettings(session.shop);
  return { settings };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "activate-discount") {
    try {
      await activateDiscount(admin, session.shop);
    } catch (error) {
      log.warn(`[settings.action] activateDiscount failed: ${(error as Error).message}`);
      return { ok: false, error: (error as Error).message };
    }
    return { ok: true };
  }

  const input = toolSettingsInputSchema.parse({
    popupEnabled: formData.get("popupEnabled") === "on",
    cartBundleEnabled: formData.get("cartBundleEnabled") === "on",
  });

  await updateToolSettings(session.shop, input);
  await syncDiscountMetafield(admin, session.shop);
  return { ok: true };
};

export default function Settings() {
  const { settings } = useLoaderData<typeof loader>();
  const navigation = useNavigation();
  const isSaving = navigation.state === "submitting";

  return (
    <s-page heading="Upsell tools — global settings">
      <s-section heading="Master switches">
        <s-paragraph>
          These kill switches turn a tool off everywhere on the storefront,
          regardless of individual rule state. Use them to pause a tool
          instantly without deleting its rules.
        </s-paragraph>
        <Form method="post">
          <input type="hidden" name="intent" value="save-settings" />
          <s-stack direction="block" gap="base">
            <s-checkbox
              name="popupEnabled"
              label="Post-add-to-cart popup (Tool A)"
              details="Show the radio-button upsell popup after a matching product is added to cart."
              {...(settings.popupEnabled ? { checked: true } : {})}
            />
            <s-checkbox
              name="cartBundleEnabled"
              label="Cart page bundle builder (Tool B)"
              details="Show the bundle-completion module on the cart page for matching products."
              {...(settings.cartBundleEnabled ? { checked: true } : {})}
            />
            <s-button
              type="submit"
              variant="primary"
              {...(isSaving ? { loading: true } : {})}
            >
              Save
            </s-button>
          </s-stack>
        </Form>
      </s-section>

      <s-section heading="Checkout discount">
        {settings.discountId ? (
          <s-paragraph>
            The upsell discount is active. It applies automatically to any
            cart line added through the popup or cart bundle tools —
            nothing further to do here.
          </s-paragraph>
        ) : (
          <s-stack direction="block" gap="base">
            <s-paragraph>
              One-time setup: activate the automatic discount that makes
              &quot;free&quot; and discounted offer items actually free/discounted
              at checkout. This creates a Shopify automatic discount backed by
              this app&apos;s Function — safe to click once and forget.
            </s-paragraph>
            <Form method="post">
              <input type="hidden" name="intent" value="activate-discount" />
              <s-button type="submit" {...(isSaving ? { loading: true } : {})}>
                Activate discount
              </s-button>
            </Form>
          </s-stack>
        )}
      </s-section>
    </s-page>
  );
}
