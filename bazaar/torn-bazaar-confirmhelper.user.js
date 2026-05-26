// ==UserScript==
// @name         Torn Confirm Helper
// @namespace    https://www.torn.com/
// @version      2.0.0
// @description  Shows a full-screen click zone on purchase/sell confirmations — left click to confirm, right click or Esc to cancel
// @author       Galaaz86 [4178341]
// @license      MIT License
// @match        https://www.torn.com/bazaar.php*
// @match        https://www.torn.com/item.php*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    let mouseX = 0, mouseY = 0;
    let overlay = null;
    let dialogWatcher = null;
    let escHandler = null;

    document.addEventListener('mousemove', e => {
        mouseX = e.clientX;
        mouseY = e.clientY;
    }, { passive: true });

    function removeOverlay() {
        if (overlay) { overlay.remove(); overlay = null; }
        if (dialogWatcher) { dialogWatcher.disconnect(); dialogWatcher = null; }
        if (escHandler) { document.removeEventListener('keydown', escHandler); escHandler = null; }
    }

    function waitForResultPopupAndDismiss() {
        const start = Date.now();
        const interval = setInterval(() => {
            if (Date.now() - start > 3000) { clearInterval(interval); return; }
            const successMsg = document.querySelector('[data-testid="success-message"][aria-label="Success"]');
            if (!successMsg) return;
            clearInterval(interval);
            successMsg.style.display = 'none';
        }, 100);
    }

    function findDialog() {
        // Bazaar: React dialog
        const bzDialog = document.querySelector('[data-testid="buy-confirmation"]');
        if (bzDialog) {
            const yesBtn = bzDialog.querySelector('button[aria-label="Yes"]');
            const noBtn  = bzDialog.querySelector('button[aria-label="No"]');
            if (yesBtn) return { dialog: bzDialog, yesBtn, noBtn };
        }

        // item.php: classic action-wrap shown via display:block
        const actionWrap = document.querySelector('.action-wrap[style*="display: block"]');
        if (actionWrap) {
            const yesBtn = actionWrap.querySelector('a.next-act');
            const noBtn  = actionWrap.querySelector('a.close-act');
            if (yesBtn) return { dialog: actionWrap, yesBtn, noBtn };
        }

        return null;
    }

    function createOverlay() {
        removeOverlay();

        const found = findDialog();
        if (!found) return;
        const { dialog, yesBtn, noBtn } = found;

        overlay = document.createElement('div');
        overlay.style.cssText = `
            position: fixed;
            inset: 0;
            z-index: 99999;
            cursor: pointer;
            background: transparent;
        `;

        const hint = document.createElement('div');
        hint.innerHTML = `
            <span style="color:#4caf50">Click to confirm</span><br>
            <span style="color:#e53935">Right click or Esc to cancel</span>
        `;
        hint.style.cssText = `
            position: absolute;
            left: ${mouseX}px;
            top: ${mouseY - 52}px;
            transform: translateX(-50%);
            background: rgba(0,0,0,0.75);
            font: bold 13px sans-serif;
            padding: 6px 12px;
            border-radius: 6px;
            pointer-events: none;
            white-space: nowrap;
            text-align: center;
            line-height: 1.6;
        `;
        overlay.appendChild(hint);

        overlay.addEventListener('click', () => {
            yesBtn.click();
            removeOverlay();
            waitForResultPopupAndDismiss();
        });

        overlay.addEventListener('contextmenu', e => {
            e.preventDefault();
            if (noBtn) noBtn.click();
            removeOverlay();
        });

        escHandler = e => {
            if (e.key === 'Escape') {
                if (noBtn) noBtn.click();
                removeOverlay();
            }
        };
        document.addEventListener('keydown', escHandler);

        document.body.appendChild(overlay);

        // Remove overlay when dialog closes or hides
        dialogWatcher = new MutationObserver(() => {
            const still = findDialog();
            if (!still || still.dialog !== dialog) removeOverlay();
        });
        dialogWatcher.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['style'] });
    }

    const observer = new MutationObserver(function (mutations) {
        for (const mutation of mutations) {
            // Bazaar: React injects the dialog as a new node
            if (mutation.type === 'childList') {
                for (const node of mutation.addedNodes) {
                    if (node.nodeType !== Node.ELEMENT_NODE) continue;
                    if (
                        node.matches?.('[data-testid="buy-confirmation"]') ||
                        node.querySelector?.('[data-testid="buy-confirmation"]')
                    ) {
                        setTimeout(createOverlay, 80);
                        return;
                    }
                }
            }

            // item.php: confirmation shown by toggling display:block on .action-wrap
            if (mutation.type === 'attributes' && mutation.attributeName === 'style') {
                const t = mutation.target;
                if (t.classList?.contains('action-wrap') && t.style.display === 'block') {
                    if (t.querySelector('a.next-act')) {
                        setTimeout(createOverlay, 80);
                        return;
                    }
                }
            }
        }
    });

    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['style'] });
})();
