(function () {
  "use strict";

  // Loaded by every block (popup embed, drawer embed, inline cart-bundle
  // block) — the script tag can legitimately appear more than once on one
  // page, so guard against double-initialization.
  if (window.__upsellCommonLoaded) return;
  window.__upsellCommonLoaded = true;

  var state = { rulesPromise: null };

  function getRules() {
    if (!state.rulesPromise) {
      state.rulesPromise = fetch("/apps/upsell/rules", { headers: { Accept: "application/json" } })
        .then(function (r) {
          return r.ok ? r.json() : { popupEnabled: false, cartBundleEnabled: false, rules: [] };
        })
        .catch(function () {
          return { popupEnabled: false, cartBundleEnabled: false, rules: [] };
        });
    }
    return state.rulesPromise;
  }

  function postEvent(ruleId, type, cartToken) {
    fetch("/apps/upsell/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ruleId: ruleId, type: type, cartToken: cartToken }),
      keepalive: true,
    }).catch(function () {});
  }

  function getCart() {
    return fetch("/cart.js", { headers: { Accept: "application/json" } }).then(function (r) {
      return r.json();
    });
  }

  function addToCart(items) {
    return fetch("/cart/add.js", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ items: items }),
    }).then(function (r) {
      if (!r.ok) throw new Error("Upsell: add to cart failed");
      return r.json();
    });
  }

  function updateLineQuantity(lineKey, quantity) {
    return fetch("/cart/change.js", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ id: lineKey, quantity: quantity }),
    }).then(function (r) {
      if (!r.ok) throw new Error("Upsell: cart update failed");
      return r.json();
    });
  }

  function formatMoney(amountDecimal) {
    var currency = (window.Shopify && window.Shopify.currency && window.Shopify.currency.active) || "USD";
    try {
      return new Intl.NumberFormat(document.documentElement.lang || "en", {
        style: "currency",
        currency: currency,
      }).format(Number(amountDecimal));
    } catch (e) {
      return Number(amountDecimal).toFixed(2);
    }
  }

  function toGid(kind, legacyId) {
    return "gid://shopify/" + kind + "/" + legacyId;
  }

  // Our own add-to-cart flow (see initCartInterception below) bypasses
  // whatever mechanism the theme normally uses to refresh its own header
  // cart-count bubble — so without this, that number goes stale even though
  // the actual cart is correct. Best-effort: covers Dawn/Horizon's markup
  // (confirmed directly from this store's theme files) plus a couple of
  // common conventions.
  function syncThemeCartCount(cart) {
    var selectors = [
      "#cart-icon-bubble .cart-count-bubble span[aria-hidden='true']",
      ".cart-count-bubble span[aria-hidden='true']",
      "[data-cart-count]",
      ".cart-count",
    ];
    for (var i = 0; i < selectors.length; i++) {
      var el = document.querySelector(selectors[i]);
      if (el) el.textContent = cart.item_count;
    }
  }

  var BORDER_RADIUS_PX = { none: "0px", small: "4px", medium: "8px", large: "16px", pill: "999px" };

  // Applies the rule's optional style overrides (color/typography/corner
  // radius) as inline styles — falls back to whatever upsell.css already set
  // when a field is left blank in the admin, so this is purely additive.
  function applyDisplayStyles(container, addBtn, display) {
    if (display.backgroundColor) container.style.background = display.backgroundColor;
    if (display.textColor) container.style.color = display.textColor;
    if (display.fontFamily) container.style.fontFamily = display.fontFamily;

    var radius = BORDER_RADIUS_PX[display.borderRadius];
    if (radius) {
      container.style.borderRadius = radius;
      var optionRadius = display.borderRadius === "pill" ? BORDER_RADIUS_PX.medium : radius;
      container.querySelectorAll(".upsell-option").forEach(function (el) {
        el.style.borderRadius = optionRadius;
      });
    }

    if (addBtn) {
      if (display.buttonColor) addBtn.style.background = display.buttonColor;
      if (display.buttonTextColor) addBtn.style.color = display.buttonTextColor;
      if (radius) addBtn.style.borderRadius = radius;
    }
  }

  // Builds the price markup for one offer option: a struck-through original
  // price plus the discounted price (or "Free") plus a "Save X" badge, so
  // the deal reads clearly at a glance rather than as a bare word/number.
  function priceMarkup(rule, variant) {
    var price = Number(variant.price);

    if (rule.discount.mode === "FREE") {
      return (
        '<span class="upsell-price-original">' + formatMoney(price) + "</span>" +
        '<span class="upsell-price-final upsell-price-free">Free</span>' +
        '<span class="upsell-price-save">Save ' + formatMoney(price) + "</span>"
      );
    }

    var discounted;
    var saveLabel;
    if (rule.discount.mode === "PERCENTAGE") {
      discounted = price * (1 - rule.discount.value / 100);
      saveLabel = "Save " + rule.discount.value + "%";
    } else {
      discounted = Math.max(0, price - rule.discount.value);
      saveLabel = "Save " + formatMoney(price - discounted);
    }

    return (
      '<span class="upsell-price-original">' + formatMoney(price) + "</span>" +
      '<span class="upsell-price-final">' + formatMoney(discounted) + "</span>" +
      '<span class="upsell-price-save">' + saveLabel + "</span>"
    );
  }

  function shownKey(ruleId) {
    return "upsell_shown_" + ruleId;
  }

  function timesShown(ruleId) {
    return Number(sessionStorage.getItem(shownKey(ruleId)) || "0");
  }

  function markShown(ruleId) {
    sessionStorage.setItem(shownKey(ruleId), String(timesShown(ruleId) + 1));
  }

  function alreadyAccepted(ruleId) {
    return sessionStorage.getItem("upsell_accepted_" + ruleId) === "1";
  }

  function markAccepted(ruleId) {
    sessionStorage.setItem("upsell_accepted_" + ruleId, "1");
  }

  // Shared by both tools: given a set of POPUP rules and the product ids
  // that were just added to cart, picks the single best-matching rule (or
  // null). Pure/stateless so both upsell-popup.js and upsell-drawer.js can
  // use the exact same matching decision without duplicating the logic.
  function pickMatchingRule(rules, addedProductIds) {
    var matches = rules
      .filter(function (r) {
        return r.triggerProductIds.some(function (id) {
          return addedProductIds.indexOf(id) !== -1;
        });
      })
      .filter(function (r) {
        return r.display.maxImpressionsPerSession === 0 || timesShown(r.id) < r.display.maxImpressionsPerSession;
      })
      .sort(function (a, b) {
        return b.priority - a.priority;
      });
    return matches[0] || null;
  }

  // ---------- Cart interception: the one place that owns the theme's
  // add-to-cart forms and cart-icon clicks ----------
  //
  // Earlier versions let the theme's own add-to-cart submission go through
  // untouched and merely *polled* the cart afterward to notice the change.
  // That meant the theme's own JS (Dawn included) independently ran its own
  // AJAX add AND opened its own native cart drawer at the same time as ours
  // — a race that showed up as two different drawers/carts, inconsistent
  // delays, and the popup sometimes losing that race entirely.
  //
  // The fix (the same technique real ajax-cart implementations use): take
  // over the add-to-cart form submission itself. A capture-phase listener on
  // `document` fires before the theme's own listener on the form ever runs,
  // regardless of script load order — call preventDefault()/stopPropagation()
  // there, do the /cart/add.js POST ourselves, and notify subscribers with
  // the real result. The theme's own handler, and its own drawer-opening
  // logic, never run at all, so there's nothing left to race against.
  var cartAddSubscribers = [];
  var cartIconClickSubscribers = [];

  function onCartAdd(callback) {
    cartAddSubscribers.push(callback);
  }

  function onCartIconClick(callback) {
    cartIconClickSubscribers.push(callback);
  }

  function extractFormItem(form) {
    var formData = new FormData(form);
    var item = { id: formData.get("id"), quantity: Number(formData.get("quantity") || "1") };

    var properties = {};
    var hasProperties = false;
    formData.forEach(function (value, key) {
      var match = /^properties\[(.+)\]$/.exec(key);
      if (match) {
        properties[match[1]] = value;
        hasProperties = true;
      }
    });
    if (hasProperties) item.properties = properties;

    var sellingPlan = formData.get("selling_plan");
    if (sellingPlan) item.selling_plan = sellingPlan;

    return item;
  }

  function initCartInterception() {
    document.addEventListener(
      "submit",
      function (event) {
        var form = event.target;
        if (!(form instanceof HTMLFormElement)) return;

        // Set by our own error-fallback path below to let a retried native
        // submission through untouched — never intercept it a second time.
        if (form.__upsellBypass) {
          form.__upsellBypass = false;
          return;
        }

        // Nothing on this page cares about add-to-cart — don't take on the
        // risk of intercepting it for no reason. Checked here (not at
        // load-time) so it's correct regardless of which of common/popup/
        // drawer.js finished registering subscribers first.
        if (cartAddSubscribers.length === 0) return;

        var action = form.getAttribute("action") || "";
        if (action.indexOf("/cart/add") === -1) return;

        event.preventDefault();
        event.stopPropagation();

        var submitter = event.submitter;
        if (submitter) submitter.disabled = true;

        var item = extractFormItem(form);
        addToCart([item])
          .then(function (addResponse) {
            var addedItems = addResponse.items || [addResponse];
            var addedProductIds = addedItems.map(function (i) {
              return toGid("Product", i.product_id);
            });
            return getCart().then(function (cart) {
              syncThemeCartCount(cart);
              cartAddSubscribers.forEach(function (fn) {
                fn(cart, addedProductIds);
              });
            });
          })
          .catch(function (err) {
            // Our own fetch path failed — fall back to letting the original
            // submission go through natively rather than leaving the
            // customer stuck with a button that does nothing.
            console.error("[upsell] add to cart failed, falling back to native submit:", err);
            form.__upsellBypass = true;
            if (form.requestSubmit) form.requestSubmit(submitter || undefined);
            else form.submit();
          })
          .then(function () {
            if (submitter) submitter.disabled = false;
          });
      },
      true,
    );

    document.addEventListener(
      "click",
      function (event) {
        // Same reasoning as above: only take over the click if a drawer is
        // actually listening, otherwise leave the theme's own cart link
        // alone.
        if (cartIconClickSubscribers.length === 0) return;

        var trigger = event.target.closest(
          'a[href="/cart"], a[href$="/cart"], [data-cart-drawer-toggle], [data-cart-icon], .cart-icon, .header__icon--cart, #cart-icon-bubble, cart-icon-bubble',
        );
        if (!trigger) return;

        event.preventDefault();
        event.stopPropagation();
        cartIconClickSubscribers.forEach(function (fn) {
          fn();
        });
      },
      true,
    );
  }

  // Registered immediately (not on DOMContentLoaded) — event delegation on
  // `document` works before the DOM is ready, and the earlier this is live,
  // the less chance of missing a very fast first interaction.
  initCartInterception();
  getRules(); // warm the cache before the first add-to-cart needs it

  window.UpsellCommon = {
    getRules: getRules,
    postEvent: postEvent,
    getCart: getCart,
    addToCart: addToCart,
    updateLineQuantity: updateLineQuantity,
    formatMoney: formatMoney,
    toGid: toGid,
    syncThemeCartCount: syncThemeCartCount,
    applyDisplayStyles: applyDisplayStyles,
    priceMarkup: priceMarkup,
    timesShown: timesShown,
    markShown: markShown,
    alreadyAccepted: alreadyAccepted,
    markAccepted: markAccepted,
    pickMatchingRule: pickMatchingRule,
    onCartAdd: onCartAdd,
    onCartIconClick: onCartIconClick,
  };
})();
