(function () {
  "use strict";

  if (window.__upsellPopupLoaded) return;
  window.__upsellPopupLoaded = true;

  var POPUP_ROOT_ID = "upsell-popup-root";

  var U = window.UpsellCommon;

  function initPopup(root) {
    U.onCartAdd(function (cart, addedProductIds) {
      U.getRules().then(function (data) {
        if (!data.popupEnabled) return;
        var popupRules = data.rules.filter(function (r) {
          return r.toolType === "POPUP";
        });
        var match = U.pickMatchingRule(popupRules, addedProductIds);
        if (match) maybeShowPopup(root, match);
      });
    });
  }

  function maybeShowPopup(root, rule) {
    if (root.querySelector(".upsell-overlay")) return;

    var proceed = function () {
      renderPopup(root, rule);
      U.markShown(rule.id);
      U.postEvent(rule.id, "shown");
    };

    if (!rule.display.hideIfOfferAlreadyInCart) {
      proceed();
      return;
    }

    U.getCart()
      .then(function (cart) {
        var cartVariantIds = cart.items.map(function (i) {
          return U.toGid("ProductVariant", i.variant_id);
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
        '<span class="upsell-option-price">' + U.priceMarkup(rule, variant) + "</span>";
      optionsEl.appendChild(label);
    });

    var addBtn = overlay.querySelector(".upsell-add-btn");
    addBtn.textContent = rule.display.buttonText || "Add to cart";
    U.applyDisplayStyles(overlay.querySelector(".upsell-modal"), addBtn, rule.display);
    addBtn.addEventListener("click", function () {
      var selected = overlay.querySelector('input[name="upsell-offer"]:checked');
      if (!selected) return;
      addBtn.disabled = true;
      var variantId = selected.value.split("/").pop();
      U.addToCart([
        {
          id: variantId,
          quantity: 1,
          properties: { _upsell_rule_id: rule.id, _upsell_source: "popup" },
        },
      ])
        .then(function () {
          U.markAccepted(rule.id);
          U.postEvent(rule.id, "accepted");
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
      if (!U.alreadyAccepted(rule.id)) U.postEvent(rule.id, "dismissed");
      overlay.remove();
    }

    overlay.querySelector(".upsell-close").addEventListener("click", close);
    overlay.addEventListener("click", function (e) {
      if (e.target === overlay) close();
    });

    root.appendChild(overlay);
  }

  document.addEventListener("DOMContentLoaded", function () {
    var popupRoot = document.getElementById(POPUP_ROOT_ID);
    if (popupRoot) initPopup(popupRoot);
  });
})();
