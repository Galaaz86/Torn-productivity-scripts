// ==UserScript==
// @name         Torn Bazaar Fill Max Auto-Buy
// @namespace    https://www.torn.com/
// @version      1.1.0
// @description  Automatically clicks the Buy button after "fill max" is clicked in the bazaar
// @author       Galaaz86 [4178341]
// @license      MIT License
// @match        https://www.torn.com/bazaar.php*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
	'use strict';

	// Event delegation — works after React re-renders
	document.addEventListener('click', function (e) {
		const fillMax = e.target.closest('[class*="_tt-max-buy"]');
		if (!fillMax) return;

		// Walk up the DOM to find the first ancestor that contains the Buy button
		let container = fillMax.parentElement;
		while (container && container !== document.body) {
			if (container.querySelector('[data-testid="buy-button"]')) break;
			container = container.parentElement;
		}
		const buyBtn = container?.querySelector('[data-testid="buy-button"]');
		if (!buyBtn) return;

		// Small delay to let React update the quantity input after fill max
		setTimeout(() => buyBtn.click(), 150);
	}, true);
})();
