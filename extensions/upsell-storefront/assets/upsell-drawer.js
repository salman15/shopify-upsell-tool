(function () {
  "use strict";

  if (window.__upsellDrawerLoaded) return;
  window.__upsellDrawerLoaded = true;

  var CART_BUNDLE_ROOT_ID = "upsell-cart-bundle-root";

  var U = window.UpsellCommon;

  // ---------- shared bundle rendering (used by both inline and drawer modes) ----------

  function anchorLineItemFor(rule, cart) {
    for (var i = 0; i < cart.items.length; i++) {
      var item = cart.items[i];
      if (rule.triggerProductIds.indexOf(U.toGid("Product", item.product_id)) !== -1) return item;
    }
    return null;
  }

  function defaultVariantFor(offer, product, anchor) {
    var availableVariants = product.variants.filter(function (v) {
      return v.availableForSale;
    });
    var defaultVariant = availableVariants[0] || product.variants[0];

    if (offer.variantOptionMode === "MIRRORED" && anchor && anchor.options_with_values) {
      var anchorValues = anchor.options_with_values.map(function (o) {
        return o.value;
      });
      var mirrored = product.variants.filter(function (v) {
        return v.selectedOptions.some(function (opt) {
          return anchorValues.indexOf(opt.value) !== -1;
        });
      })[0];
      if (mirrored) defaultVariant = mirrored;
    } else if (offer.variantOptionMode === "FIXED" && offer.fixedVariantId) {
      var fixed = product.variants.filter(function (v) {
        return v.id === offer.fixedVariantId;
      })[0];
      if (fixed) defaultVariant = fixed;
    }

    return defaultVariant;
  }

  // Renders one radio option per offer product (flavor) plus a single Add
  // button — a customer who already added the matching flavor still sees the
  // *other* flavors offered as options, but picks exactly one at a time
  // (same pattern as the Tool A popup). Plain append into `root` — the
  // caller (inline cart-page block, or the drawer) owns any surrounding
  // chrome. `onAdded`, if given, runs instead of the default full-page
  // reload after a successful add (the drawer uses this to refresh itself
  // in place without losing its open state).
  function renderBundle(root, rule, cart, cartVariantIds, onAdded) {
    var anchor = anchorLineItemFor(rule, cart);

    var options = [];
    rule.offers.forEach(function (offer) {
      offer.products.forEach(function (product) {
        if (product.variants.length === 0) return;
        var variant = defaultVariantFor(offer, product, anchor);
        if (rule.display.hideIfOfferAlreadyInCart && cartVariantIds.indexOf(variant.id) !== -1) return;
        options.push({ product: product, variant: variant });
      });
    });

    if (options.length === 0) return false;

    var radioName = "upsell-bundle-offer-" + rule.id;

    var box = document.createElement("div");
    box.className = "upsell-bundle-box";
    box.innerHTML =
      (rule.display.headline ? '<h3 class="upsell-bundle-headline"></h3>' : "") +
      (rule.display.subheading ? '<p class="upsell-bundle-subheading"></p>' : "") +
      '<div class="upsell-options"></div>' +
      '<button type="button" class="upsell-add-btn"></button>';

    if (rule.display.headline) box.querySelector(".upsell-bundle-headline").textContent = rule.display.headline;
    if (rule.display.subheading) box.querySelector(".upsell-bundle-subheading").textContent = rule.display.subheading;

    var optionsEl = box.querySelector(".upsell-options");

    options.forEach(function (option, index) {
      var title =
        option.variant.title && option.variant.title !== "Default Title"
          ? option.product.title + " – " + option.variant.title
          : option.product.title;

      var label = document.createElement("label");
      label.className = "upsell-option";
      label.innerHTML =
        '<input type="radio" name="' +
        radioName +
        '" value="' +
        option.variant.id +
        '"' +
        (index === 0 ? " checked" : "") +
        ">" +
        (option.product.image ? '<img src="' + option.product.image + '" alt="" loading="lazy">' : "") +
        '<span class="upsell-option-title"></span>' +
        '<span class="upsell-option-price">' + U.priceMarkup(rule, option.variant) + "</span>";

      label.querySelector(".upsell-option-title").textContent = title;

      optionsEl.appendChild(label);
    });

    var addBtn = box.querySelector(".upsell-add-btn");
    addBtn.textContent = rule.display.buttonText || "Add to cart";
    U.applyDisplayStyles(box, addBtn, rule.display);
    addBtn.addEventListener("click", function () {
      var selected = box.querySelector('input[name="' + radioName + '"]:checked');
      if (!selected) return;
      addBtn.disabled = true;
      U.addToCart([
        {
          id: selected.value.split("/").pop(),
          quantity: 1,
          properties: { _upsell_rule_id: rule.id, _upsell_source: "cart_bundle" },
        },
      ])
        .then(function () {
          U.markAccepted(rule.id);
          U.postEvent(rule.id, "accepted");
          if (onAdded) {
            onAdded();
          } else {
            window.location.reload();
          }
        })
        .catch(function () {
          addBtn.disabled = false;
          var error = box.querySelector(".upsell-error");
          if (!error) {
            error = document.createElement("p");
            error.className = "upsell-error";
            error.textContent = "Couldn't add that to your cart. Please try again.";
            addBtn.insertAdjacentElement("beforebegin", error);
          }
        });
    });

    root.appendChild(box);
    U.postEvent(rule.id, "shown");
    return true;
  }

  // ---------- Inline mode: merchant placed the block directly in a theme
  // section that supports app blocks (typically the cart page/drawer) ----------

  function initInlineCartBundle(root) {
    U.getRules().then(function (data) {
      if (!data.cartBundleEnabled) return;
      var bundleRules = data.rules.filter(function (r) {
        return r.toolType === "CART_BUNDLE";
      });
      if (bundleRules.length === 0) return;

      refreshInlineBundle(root, bundleRules);

      // Real add-to-cart signal (from the shared interception layer) — no
      // more guessing/polling needed for this trigger.
      U.onCartAdd(function () {
        refreshInlineBundle(root, bundleRules);
      });

      // Still listen for the theme's own refresh events and poll as a
      // fallback for changes we can't otherwise observe (e.g. a quantity
      // stepper on the cart page itself, which doesn't go through
      // /cart/add and so isn't covered by onCartAdd).
      document.addEventListener("cart:refresh", function () {
        refreshInlineBundle(root, bundleRules);
      });
      document.addEventListener("cart:build", function () {
        refreshInlineBundle(root, bundleRules);
      });
      setInterval(function () {
        if (root.isConnected) refreshInlineBundle(root, bundleRules);
      }, 2000);
    });
  }

  function refreshInlineBundle(root, rules) {
    U.getCart()
      .then(function (cart) {
        var signature = cart.items
          .map(function (i) {
            return i.variant_id + "x" + i.quantity;
          })
          .join(",");
        if (signature === root.dataset.upsellSignature) return;
        root.dataset.upsellSignature = signature;

        var cartProductIds = cart.items.map(function (i) {
          return U.toGid("Product", i.product_id);
        });
        var cartVariantIds = cart.items.map(function (i) {
          return U.toGid("ProductVariant", i.variant_id);
        });

        root.innerHTML = "";

        var matches = rules
          .filter(function (r) {
            return r.triggerProductIds.some(function (id) {
              return cartProductIds.indexOf(id) !== -1;
            });
          })
          .sort(function (a, b) {
            return b.priority - a.priority;
          });

        matches.forEach(function (rule) {
          renderBundle(root, rule, cart, cartVariantIds);
        });
      })
      .catch(function () {});
  }

  // ---------- Drawer mode: no inline block on this page — take over the
  // cart icon and show a full replacement drawer ----------
  //
  // Because upsell-common.js's interception fully owns the add-to-cart form
  // submission and the cart-icon click (preventDefault + stopPropagation
  // before the theme's own handlers ever run), the theme's native drawer
  // never opens in the first place — there's nothing left to race against,
  // unlike the previous version which merely watched for changes alongside
  // whatever the theme was independently doing.
  function initDrawer() {
    var overlay = document.createElement("div");
    overlay.className = "upsell-drawer-overlay";
    overlay.innerHTML =
      '<div class="upsell-drawer" role="dialog" aria-modal="true">' +
      '<div class="upsell-drawer-header">' +
      '<span class="upsell-drawer-title">Cart <span class="upsell-drawer-count"></span></span>' +
      '<button type="button" class="upsell-close" aria-label="Close">&times;</button>' +
      "</div>" +
      '<div class="upsell-drawer-body">' +
      '<div class="upsell-drawer-bundle"></div>' +
      '<div class="upsell-drawer-lines"></div>' +
      "</div>" +
      '<div class="upsell-drawer-footer">' +
      '<span class="upsell-drawer-subtotal"></span>' +
      '<a href="/checkout" class="upsell-drawer-checkout-btn">Checkout</a>' +
      "</div>" +
      "</div>";
    document.body.appendChild(overlay);

    function close() {
      overlay.classList.remove("upsell-drawer-open");
    }

    function open() {
      overlay.classList.add("upsell-drawer-open");
      refresh();
    }

    overlay.querySelector(".upsell-close").addEventListener("click", close);
    overlay.addEventListener("click", function (e) {
      if (e.target === overlay) close();
    });

    var bundleRulesPromise = U.getRules().then(function (data) {
      if (!data.cartBundleEnabled) return [];
      return data.rules.filter(function (r) {
        return r.toolType === "CART_BUNDLE";
      });
    });

    function renderLines(cart) {
      var linesEl = overlay.querySelector(".upsell-drawer-lines");
      linesEl.innerHTML = "";
      overlay.querySelector(".upsell-drawer-count").textContent = cart.item_count;

      cart.items.forEach(function (item) {
        var title =
          item.variant_title && item.variant_title !== "Default Title"
            ? item.product_title + " – " + item.variant_title
            : item.product_title;
        var hasDiscount = item.original_price !== item.price;

        var row = document.createElement("div");
        row.className = "upsell-drawer-line";
        row.innerHTML =
          (item.image ? '<img src="' + item.image + '" alt="" loading="lazy">' : "") +
          '<div class="upsell-drawer-line-info">' +
          '<span class="upsell-drawer-line-title"></span>' +
          '<span class="upsell-option-price">' +
          (hasDiscount
            ? '<span class="upsell-price-original">' + U.formatMoney(item.original_price / 100) + "</span>"
            : "") +
          '<span class="upsell-price-final">' + U.formatMoney(item.price / 100) + "</span>" +
          "</span>" +
          '<div class="upsell-drawer-line-qty">' +
          '<button type="button" class="upsell-qty-minus" aria-label="Decrease quantity">&minus;</button>' +
          '<span class="upsell-qty-value"></span>' +
          '<button type="button" class="upsell-qty-plus" aria-label="Increase quantity">+</button>' +
          "</div>" +
          "</div>" +
          '<button type="button" class="upsell-drawer-line-remove" aria-label="Remove">&times;</button>';

        row.querySelector(".upsell-drawer-line-title").textContent = title;
        row.querySelector(".upsell-qty-value").textContent = item.quantity;

        // /cart/change.js already responds with the full updated cart (same
        // shape as /cart.js) — render that directly instead of following up
        // with a second, redundant /cart.js fetch.
        row.querySelector(".upsell-qty-minus").addEventListener("click", function () {
          U.updateLineQuantity(item.key, Math.max(0, item.quantity - 1)).then(applyCart);
        });
        row.querySelector(".upsell-qty-plus").addEventListener("click", function () {
          U.updateLineQuantity(item.key, item.quantity + 1).then(applyCart);
        });
        row.querySelector(".upsell-drawer-line-remove").addEventListener("click", function () {
          U.updateLineQuantity(item.key, 0).then(applyCart);
        });

        linesEl.appendChild(row);
      });
    }

    function renderBundleSection(cart, bundleRules) {
      var bundleEl = overlay.querySelector(".upsell-drawer-bundle");
      bundleEl.innerHTML = "";

      var cartProductIds = cart.items.map(function (i) {
        return U.toGid("Product", i.product_id);
      });
      var cartVariantIds = cart.items.map(function (i) {
        return U.toGid("ProductVariant", i.variant_id);
      });

      var matches = bundleRules
        .filter(function (r) {
          return r.triggerProductIds.some(function (id) {
            return cartProductIds.indexOf(id) !== -1;
          });
        })
        .sort(function (a, b) {
          return b.priority - a.priority;
        });

      matches.forEach(function (rule) {
        renderBundle(bundleEl, rule, cart, cartVariantIds, refresh);
      });
    }

    function applyCart(cart) {
      U.syncThemeCartCount(cart);
      try {
        renderLines(cart);
        overlay.querySelector(".upsell-drawer-subtotal").textContent =
          "Subtotal: " + U.formatMoney(cart.total_price / 100);
      } catch (err) {
        console.error("[upsell] drawer line rendering failed:", err);
      }

      bundleRulesPromise.then(function (bundleRules) {
        try {
          renderBundleSection(cart, bundleRules);
        } catch (err) {
          console.error("[upsell] drawer bundle rendering failed:", err);
        }
      });
    }

    function refresh() {
      U.getCart().then(applyCart);
    }

    U.onCartAdd(function (cart, addedProductIds) {
      // If Tool A's popup is about to claim this same add-to-cart event, let
      // it have the moment uninterrupted — don't have the drawer pop open on
      // top of (and hide) the popup before the customer can pick an option.
      // The drawer is still one click away via the cart icon.
      U.getRules().then(function (data) {
        var popupRules = data.popupEnabled
          ? data.rules.filter(function (r) {
              return r.toolType === "POPUP";
            })
          : [];
        var popupWillShow = U.pickMatchingRule(popupRules, addedProductIds);
        if (!popupWillShow) open();
      });
    });

    U.onCartIconClick(open);
  }

  document.addEventListener("DOMContentLoaded", function () {
    var inlineRoot = document.getElementById(CART_BUNDLE_ROOT_ID);
    if (inlineRoot) {
      initInlineCartBundle(inlineRoot);
    } else {
      initDrawer();
    }
  });
})();
