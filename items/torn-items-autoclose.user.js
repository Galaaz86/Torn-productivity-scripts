// ==UserScript==
// @name         Torn Items Auto-Close
// @namespace    https://www.torn.com/
// @version      1.1.0
// @description  Automatically clicks "Close" after selling an item on the items page
// @author       Galaaz86 [4178341]
// @license      MIT License
// @match        https://www.torn.com/item.php*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    function autoClose() {
        const sellDialog = document.querySelector('.action-wrap.sell-act[data-action="sellItem"]');
        if (!sellDialog) return;

        const isVisible = sellDialog.style.display === 'block';
        if (!isVisible) return;

        // The dialog cycles through three states: sell form (has inputs), confirmation
        // (has a.next-act = Yes button), and result (neither). Only close at the result step.
        if (sellDialog.querySelector('input')) return;
        if (sellDialog.querySelector('a.next-act')) return;

        const closeBtn = sellDialog.querySelector('a.close-act');
        if (!closeBtn) return;

        closeBtn.click();
    }

    const observer = new MutationObserver(function (mutations) {
        for (const mutation of mutations) {
            // Watch for the sell dialog becoming visible (style attribute change)
            if (
                mutation.type === 'attributes' &&
                mutation.attributeName === 'style' &&
                mutation.target.matches?.('.action-wrap.sell-act[data-action="sellItem"]')
            ) {
                setTimeout(autoClose, 80);
                return;
            }

            // Also watch for the close button being added to the DOM
            if (mutation.type === 'childList') {
                for (const node of mutation.addedNodes) {
                    if (node.nodeType !== Node.ELEMENT_NODE) continue;
                    if (
                        node.matches?.('a.close-act') ||
                        node.querySelector?.('a.close-act')
                    ) {
                        setTimeout(autoClose, 80);
                        return;
                    }
                }
            }
        }
    });

    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['style'] });

    // Polling fallback: handles cases where the result dialog appears without a detectable
    // mutation (e.g. after a confirm-helper right-click cancel bypasses Torn's normal transition)
    setInterval(autoClose, 300);
})();
