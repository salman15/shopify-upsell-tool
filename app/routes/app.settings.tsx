import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { Form, useLoaderData, useNavigation } from "react-router";
import { authenticate } from "../shopify.server";
import { getToolSettings, updateToolSettings } from "../lib/upsell/rules.server";
import { toolSettingsInputSchema } from "../lib/upsell/schema";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const settings = await getToolSettings(session.shop);
  return { settings };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();

  const input = toolSettingsInputSchema.parse({
    popupEnabled: formData.get("popupEnabled") === "on",
    cartBundleEnabled: formData.get("cartBundleEnabled") === "on",
  });

  await updateToolSettings(session.shop, input);
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
    </s-page>
  );
}
