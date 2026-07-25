// ==UserScript==
// @name         Torn Trade Max-Fill
// @namespace    https://www.torn.com/
// @version      1.1.0
// @description  Adds a checkbox after the item price on the trade add page to fill the quantity input with the max available amount
// @author       Galaaz86 [4178341]
// @license      MIT License
// @match        https://www.torn.com/trade.php*
// @grant        none
// @run-at       document-idle
// @downloadURL https://update.greasyfork.org/scripts/580128/Torn%20Trade%20Max-Fill.user.js
// @updateURL https://update.greasyfork.org/scripts/580128/Torn%20Trade%20Max-Fill.meta.js
// ==/UserScript==

(function () {
	'use strict';

	const nativeValueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;

	function setReactInputValue(input, value) {
		input.focus();
		nativeValueSetter.call(input, value);
		input.dispatchEvent(new Event('input', { bubbles: true }));
		input.dispatchEvent(new Event('change', { bubbles: true }));
		input.blur();
	}

	function addCheckbox(row) {
		if (row.querySelector('.trade-maxfill-wrap')) return;

		const qtyEl = row.querySelector('.item-amount.qty');
		if (!qtyEl) return;
		const qty = parseInt(qtyEl.textContent.trim(), 10);
		if (isNaN(qty) || qty <= 0) return;

		const priceSpan = row.querySelector('.tt-item-price');
		if (!priceSpan) return;

		const amountInput = row.querySelector('input[name="amount"]');
		if (!amountInput) return;

		const cb = document.createElement('input');
		cb.type = 'checkbox';
		cb.className = 'item-toggle';
		cb.title = `Fill max (${qty})`;

		// Prevent the click from bubbling to the <li>, which would expand item details.
		cb.addEventListener('click', e => e.stopPropagation());

		cb.addEventListener('change', () => {
			setReactInputValue(amountInput, cb.checked ? String(qty) : '');
		});

		const wrapper = document.createElement('div');
		wrapper.className = 'checkbox-wrapper trade-maxfill-wrap';
		wrapper.appendChild(cb);

		// Append as last child of .title-wrap to match Torn's native checkbox position,
		// so Torn's dark-mode CSS selectors (e.g. :last-child) apply correctly.
		const titleWrap = row.querySelector('.title-wrap');
		(titleWrap || priceSpan).appendChild(wrapper);
	}

	function processRows() {
		document.querySelectorAll('li[data-group="child"]').forEach(addCheckbox);
	}

	// Base layout styles — always applied regardless of colour scheme.
	const baseStyle = document.createElement('style');
	baseStyle.textContent = `
		.trade-maxfill-wrap {
			display: inline-flex;
			align-items: center;
			vertical-align: middle;
			margin-left: 6px;
		}
	`;
	document.head.appendChild(baseStyle);

	// Appearance styles — only when Torn is in dark mode, detected via body background luminance.
	const bodyBg = getComputedStyle(document.body).backgroundColor;
	const [r, g, b] = (bodyBg.match(/\d+/g) || ['255', '255', '255']).map(Number);
	const isDarkMode = (r * 299 + g * 587 + b * 114) / 1000 < 128;

	if (isDarkMode) {
		const darkStyle = document.createElement('style');
		darkStyle.textContent = `
			.trade-maxfill-wrap input[type="checkbox"] {
				-webkit-appearance: none;
				appearance: none;
				background-color: rgb(47, 50, 55);
				border: 1px solid rgb(78, 83, 90);
				width: 18px;
				height: 18px;
				display: block;
				border-radius: 2px;
				cursor: pointer;
				position: relative;
				flex-shrink: 0;
			}
			.trade-maxfill-wrap input[type="checkbox"]:checked::after {
				content: '';
				position: absolute;
				left: 5px;
				top: 1px;
				width: 5px;
				height: 10px;
				border: 2px solid #fff;
				border-top: none;
				border-left: none;
				transform: rotate(45deg);
			}
		`;
		document.head.appendChild(darkStyle);
	}

	processRows();

	const observer = new MutationObserver(processRows);
	observer.observe(document.body, { childList: true, subtree: true });
})();
