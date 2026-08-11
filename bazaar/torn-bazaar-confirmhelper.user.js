// ==UserScript==
// @name         Torn Confirm Helper
// @namespace    https://www.torn.com/
// @version      2.5.0
// @description  Shows a full-screen click zone on purchase/sell confirmations — left click to confirm, right click or Esc to cancel
// @author       Galaaz86 [4178341]
// @license      MIT License
// @match        https://www.torn.com/bazaar.php*
// @match        https://www.torn.com/item.php*
// @match        https://www.torn.com/page.php?sid=travel*
// @grant        none
// @run-at       document-idle
// @downloadURL https://update.greasyfork.org/scripts/579215/Torn%20Confirm%20Helper.user.js
// @updateURL https://update.greasyfork.org/scripts/579215/Torn%20Confirm%20Helper.meta.js
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

		// Travel page: React confirmPanel with CSS-module hashed classnames
		// (e.g. "confirmPanel___rpB5S", "yesNoButton___B09cS yes___rYTiQ").
		// Match on the stable name prefix so a hash change on Torn's end doesn't break this.
		const confirmPanel = document.querySelector('[class*="confirmPanel___"]');
		if (confirmPanel) {
			let yesBtn = null, noBtn = null;
			confirmPanel.querySelectorAll('button[class*="yesNoButton___"]').forEach(btn => {
				const classes = btn.className.split(/\s+/);
				if (classes.some(c => /^yes___/.test(c))) yesBtn = btn;
				if (classes.some(c => /^no___/.test(c))) noBtn = btn;
			});
			if (!yesBtn) {
				// Alternate confirmPanel variant (e.g. "travel to <destination>"):
				// a buttons___ wrap holding a plain "Continue" button and a
				// hashed "Cancel" button instead of yes___/no___ classes.
				const buttonsWrap = confirmPanel.querySelector('[class*="buttons___"]');
				if (buttonsWrap) {
					const btns = buttonsWrap.querySelectorAll('button');
					if (btns.length >= 2) {
						yesBtn = btns[0];
						noBtn = btns[1];
					}
				}
			}
			if (yesBtn) return { dialog: confirmPanel, yesBtn, noBtn };
		}

		// Travel page: "Travel back" confirmCancel dialog. The confirm button has no
		// distinguishing class (just "torn-btn"), so identify it as "whichever button
		// isn't the cancelButton___ one".
		const confirmCancel = document.querySelector('[class*="confirmCancel___"]');
		if (confirmCancel) {
			let yesBtn = null, noBtn = null;
			confirmCancel.querySelectorAll('button').forEach(btn => {
				const classes = btn.className.split(/\s+/);
				if (classes.some(c => /^cancelButton___/.test(c))) noBtn = btn;
				else yesBtn = btn;
			});
			if (yesBtn) return { dialog: confirmCancel, yesBtn, noBtn };
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

		function cancelConfirm() {
			if (dialog) dialog.dataset.tornCancelling = '1';
			if (noBtn) noBtn.click();
			removeOverlay();

			const isReactManaged = dialog && (
				dialog.matches('[data-testid="buy-confirmation"]') ||
				dialog.matches('[class*="confirmPanel___"]') ||
				dialog.matches('[class*="confirmCancel___"]')
			);
			if (dialog && !isReactManaged) {
				// item.php classic dialogs have no built-in cancel path — Torn never
				// hides the dialog on "No". Force-hide it directly after the transition.
				setTimeout(() => {
					dialog.style.display = 'none';
					delete dialog.dataset.tornCancelling;
				}, 350);
			} else {
				setTimeout(() => { if (dialog) delete dialog.dataset.tornCancelling; }, 700);
			}
		}

		overlay.addEventListener('contextmenu', e => {
			e.preventDefault();
			cancelConfirm();
		});

		escHandler = e => {
			if (e.key === 'Escape') cancelConfirm();
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
			// Bazaar / Travel: React injects the dialog as a new node
			if (mutation.type === 'childList') {
				for (const node of mutation.addedNodes) {
					if (node.nodeType !== Node.ELEMENT_NODE) continue;
					if (
						node.matches?.('[data-testid="buy-confirmation"]') ||
						node.querySelector?.('[data-testid="buy-confirmation"]') ||
						node.matches?.('[class*="confirmPanel___"]') ||
						node.querySelector?.('[class*="confirmPanel___"]') ||
						node.matches?.('[class*="confirmCancel___"]') ||
						node.querySelector?.('[class*="confirmCancel___"]')
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
