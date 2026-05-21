// ==UserScript==
// @name         Torn Bazaar Auto-Confirm
// @namespace    https://www.torn.com/
// @version      1.0.1
// @description  Automatically clicks "Yes" on bazaar purchase confirmation dialogs
// @author       Galaaz86 [4178341]
// @license      MIT License
// @match        https://www.torn.com/bazaar.php*
// @match        https://www.torn.com/*
// @grant        none
// @run-at       document-idle
// @all-frames   true
// @downloadURL https://update.greasyfork.org/scripts/579009/Torn%20Bazaar%20Auto-Confirm.user.js
// @updateURL https://update.greasyfork.org/scripts/579009/Torn%20Bazaar%20Auto-Confirm.meta.js
// ==/UserScript==

(function () {
    'use strict';

    /**
     * Try to click the "Yes" button inside a buy confirmation dialog.
     * Returns true if found and clicked, false otherwise.
     */
    function autoConfirm() {
        const dialog = document.querySelector('[data-testid="buy-confirmation"]');
        if (!dialog) return false;

        const yesBtn = dialog.querySelector('button[aria-label="Yes"]');
        if (!yesBtn) return false;

        //console.log('[Torn Auto-Confirm] Clicking Yes on purchase dialog.');
        yesBtn.click();
        waitForResultPopupAndDismiss();
        return true;
    }

    function waitForResultPopupAndDismiss() {
        const start = Date.now();
        const interval = setInterval(() => {
            if (Date.now() - start > 3000) {
                clearInterval(interval);
                return;
            }
            const successMsg = document.querySelector('[data-testid="success-message"][aria-label="Success"]');
            if (!successMsg) return;
            clearInterval(interval);
            successMsg.style.display = 'none';
        }, 100);
    }

    /**
     * Watch for the confirmation dialog being added to the DOM.
     * Torn is a React SPA — the dialog is injected dynamically.
     */
    const observer = new MutationObserver(function (mutations) {
        for (const mutation of mutations) {
            for (const node of mutation.addedNodes) {
                if (node.nodeType !== Node.ELEMENT_NODE) continue;

                // Check if the added node IS the dialog, or contains it
                if (
                    node.matches?.('[data-testid="buy-confirmation"]') ||
                    node.querySelector?.('[data-testid="buy-confirmation"]')
                ) {
                    // Small delay so React can finish rendering the button
                    setTimeout(autoConfirm, 80);
                    return;
                }
            }
        }
    });

    observer.observe(document.body, { childList: true, subtree: true });

    //console.log('[Torn Auto-Confirm] Watching for purchase dialogs…');
})();
