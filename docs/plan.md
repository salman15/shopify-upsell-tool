# Shopify Upsell Tools — Plan

## 1. Overview

Two merchant-configurable upsell tools, built as a Shopify app with a storefront-facing UI and an admin config panel:

| Tool | Trigger | Behavior |
|---|---|---|
| **A. Post-Add-to-Cart Popup** | Customer clicks "Add to cart" on a configured product/collection | Modal opens offering a free/discounted companion item, chosen via radio buttons (manual product list or a collection) |
| **B. Cart Page Bundle Builder** | Customer lands on the cart page with a configured product in cart | Inline module offering to complete a bundle (e.g. add a refill in a chosen flavor to match the mouth spray already in cart) |

Both tools share one underlying **rule engine** and **admin UI**, so a merchant creates "upsell rules" and picks which tool type each rule uses. Each rule (and each tool globally) has an on/off toggle.

---

## 2. Recommended Architecture

Shopify's supported way to do this today (2026):

- **Embedded Admin App** — Remix + Polaris (via Shopify CLI's app template). This is where merchants create/edit/toggle rules. Stores rule data in the app's own database (not just metafields — you need querying, versioning, and analytics later).
- **Theme App Extension (App Blocks / App Embed Block)** — injects the popup and cart-page modules into the storefront without editing theme code (works on Online Store 2.0 themes, survives theme updates).
- **Storefront JS (asset served by the extension)** — listens to `cart:add` events / intercepts the Ajax Cart API (`/cart/add.js`, `/cart/change.js`), fetches applicable rules from an **App Proxy** endpoint, and renders the popup/cart module.
- **Discounts** — implemented as a **Shopify Function (Product/Order discount)** so "free" or "% off" pricing is applied server-side at checkout, not just visually in the cart (avoids price-manipulation exploits and matches Shopify's current discount model — Scripts are deprecated). The Function reads a cart line-item property (e.g. `_upsell_rule_id`) set when the offer item is added, and validates it server-side against the rule table via the Function's metafield input or a lightweight API call.
- **App Proxy** (`/apps/upsell/...`) — lets storefront JS securely fetch live rule configs and log analytics events (shown, added, dismissed) without exposing the Admin API.

```
Storefront (Theme App Extension JS)
   │  cart:add event / cart page load
   ▼
App Proxy  →  Remix backend  →  Rules DB (Postgres/SQLite via Prisma)
   │
   ▼
Popup / Cart module renders → customer picks option → /cart/add.js or /cart/change.js
   │
   ▼
Checkout → Shopify Function (discount) applies free/% off based on line item property
```

---

## 3. Tool A — Post-Add-to-Cart Popup

### Merchant configuration (per rule)
- **Enabled** toggle (on/off)
- **Trigger scope**: specific product(s), specific variant(s), or a collection
- **Offer selection type**: manual product list, or a collection (auto-pull all products/variants in it)
- **Selection UI**: radio buttons (single choice) — leave room later for checkboxes (multi-choice) as a v2 option
- **Discount**: Free / % off / fixed amount off — applied to the offer item only
- **Display rules**: max times shown per session, skip if offer item already in cart, priority/order if multiple rules match the same trigger
- **Copy/design**: headline, subheading, button text, image source (product image vs custom upload)

### Storefront flow
1. Shopify theme fires `cart:add` (via the extension listening on the Ajax Cart API, or the newer `Shopify.analytics`/`cart` events depending on theme).
2. JS checks: does the added item match a trigger rule? Query is done against the config cached client-side (fetched on page load from the App Proxy) to avoid latency.
3. If match → open modal before/after the native cart drawer, showing radio options built from the rule's offer list (live price/availability/variant data pulled from Storefront API).
4. Customer selects one, clicks "Add" → `/cart/add.js` call adds it with a line item property `_upsell_rule_id: <id>` (and `_upsell_source: popup`).
5. Modal closes; native cart drawer/notification shows updated cart.
6. Discount Function sees the property at checkout and zeroes/discounts that line.

### Edge cases to design for
- Customer adds trigger product via quick-buy / collection page / search — the trigger must fire from any Ajax add-to-cart, not just the PDP button.
- Trigger product added again (qty 2) — don't re-show popup if offer already accepted this session (configurable).
- Offer product out of stock / sold out variant — fall back to next option or hide rule.
- Multiple rules match one trigger — use priority field, show highest priority only (configurable to show multiple).

---

## 4. Tool B — Cart Page Bundle Builder

### Use case
Product A = mouth spray (multiple flavors as variants). Product B = refill (multiple flavors as variants). Rule says: if A is in cart, offer B as a bundle, letting the customer pick B's flavor independently of A's flavor.

### Merchant configuration (per rule)
- **Enabled** toggle
- **Anchor product(s)**: product/collection that must be in cart to show the module
- **Bundle components**: one or more product slots, each mapped to a product or collection, each with its own variant-option picker (e.g. "Flavor") shown as a dropdown/swatches in the module
- **Discount**: per-component or whole-bundle % off, fixed amount, or free
- **Quantity behavior**: fixed qty per component, or synced to anchor's qty
- **Placement**: above/below cart line items, or above the checkout button

### Storefront flow
1. Cart page (or cart drawer) loads → extension JS checks current cart contents against active Tool B rules.
2. If anchor product present and bundle-component not already in cart → render bundle module with variant pickers (defaulting to the anchor's matching option if applicable, e.g. same flavor, but overridable).
3. Customer picks variant(s) → "Add bundle" triggers `/cart/add.js` (multi-item add) with `_upsell_rule_id` property on each added line.
4. Cart re-renders; discount applied via the same Function at checkout.

### Combination logic
Since flavors are independent per product, the config needs an **option-mapping mode**:
- **Independent** (default): customer freely picks B's flavor regardless of A's.
- **Mirrored**: default B's flavor to match A's, still changeable.
- **Fixed**: merchant pins a specific variant of B for this rule (no picker shown).

---

## 5. Shared Data Model (sketch)

```
UpsellRule
├─ id
├─ toolType: "popup" | "cart_bundle"
├─ enabled: boolean
├─ name (internal label)
├─ priority: int
├─ trigger: { type: "product" | "collection", ids: [...] }
├─ offers: [
│    { type: "product" | "collection", ids: [...], variantOptionMode?: "independent"|"mirrored"|"fixed" }
│  ]
├─ discount: { mode: "free" | "percentage" | "fixed", value: number }
├─ display: { maxImpressionsPerSession, hideIfInCart, placement, copy: {...} }
├─ schedule: { startAt?, endAt? }
└─ stats: { shown, accepted, revenueAttributed }  // for analytics dashboard
```

A single **global settings** record holds the master on/off toggle per tool type (kill switch independent of individual rules).

---

## 6. Build Phases

1. **MVP**: Admin CRUD for rules (manual product selection only), Tool A popup, flat "free" discount only, single rule per trigger.
2. **V2**: Collection-based triggers/offers, Tool B cart bundle with variant pickers, % / fixed discounts, priority handling for overlapping rules.
3. **V3**: Analytics dashboard (impressions/accepts/revenue per rule), A/B testing of copy, scheduling, multi-select (checkbox) offers, mirrored/fixed variant modes.
4. **V4 (stretch)**: Post-purchase one-click upsell (Shopify Plus checkout extensibility), tiered/volume discounts, subscription-aware upsells.

---

## 7. Other Upsell / Cross-Sell Techniques Worth Considering

- **Frequently bought together** — static or algorithmic "customers also bought" block on PDP, add-all-to-cart button.
- **Volume/tiered discounts** — "Buy 2, save 10%; Buy 3, save 20%" directly on PDP or cart, no popup needed.
- **Free shipping progress bar** — cart-page bar showing "$12 away from free shipping," nudging basket size up; can double as an upsell trigger point (suggest a product that closes the gap).
- **Gift-with-purchase threshold** — spend over $X, unlock a free gift, selectable via the same radio-button mechanism as Tool A.
- **Post-purchase upsell (Thank You page)** — one-click add after checkout, no re-entering payment (requires Shopify Plus + checkout extensibility, or an app that supports it on non-Plus via checkout UI extensions where available).
- **Exit-intent offer** — discount popup when cursor moves toward closing the tab/cart drawer (lower priority; more intrusive, use sparingly).
- **Subscription upsell** — "Subscribe & save" toggle offered alongside one-time purchase, especially relevant for consumables like the mouth spray/refill.
- **"Complete the routine" bundles** — curated multi-product sets (not just pairs) shown on PDP, same underlying rule engine as Tool B generalized to N components.
- **Countdown/urgency banner** — time-limited bundle discount to increase conversion on the popup/cart offers already built.
- **Quantity break on the offer itself** — e.g. "Add 2 refills instead of 1 for extra 5% off," layered onto Tool B.

Most of these can reuse the same rule engine (trigger → offer → discount → display) with different trigger types (cart value, page type, checkout stage) rather than needing separate systems — worth keeping the schema generic enough to extend past Tools A and B.

---

## 8. Configurability Checklist (applies to both tools)

- [ ] Master on/off toggle per tool (global kill switch)
- [ ] Per-rule enabled/disabled toggle
- [ ] Trigger: manual products vs. collection
- [ ] Offer: manual products vs. collection
- [ ] Discount type and value
- [ ] Display placement, copy, and images
- [ ] Priority/ordering when multiple rules could fire
- [ ] Session-level frequency capping
- [ ] Scheduling (start/end dates) — V2+
- [ ] Analytics per rule — V3
