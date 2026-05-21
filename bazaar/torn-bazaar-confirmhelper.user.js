// ==UserScript==
// @name         Torn Bazaar Confirm Helper
// @namespace    https://www.torn.com/
// @version      1.0.0
// @description  Shows a full-screen click zone when a bazaar purchase dialog appears — left click to confirm, right click or Esc to cancel
// @author       Galaaz86 [4178341]
// @license      MIT License
// @match        https://www.torn.com/bazaar.php*
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

    function createOverlay() {
        removeOverlay();

        const dialog = document.querySelector('[data-testid="buy-confirmation"]');
        if (!dialog) return;

        const yesBtn = dialog.querySelector('button[aria-label="Yes"]');
        const noBtn  = dialog.querySelector('button[aria-label="No"]');
        if (!yesBtn) return;

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

        // Remove overlay if the dialog closes on its own
        dialogWatcher = new MutationObserver(() => {
            if (!document.contains(dialog)) removeOverlay();
        });
        dialogWatcher.observe(document.body, { childList: true, subtree: true });
    }

    const observer = new MutationObserver(function (mutations) {
        for (const mutation of mutations) {
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
    });

    observer.observe(document.body, { childList: true, subtree: true });
})();
