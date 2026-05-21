// ==UserScript==
// @name         Torn Quality Badge Repositioner
// @namespace    https://www.torn.com/
// @version      1.0.1
// @description  Moves the quality badge (from Torn Gear Quality Visualizer) from the item image to after the item name
// @author       Galaaz86 [4178341]
// @license      MIT License
// @match        https://www.torn.com/item.php*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    const BADGE_CLASS = 'torn-heat-quality-badge';
    const LABEL_CLASS = 'tt-quality-inline-label';

    function findNameElement(badge) {
        // item.php / dump.php / factions.php: .image-wrap > .title > .name
        const imageWrap = badge.closest('.image-wrap');
        if (imageWrap) {
            return imageWrap.closest('.title, li')?.querySelector('.name, .t-overflow') || null;
        }

        // bazaar.php: imgBar > item card > name
        const imgBar = badge.closest('[class*="imgBar___"]');
        if (imgBar) {
            return imgBar.closest('[data-testid="item"]')?.querySelector('[data-testid="name"]') || null;
        }

        // item market / auction house: imageWrapper > tile > title
        const imgWrapper = badge.closest('[class*="imageWrapper___"], [class*="img-wrap"], .img-wrap');
        if (imgWrapper) {
            return imgWrapper.closest('li, [class*="itemTile___"], .item-cont-wrap')
                ?.querySelector('[class*="title___"], .item-name, .name') || null;
        }

        return null;
    }

    function processAll() {
        document.querySelectorAll(`.${BADGE_CLASS}`).forEach(badge => {
            // Skip badges already handled
            if (badge.dataset.repositioned) return;

            const name = findNameElement(badge);
            if (!name) return;

            // Skip if a label already exists next to this name
            if (name.nextElementSibling?.classList?.contains(LABEL_CLASS)) return;

            // Hide the original badge in place so the original script can still find it
            // and won't recreate it — preventing an infinite loop
            badge.dataset.repositioned = '1';
            badge.style.display = 'none';

            // Create a separate inline label after the item name
            const label = document.createElement('span');
            label.className = LABEL_CLASS;
            label.style.cssText = `
                color: ${badge.style.color};
                font-size: 11px;
                font-weight: bold;
                margin-left: 5px;
            `;
            label.textContent = badge.textContent;
            name.after(label);
        });
    }

    // Poll instead of using MutationObserver to avoid triggering the original script's
    // observer in a loop (any DOM change re-runs the original script)
    setInterval(processAll, 300);
})();
