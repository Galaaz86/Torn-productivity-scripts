// ==UserScript==
// @name         Torn Bazaar Fill Max Auto-Buy
// @namespace    https://www.torn.com/
// @version      1.0.0
// @description  Automatically clicks the Buy button after "fill max" is clicked in the bazaar
// @author       Galaaz86 [4178341]
// @license      MIT License
// @match        https://www.torn.com/bazaar.php*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    /**
     * When "fill max" is clicked, find the sibling Buy button and click it.
     * We use event delegation on document so it works even after React re-renders.
     */
    document.addEventListener('click', function (e) {
        // Check if the clicked element is a "fill max" span
        const fillMax = e.target.closest('._tt-max-buy-bazaar_zhj6o_15, ._tt-max-buy_zhj6o_4');
        if (!fillMax) return;

        // The Buy button is a sibling inside the same .field container
        const field = fillMax.closest('.field___HUSnv') || fillMax.parentElement;
        if (!field) return;

        const buyBtn = field.querySelector('[data-testid="buy-button"]');
        if (!buyBtn) return;

        // Small delay to let Torn/React update the quantity input after fill max
        setTimeout(function () {
            //console.log('[Torn Fill Max Auto-Buy] Clicking Buy after fill max.');
            buyBtn.click();
        }, 150);
    }, true); // useCapture = true to catch the event early

    //console.log('[Torn Fill Max Auto-Buy] Watching for fill max clicks…');
})();
