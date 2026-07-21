(function () {
  "use strict";

  // Both blocks (popup embed + cart bundle) load this same asset; the script
  // tag can legitimately appear twice on one page (e.g. cart page with the
  // global embed still active), so guard against double-initialization.
  if (window.__upsellExtensionLoaded) return;
  window.__upsellExtensionLoaded = true;

  var POPUP_ROOT_ID = "upsell-popup-root";
  var CART_BUNDLE_ROOT_ID = "upsell-cart-bundle-root";

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

  function notifyThemeCartChanged() {
    document.dispatchEvent(new CustomEvent("cart:refresh"));
    document.dispatchEvent(new CustomEvent("cart:build"));
  }

  // ---------- Tool A: post-add-to-cart popup ----------

  function initPopup(root) {
    getRules().then(function (data) {
      if (!data.popupEnabled) return;
      var popupRules = data.rules.filter(function (r) {
        return r.toolType === "POPUP";
      });
      if (popupRules.length === 0) return;
      watchAddToCart(function (addedProductIds) {
        var match = pickMatchingRule(popupRules, addedProductIds);
        if (match) maybeShowPopup(root, match);
      });
    });
  }

  function pickMatchingRule(rules, addedProductIds) {
    var matches = rules
      .filter(function (r) {
        return r.triggerProductIds.some(function (id) {
          return addedProductIds.indexOf(id) !== -1;
        });
      })
      .filter(function (r) {
        return !alreadyAccepted(r.id);
      })
      .filter(function (r) {
        return r.display.maxImpressionsPerSession === 0 || timesShown(r.id) < r.display.maxImpressionsPerSession;
      })
      .sort(function (a, b) {
        return b.priority - a.priority;
      });
    return matches[0] || null;
  }

  // Intercepts the Ajax Cart API directly, so this fires regardless of which
  // theme/section triggered the add (PDP, quick-buy, collection card, etc.).
  function watchAddToCart(callback) {
    var originalFetch = window.fetch;
    window.fetch = function (input, init) {
      var url = typeof input === "string" ? input : input && input.url;
      var method = (init && init.method) || (typeof input !== "string" && input && input.method) || "GET";
      var isAdd = url && url.indexOf("/cart/add") !== -1 && method.toUpperCase() === "POST";
      var result = originalFetch.apply(this, arguments);
      if (isAdd) {
        result
          .then(function (res) {
            return res.clone().json();
          })
          .then(function (data) {
            var items = data.items || (data.id ? [data] : []);
            var productIds = items
              .map(function (i) {
                return i.product_id ? toGid("Product", i.product_id) : null;
              })
              .filter(Boolean);
            if (productIds.length) callback(productIds);
          })
          .catch(function () {});
      }
      return result;
    };
  }

  function maybeShowPopup(root, rule) {
    var proceed = function () {
      renderPopup(root, rule);
      markShown(rule.id);
      postEvent(rule.id, "shown");
    };

    if (!rule.display.hideIfOfferAlreadyInCart) {
      proceed();
      return;
    }

    getCart()
      .then(function (cart) {
        var cartVariantIds = cart.items.map(function (i) {
          return toGid("ProductVariant", i.variant_id);
        });
        var offerVariantIds = rule.offers.reduce(function (acc, offer) {
          offer.products.forEach(function (p) {
            p.variants.forEach(function (v) {
              acc.push(v.id);
            });
          });
          return acc;
        }, []);
        var alreadyInCart = offerVariantIds.some(function (id) {
          return cartVariantIds.indexOf(id) !== -1;
        });
        if (!alreadyInCart) proceed();
      })
      .catch(proceed);
  }

  function renderPopup(root, rule) {
    var offer = rule.offers[0];
    if (!offer || offer.products.length === 0) return;

    var overlay = document.createElement("div");
    overlay.className = "upsell-overlay";
    overlay.innerHTML =
      '<div class="upsell-modal" role="dialog" aria-modal="true">' +
      '<button type="button" class="upsell-close" aria-label="Close">&times;</button>' +
      (rule.display.headline ? '<h2 class="upsell-headline"></h2>' : "") +
      (rule.display.subheading ? '<p class="upsell-subheading"></p>' : "") +
      '<div class="upsell-options"></div>' +
      '<button type="button" class="upsell-add-btn"></button>' +
      "</div>";

    if (rule.display.headline) overlay.querySelector(".upsell-headline").textContent = rule.display.headline;
    if (rule.display.subheading) overlay.querySelector(".upsell-subheading").textContent = rule.display.subheading;

    var optionsEl = overlay.querySelector(".upsell-options");
    offer.products.forEach(function (product, index) {
      var variant = product.variants.filter(function (v) {
        return v.availableForSale;
      })[0] || product.variants[0];
      if (!variant) return;
      var label = document.createElement("label");
      label.className = "upsell-option";
      label.innerHTML =
        '<input type="radio" name="upsell-offer" value="' +
        variant.id +
        '"' +
        (index === 0 ? " checked" : "") +
        ">" +
        (product.image ? '<img src="' + product.image + '" alt="" loading="lazy">' : "") +
        '<span class="upsell-option-title">' + product.title + "</span>" +
        '<span class="upsell-option-price">' +
        (rule.discount.mode === "FREE" ? "Free" : formatMoney(variant.price)) +
        "</span>";
      optionsEl.appendChild(label);
    });

    var addBtn = overlay.querySelector(".upsell-add-btn");
    addBtn.textContent = rule.display.buttonText || "Add to cart";
    addBtn.addEventListener("click", function () {
      var selected = overlay.querySelector('input[name="upsell-offer"]:checked');
      if (!selected) return;
      addBtn.disabled = true;
      var variantId = selected.value.split("/").pop();
      addToCart([
        {
          id: variantId,
          quantity: 1,
          properties: { _upsell_rule_id: rule.id, _upsell_source: "popup" },
        },
      ])
        .then(function () {
          markAccepted(rule.id);
          postEvent(rule.id, "accepted");
          notifyThemeCartChanged();
          close();
        })
        .catch(function () {
          addBtn.disabled = false;
        });
    });

    function close() {
      if (!alreadyAccepted(rule.id)) postEvent(rule.id, "dismissed");
      overlay.remove();
    }

    overlay.querySelector(".upsell-close").addEventListener("click", close);
    overlay.addEventListener("click", function (e) {
      if (e.target === overlay) close();
    });

    root.appendChild(overlay);
  }

  // ---------- Tool B: cart page bundle builder ----------

  function initCartBundle(root) {
    getRules().then(function (data) {
      if (!data.cartBundleEnabled) return;
      var bundleRules = data.rules.filter(function (r) {
        return r.toolType === "CART_BUNDLE";
      });
      if (bundleRules.length === 0) return;
      refreshCartBundle(root, bundleRules);
      document.addEventListener("cart:refresh", function () {
        refreshCartBundle(root, bundleRules);
      });
      document.addEventListener("cart:build", function () {
        refreshCartBundle(root, bundleRules);
      });
    });
  }

  function refreshCartBundle(root, rules) {
    getCart()
      .then(function (cart) {
        var cartProductIds = cart.items.map(function (i) {
          return toGid("Product", i.product_id);
        });
        var cartVariantIds = cart.items.map(function (i) {
          return toGid("ProductVariant", i.variant_id);
        });

        root.innerHTML = "";

        var matches = rules
          .filter(function (r) {
            return r.triggerProductIds.some(function (id) {
              return cartProductIds.indexOf(id) !== -1;
            });
          })
          .filter(function (r) {
            if (!r.display.hideIfOfferAlreadyInCart) return true;
            var offerVariantIds = r.offers.reduce(function (acc, offer) {
              offer.products.forEach(function (p) {
                p.variants.forEach(function (v) {
                  acc.push(v.id);
                });
              });
              return acc;
            }, []);
            return !offerVariantIds.some(function (id) {
              return cartVariantIds.indexOf(id) !== -1;
            });
          })
          .sort(function (a, b) {
            return b.priority - a.priority;
          });

        matches.forEach(function (rule) {
          renderBundle(root, rule, cart);
        });
      })
      .catch(function () {});
  }

  function anchorLineItemFor(rule, cart) {
    for (var i = 0; i < cart.items.length; i++) {
      var item = cart.items[i];
      if (rule.triggerProductIds.indexOf(toGid("Product", item.product_id)) !== -1) return item;
    }
    return null;
  }

  function renderBundle(root, rule, cart) {
    var anchor = anchorLineItemFor(rule, cart);
    var box = document.createElement("div");
    box.className = "upsell-bundle-box";
    box.innerHTML =
      (rule.display.headline ? '<h3 class="upsell-bundle-headline"></h3>' : "") +
      (rule.display.subheading ? '<p class="upsell-bundle-subheading"></p>' : "") +
      '<div class="upsell-bundle-slots"></div>' +
      '<button type="button" class="upsell-bundle-add-btn"></button>';

    if (rule.display.headline) box.querySelector(".upsell-bundle-headline").textContent = rule.display.headline;
    if (rule.display.subheading) box.querySelector(".upsell-bundle-subheading").textContent = rule.display.subheading;

    var slotsEl = box.querySelector(".upsell-bundle-slots");
    var slotState = [];

    rule.offers.forEach(function (offer, offerIndex) {
      var product = offer.products[0];
      if (!product || product.variants.length === 0) return;

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

      slotState[offerIndex] = defaultVariant.id;

      var slot = document.createElement("div");
      slot.className = "upsell-bundle-slot";
      var showPicker = offer.variantOptionMode !== "FIXED" && product.variants.length > 1;

      slot.innerHTML =
        (product.image ? '<img src="' + product.image + '" alt="" loading="lazy">' : "") +
        '<span class="upsell-bundle-slot-title">' + product.title + "</span>";

      if (showPicker) {
        var select = document.createElement("select");
        select.className = "upsell-bundle-slot-select";
        product.variants.forEach(function (v) {
          var option = document.createElement("option");
          option.value = v.id;
          option.textContent = v.title;
          option.disabled = !v.availableForSale;
          if (v.id === defaultVariant.id) option.selected = true;
          select.appendChild(option);
        });
        select.addEventListener("change", function () {
          slotState[offerIndex] = select.value;
        });
        slot.appendChild(select);
      }

      slotsEl.appendChild(slot);
    });

    var addBtn = box.querySelector(".upsell-bundle-add-btn");
    addBtn.textContent = rule.display.buttonText || "Add bundle to cart";
    addBtn.addEventListener("click", function () {
      addBtn.disabled = true;
      var items = slotState
        .filter(Boolean)
        .map(function (variantGid) {
          return {
            id: variantGid.split("/").pop(),
            quantity: 1,
            properties: { _upsell_rule_id: rule.id, _upsell_source: "cart_bundle" },
          };
        });
      addToCart(items)
        .then(function () {
          markAccepted(rule.id);
          postEvent(rule.id, "accepted");
          window.location.reload();
        })
        .catch(function () {
          addBtn.disabled = false;
        });
    });

    root.appendChild(box);
    postEvent(rule.id, "shown");
  }

  // ---------- boot ----------

  document.addEventListener("DOMContentLoaded", function () {
    var popupRoot = document.getElementById(POPUP_ROOT_ID);
    if (popupRoot) initPopup(popupRoot);

    var cartRoot = document.getElementById(CART_BUNDLE_ROOT_ID);
    if (cartRoot) initCartBundle(cartRoot);
  });
})();
