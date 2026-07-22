import { useEffect, useMemo, useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { useFetcher, useLoaderData, useNavigate } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import { createRule, getRule, updateRule } from "../lib/upsell/rules.server";
import { syncDiscountMetafield } from "../lib/upsell/discount.server";
import { ruleInputSchema } from "../lib/upsell/schema";
import { log } from "../lib/logger.server";
import { DiscountFields } from "../components/rules/DiscountFields";
import { DisplayFields } from "../components/rules/DisplayFields";
import { OfferEditor } from "../components/rules/OfferEditor";
import { RulePreview } from "../components/rules/RulePreview";
import type {
  BorderRadius,
  DiscountMode,
  OfferState,
  Selection,
  TargetType,
  ToolType,
} from "../components/rules/types";

type ResourceLabel = { title: string; image: string | null; variants?: { id: string; title: string }[] };

const RESOURCE_QUERY = `#graphql
  query UpsellResourceLabels($ids: [ID!]!) {
    nodes(ids: $ids) {
      id
      ... on Product {
        title
        featuredImage { url }
        variants(first: 25) {
          nodes { id title }
        }
      }
      ... on Collection {
        title
        image { url }
      }
    }
  }
`;

type AdminContext = Awaited<ReturnType<typeof authenticate.admin>>["admin"];

async function hydrateLabels(
  admin: AdminContext,
  ids: string[],
): Promise<Record<string, ResourceLabel>> {
  if (ids.length === 0) return {};
  const response = await admin.graphql(RESOURCE_QUERY, { variables: { ids } });
  const json = (await response.json()) as {
    data?: {
      nodes: ({
        id: string;
        title?: string;
        featuredImage?: { url: string };
        image?: { url: string };
        variants?: { nodes: { id: string; title: string }[] };
      } | null)[];
    };
  };
  const labels: Record<string, ResourceLabel> = {};
  for (const node of json.data?.nodes ?? []) {
    if (!node) continue;
    labels[node.id] = {
      title: node.title ?? node.id,
      image: node.featuredImage?.url ?? node.image?.url ?? null,
      variants: node.variants?.nodes,
    };
  }
  return labels;
}

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  const id = params.id!;

  if (id === "new") {
    return { rule: null, labels: {} as Record<string, ResourceLabel> };
  }

  const rule = await getRule(session.shop, id);
  if (!rule) throw new Response("Rule not found", { status: 404 });

  const allIds = [
    ...rule.triggerIds,
    ...rule.offers.flatMap((offer) => offer.targetIds),
  ];
  const labels = await hydrateLabels(admin, allIds);

  return { rule, labels };
};

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  const id = params.id!;
  const body = await request.json();

  const parsed = ruleInputSchema.safeParse(body);
  if (!parsed.success) {
    log.warn(`[rules.$id.action] validation failed: ${parsed.error.message}`);
    return { errors: parsed.error.flatten() };
  }

  if (id === "new") {
    const rule = await createRule(session.shop, parsed.data);
    await syncDiscountMetafield(admin, session.shop);
    return { ok: true, id: rule.id };
  }

  await updateRule(session.shop, id, parsed.data);
  await syncDiscountMetafield(admin, session.shop);
  return { ok: true, id };
};

export default function RuleEditor() {
  const { rule, labels } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const navigate = useNavigate();
  const shopify = useAppBridge();

  const toLabel = (id: string): Selection => ({
    id,
    title: labels[id]?.title ?? id,
    image: labels[id]?.image ?? null,
    variants: labels[id]?.variants,
  });

  const [toolType, setToolType] = useState<ToolType>(rule?.toolType ?? "POPUP");
  const [name, setName] = useState(rule?.name ?? "");
  const [priority, setPriority] = useState(rule?.priority ?? 0);
  const [triggerType, setTriggerType] = useState<TargetType>(rule?.triggerType ?? "PRODUCT");
  const [triggerSelections, setTriggerSelections] = useState<Selection[]>(
    rule?.triggerIds.map(toLabel) ?? [],
  );
  const [discountMode, setDiscountMode] = useState<DiscountMode>(rule?.discountMode ?? "FREE");
  const [discountValue, setDiscountValue] = useState(rule?.discountValue ?? 0);
  const [maxImpressions, setMaxImpressions] = useState(rule?.maxImpressionsPerSession ?? 0);
  const [hideIfInCart, setHideIfInCart] = useState(rule?.hideIfOfferAlreadyInCart ?? true);
  const [headline, setHeadline] = useState(rule?.headline ?? "");
  const [subheading, setSubheading] = useState(rule?.subheading ?? "");
  const [buttonText, setButtonText] = useState(rule?.buttonText ?? "");
  const [backgroundColor, setBackgroundColor] = useState(rule?.backgroundColor ?? "#ffffff");
  const [textColor, setTextColor] = useState(rule?.textColor ?? "#1a1a1a");
  const [buttonColor, setButtonColor] = useState(rule?.buttonColor ?? "#1a1a1a");
  const [buttonTextColor, setButtonTextColor] = useState(rule?.buttonTextColor ?? "#ffffff");
  const [borderRadius, setBorderRadius] = useState<BorderRadius>(
    (rule?.borderRadius as BorderRadius | null) ?? "medium",
  );
  const [fontFamily, setFontFamily] = useState(rule?.fontFamily ?? "");

  const [offers, setOffers] = useState<OfferState[]>(
    rule?.offers.map((offer) => ({
      targetType: offer.targetType,
      selections: offer.targetIds.map(toLabel),
      variantOptionMode: offer.variantOptionMode,
      fixedVariantId: offer.fixedVariantId ?? "",
    })) ?? [
      { targetType: "PRODUCT", selections: [], variantOptionMode: "INDEPENDENT", fixedVariantId: "" },
    ],
  );

  const [startAt, setStartAt] = useState(
    rule?.startAt ? new Date(rule.startAt).toISOString().slice(0, 10) : "",
  );
  const [endAt, setEndAt] = useState(
    rule?.endAt ? new Date(rule.endAt).toISOString().slice(0, 10) : "",
  );

  const isSaving = fetcher.state === "submitting";
  const errors = fetcher.data && "errors" in fetcher.data ? fetcher.data.errors : null;

  // Without this, a successful create left the form sitting on /app/rules/new
  // with no visible confirmation — clicking Save again (easy to do when
  // nothing seems to have happened) silently created another duplicate rule
  // instead of erroring or updating the existing one.
  useEffect(() => {
    if (!fetcher.data || !("ok" in fetcher.data) || !fetcher.data.ok) return;
    if (!rule) {
      navigate(`/app/rules/${fetcher.data.id}`, { replace: true });
    } else {
      shopify.toast.show("Rule saved");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetcher.data]);

  const pickTrigger = async () => {
    const resourceType = triggerType === "PRODUCT" ? "product" : "collection";
    const result = await shopify.resourcePicker({
      type: resourceType,
      multiple: true,
      selectionIds: triggerSelections.map((s) => ({ id: s.id })),
    });
    if (!result) return;
    setTriggerSelections(
      result.map((r: { id: string; title: string; images?: { originalSrc?: string }[] }) => ({
        id: r.id,
        title: r.title,
        image: r.images?.[0]?.originalSrc ?? null,
      })),
    );
  };

  const pickOffer = async (index: number) => {
    const offer = offers[index];
    const resourceType = offer.targetType === "PRODUCT" ? "product" : "collection";
    const result = await shopify.resourcePicker({
      type: resourceType,
      multiple: true,
      selectionIds: offer.selections.map((s) => ({ id: s.id })),
    });
    if (!result) return;
    setOffers((prev) =>
      prev.map((o, i) =>
        i === index
          ? {
              ...o,
              fixedVariantId: "",
              selections: result.map((r) => ({
                id: r.id,
                title: r.title,
                image: "images" in r ? r.images?.[0]?.originalSrc ?? null : null,
                variants:
                  "variants" in r
                    ? (r.variants ?? [])
                        .filter((v): v is { id: string; title: string } => Boolean(v.id && v.title))
                        .map((v) => ({ id: v.id, title: v.title }))
                    : undefined,
              })),
            }
          : o,
      ),
    );
  };

  const addOfferSlot = () =>
    setOffers((prev) => [
      ...prev,
      { targetType: "PRODUCT", selections: [], variantOptionMode: "INDEPENDENT", fixedVariantId: "" },
    ]);

  const removeOfferSlot = (index: number) =>
    setOffers((prev) => prev.filter((_, i) => i !== index));

  const canSave = useMemo(
    () =>
      name.trim().length > 0 &&
      triggerSelections.length > 0 &&
      offers.every(
        (o) => o.selections.length > 0 && (o.variantOptionMode !== "FIXED" || o.fixedVariantId),
      ),
    [name, triggerSelections, offers],
  );

  const save = () => {
    const payload = {
      toolType,
      enabled: rule?.enabled ?? true,
      name,
      priority,
      triggerType,
      triggerIds: triggerSelections.map((s) => s.id),
      discountMode,
      discountValue,
      maxImpressionsPerSession: maxImpressions,
      hideIfOfferAlreadyInCart: hideIfInCart,
      placement: "default",
      headline: headline || null,
      subheading: subheading || null,
      buttonText: buttonText || null,
      backgroundColor: backgroundColor || null,
      textColor: textColor || null,
      buttonColor: buttonColor || null,
      buttonTextColor: buttonTextColor || null,
      borderRadius: borderRadius || null,
      fontFamily: fontFamily || null,
      startAt: startAt ? new Date(`${startAt}T00:00:00.000Z`).toISOString() : "",
      endAt: endAt ? new Date(`${endAt}T00:00:00.000Z`).toISOString() : "",
      offers: offers.map((o, i) => ({
        targetType: o.targetType,
        targetIds: o.selections.map((s) => s.id),
        variantOptionMode: o.variantOptionMode,
        fixedVariantId: o.variantOptionMode === "FIXED" ? o.fixedVariantId || null : null,
        sortOrder: i,
      })),
    };
    fetcher.submit(payload, { method: "post", encType: "application/json" });
  };

  return (
    <s-page heading={rule ? `Edit rule: ${rule.name}` : "Create upsell rule"}>
      <s-button slot="primary-action" variant="primary" onClick={save} {...(isSaving ? { loading: true } : {})} disabled={!canSave}>
        Save
      </s-button>
      <s-button slot="secondary-actions" onClick={() => navigate("/app/rules")}>
        Cancel
      </s-button>

      {errors && (
        <s-banner tone="critical" heading="Fix the following before saving">
          <s-paragraph>{JSON.stringify(errors.fieldErrors)}</s-paragraph>
        </s-banner>
      )}

      <s-section heading="Basics">
        <s-stack direction="block" gap="base">
          <s-text-field
            label="Internal name"
            name="name"
            value={name}
            onChange={(e) => { if (e.currentTarget) setName(e.currentTarget.value); }}
            details="Only visible to you, in this list — not shown to customers."
          />
          <s-select
            label="Tool type"
            name="toolType"
            value={toolType}
            onChange={(e) => { if (e.currentTarget) setToolType(e.currentTarget.value as ToolType); }}
          >
            <s-option value="POPUP">A — Post-add-to-cart popup</s-option>
            <s-option value="CART_BUNDLE">B — Cart page bundle builder</s-option>
          </s-select>
          <s-number-field
            label="Priority"
            name="priority"
            value={String(priority)}
            onChange={(e) => { if (e.currentTarget) setPriority(Number(e.currentTarget.value)); }}
            details="Higher priority rules win when more than one rule matches the same trigger."
          />
        </s-stack>
      </s-section>

      <s-section heading="Trigger">
        <s-stack direction="block" gap="base">
          <s-select
            label="Trigger type"
            name="triggerType"
            value={triggerType}
            onChange={(e) => {
              if (!e.currentTarget) return;
              setTriggerType(e.currentTarget.value as TargetType);
              setTriggerSelections([]);
            }}
          >
            <s-option value="PRODUCT">Specific products</s-option>
            <s-option value="COLLECTION">A collection</s-option>
          </s-select>
          <s-button onClick={pickTrigger}>
            {triggerType === "PRODUCT" ? "Pick products" : "Pick collection"}
          </s-button>
          <s-stack direction="inline" gap="small">
            {triggerSelections.map((s) => (
              <s-badge key={s.id}>{s.title}</s-badge>
            ))}
          </s-stack>
        </s-stack>
      </s-section>

      <s-section heading="Offer(s)">
        <s-paragraph>
          {toolType === "POPUP"
            ? "Customers choose one of these via radio buttons in the popup."
            : "Each slot below is a bundle component shown on the cart page."}
        </s-paragraph>
        <s-stack direction="block" gap="large">
          {offers.map((offer, index) => (
            <OfferEditor
              key={index}
              toolType={toolType}
              offer={offer}
              canRemove={offers.length > 1}
              onTargetTypeChange={(value) => {
                setOffers((prev) =>
                  prev.map((o, i) => (i === index ? { ...o, targetType: value, selections: [] } : o)),
                );
              }}
              onPick={() => pickOffer(index)}
              onVariantModeChange={(value) => {
                setOffers((prev) => prev.map((o, i) => (i === index ? { ...o, variantOptionMode: value } : o)));
              }}
              onFixedVariantChange={(value) => {
                setOffers((prev) => prev.map((o, i) => (i === index ? { ...o, fixedVariantId: value } : o)));
              }}
              onRemove={() => removeOfferSlot(index)}
            />
          ))}
          <s-button onClick={addOfferSlot}>Add another offer slot</s-button>
        </s-stack>
      </s-section>

      <s-section heading="Discount">
        <DiscountFields
          discountMode={discountMode}
          discountValue={discountValue}
          onDiscountModeChange={setDiscountMode}
          onDiscountValueChange={setDiscountValue}
        />
      </s-section>

      <s-section heading="Schedule" slot="aside">
        <s-paragraph>Leave blank for no start/end limit.</s-paragraph>
        <s-stack direction="block" gap="base">
          <s-date-field
            label="Starts"
            value={startAt}
            onChange={(e) => { if (e.currentTarget) setStartAt(e.currentTarget.value); }}
          />
          <s-date-field
            label="Ends"
            value={endAt}
            onChange={(e) => { if (e.currentTarget) setEndAt(e.currentTarget.value); }}
          />
        </s-stack>
      </s-section>

      <s-section heading="Display" slot="aside">
        <DisplayFields
          headline={headline}
          subheading={subheading}
          buttonText={buttonText}
          backgroundColor={backgroundColor}
          textColor={textColor}
          buttonColor={buttonColor}
          buttonTextColor={buttonTextColor}
          borderRadius={borderRadius}
          fontFamily={fontFamily}
          maxImpressions={maxImpressions}
          hideIfInCart={hideIfInCart}
          onHeadlineChange={setHeadline}
          onSubheadingChange={setSubheading}
          onButtonTextChange={setButtonText}
          onBackgroundColorChange={setBackgroundColor}
          onTextColorChange={setTextColor}
          onButtonColorChange={setButtonColor}
          onButtonTextColorChange={setButtonTextColor}
          onBorderRadiusChange={setBorderRadius}
          onFontFamilyChange={setFontFamily}
          onMaxImpressionsChange={setMaxImpressions}
          onHideIfInCartChange={setHideIfInCart}
        />
      </s-section>

      <s-section heading="Preview" slot="aside">
        <s-paragraph>
          Approximate — the real popup/cart module also inherits a few base
          styles from your theme.
        </s-paragraph>
        <RulePreview
          backgroundColor={backgroundColor}
          textColor={textColor}
          fontFamily={fontFamily}
          borderRadius={borderRadius}
          headline={headline}
          subheading={subheading}
          discountMode={discountMode}
          discountValue={discountValue}
          buttonColor={buttonColor}
          buttonTextColor={buttonTextColor}
          buttonText={buttonText}
        />
      </s-section>
    </s-page>
  );
}
