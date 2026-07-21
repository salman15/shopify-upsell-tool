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

  // ---------- Tool A: post-add-to-cart popup ----------

  function initPopup(root) {
    // Install the fetch interceptor immediately, synchronously, on script load —
    // do NOT gate it behind the /apps/upsell/rules fetch resolving. Add-to-cart
    // can happen before that network round trip finishes; if the interceptor
    // isn't installed yet at that moment, the add is silently missed and the
    // popup never fires (this was the cause of "very inconsistent" behavior).
    watchAddToCart(function (addedProductIds) {
      getRules().then(function (data) {
        if (!data.popupEnabled) return;
        var popupRules = data.rules.filter(function (r) {
          return r.toolType === "POPUP";
        });
        var match = pickMatchingRule(popupRules, addedProductIds);
        if (match) maybeShowPopup(root, match);
      });
    });

    // Fallback: some themes (Dawn included) call fetch in a way a page script
    // can't reliably intercept — e.g. a reference to the native fetch
    // captured before this script ran. Poll the cart directly and detect
    // "a trigger product's quantity just went up" as a theme-agnostic backup.
    var lastQuantities = null;
    setInterval(function () {
      getCart().then(function (cart) {
        var quantities = {};
        cart.items.forEach(function (item) {
          quantities[item.variant_id] = item.quantity;
        });

        if (lastQuantities) {
          var addedProductIds = [];
          cart.items.forEach(function (item) {
            var prevQty = lastQuantities[item.variant_id] || 0;
            if (item.quantity > prevQty) addedProductIds.push(toGid("Product", item.product_id));
          });
          if (addedProductIds.length > 0) {
            getRules().then(function (data) {
              if (!data.popupEnabled) return;
              var popupRules = data.rules.filter(function (r) {
                return r.toolType === "POPUP";
              });
              var match = pickMatchingRule(popupRules, addedProductIds);
              if (match) maybeShowPopup(root, match);
            });
          }
        }

        lastQuantities = quantities;
      });
    }, 1500);
  }

  function pickMatchingRule(rules, addedProductIds) {
    // Shows every time the trigger product is added — the only gates are the
    // merchant-configured impression cap (0 = unlimited, the default) and
    // "hide if offer already in cart" (checked in maybeShowPopup), not a
    // one-time-only session flag.
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
    // Both the fetch interceptor and the polling fallback can fire for the
    // same add — never stack two overlays.
    if (root.querySelector(".upsell-overlay")) return;

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
          // Reload rather than relying on theme-specific cart-drawer refresh
          // events (many themes, Dawn included, use an internal pub/sub
          // system that a page script can't hook into), so the added item
          // reliably shows up regardless of theme.
          window.location.reload();
        })
        .catch(function () {
          addBtn.disabled = false;
          var error = overlay.querySelector(".upsell-error");
          if (!error) {
            error = document.createElement("p");
            error.className = "upsell-error";
            error.textContent = "Couldn't add that to your cart. Please try again.";
            addBtn.insertAdjacentElement("beforebegin", error);
          }
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
      // Many themes (Dawn included) open their cart drawer without a page
      // navigation and without dispatching any DOM event we can listen for —
      // their cart state lives in an in-memory pub/sub system we have no
      // access to. Poll while the block is on the page as a theme-agnostic
      // fallback, skipping re-render when the cart hasn't actually changed.
      setInterval(function () {
        if (root.isConnected) refreshCartBundle(root, bundleRules);
      }, 2000);
    });
  }

  function refreshCartBundle(root, rules) {
    getCart()
      .then(function (cart) {
        var signature = cart.items
          .map(function (i) {
            return i.variant_id + "x" + i.quantity;
          })
          .join(",");
        if (signature === root.dataset.upsellSignature) return;
        root.dataset.upsellSignature = signature;

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
          .sort(function (a, b) {
            return b.priority - a.priority;
          });

        matches.forEach(function (rule) {
          renderBundle(root, rule, cart, cartVariantIds);
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

  // Renders one card per offer product (flavor), not one box per rule — so a
  // customer who already added the matching flavor still sees the *other*
  // flavors offered, and each card adds directly with its own button.
  function renderBundle(root, rule, cart, cartVariantIds) {
    var anchor = anchorLineItemFor(rule, cart);

    var cards = [];
    rule.offers.forEach(function (offer) {
      offer.products.forEach(function (product) {
        if (product.variants.length === 0) return;
        var variant = defaultVariantFor(offer, product, anchor);
        if (rule.display.hideIfOfferAlreadyInCart && cartVariantIds.indexOf(variant.id) !== -1) return;
        cards.push({ product: product, variant: variant });
      });
    });

    if (cards.length === 0) return;

    var isFloating = root.classList.contains("upsell-floating");

    var box = document.createElement("div");
    box.className = "upsell-bundle-box";
    box.innerHTML =
      (isFloating ? '<button type="button" class="upsell-close" aria-label="Close">&times;</button>' : "") +
      (rule.display.headline ? '<h3 class="upsell-bundle-headline"></h3>' : "") +
      (rule.display.subheading ? '<p class="upsell-bundle-subheading"></p>' : "") +
      '<div class="upsell-carousel-wrap">' +
      '<button type="button" class="upsell-carousel-arrow upsell-carousel-prev" aria-label="Previous">&#8249;</button>' +
      '<div class="upsell-carousel"></div>' +
      '<button type="button" class="upsell-carousel-arrow upsell-carousel-next" aria-label="Next">&#8250;</button>' +
      "</div>";

    if (rule.display.headline) box.querySelector(".upsell-bundle-headline").textContent = rule.display.headline;
    if (rule.display.subheading) box.querySelector(".upsell-bundle-subheading").textContent = rule.display.subheading;

    if (isFloating) {
      box.querySelector(".upsell-close").addEventListener("click", function () {
        box.remove();
      });
    }

    var track = box.querySelector(".upsell-carousel");

    cards.forEach(function (card) {
      var title =
        card.variant.title && card.variant.title !== "Default Title"
          ? card.product.title + " – " + card.variant.title
          : card.product.title;

      var cardEl = document.createElement("div");
      cardEl.className = "upsell-carousel-card";
      cardEl.innerHTML =
        (card.product.image ? '<img src="' + card.product.image + '" alt="" loading="lazy">' : "") +
        '<span class="upsell-carousel-card-title"></span>' +
        '<span class="upsell-carousel-card-price"></span>' +
        '<button type="button" class="upsell-carousel-add-btn"></button>';

      cardEl.querySelector(".upsell-carousel-card-title").textContent = title;
      cardEl.querySelector(".upsell-carousel-card-price").textContent =
        rule.discount.mode === "FREE" ? "Free" : formatMoney(card.variant.price);

      var addBtn = cardEl.querySelector(".upsell-carousel-add-btn");
      addBtn.textContent = rule.display.buttonText || "Add";
      addBtn.addEventListener("click", function () {
        addBtn.disabled = true;
        addToCart([
          {
            id: card.variant.id.split("/").pop(),
            quantity: 1,
            properties: { _upsell_rule_id: rule.id, _upsell_source: "cart_bundle" },
          },
        ])
          .then(function () {
            markAccepted(rule.id);
            postEvent(rule.id, "accepted");
            window.location.reload();
          })
          .catch(function () {
            addBtn.disabled = false;
            var error = cardEl.querySelector(".upsell-error");
            if (!error) {
              error = document.createElement("span");
              error.className = "upsell-error";
              error.textContent = "Couldn't add — try again.";
              cardEl.appendChild(error);
            }
          });
      });

      track.appendChild(cardEl);
    });

    box.querySelector(".upsell-carousel-prev").addEventListener("click", function () {
      track.scrollBy({ left: -180, behavior: "smooth" });
    });
    box.querySelector(".upsell-carousel-next").addEventListener("click", function () {
      track.scrollBy({ left: 180, behavior: "smooth" });
    });

    root.appendChild(box);
    postEvent(rule.id, "shown");
  }

  // ---------- boot ----------

  document.addEventListener("DOMContentLoaded", function () {
    var popupRoot = document.getElementById(POPUP_ROOT_ID);
    if (popupRoot) initPopup(popupRoot);

    // If no theme section placed the cart-bundle block (many themes' cart
    // drawer sections don't support app blocks at all — Dawn's included),
    // fall back to a floating panel synthesized by the popup's global embed
    // script, so Tool B still reaches customers regardless of theme support.
    var cartRoot = document.getElementById(CART_BUNDLE_ROOT_ID);
    if (!cartRoot && popupRoot) {
      cartRoot = document.createElement("div");
      cartRoot.id = CART_BUNDLE_ROOT_ID;
      cartRoot.className = "upsell-cart-bundle-root upsell-floating";
      document.body.appendChild(cartRoot);
    }
    if (cartRoot) initCartBundle(cartRoot);
  });
})();
