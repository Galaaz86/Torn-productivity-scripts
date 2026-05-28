// ==UserScript==
// @name         Torn Trade Max-Fill
// @namespace    https://www.torn.com/
// @version      1.0.0
// @description  Adds a checkbox after the item price on the trade add page to fill the quantity input with the max available amount
// @author       Galaaz86 [4178341]
// @license      MIT License
// @match        https://www.torn.com/trade.php*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    const nativeValueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;

    function setReactInputValue(input, value) {
        input.focus();
        nativeValueSetter.call(input, value);
        input.dispatchEvent(new Event('input',  { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
        input.blur();
    }

    function addCheckbox(row) {
        if (row.querySelector('.trade-maxfill-cb')) return;

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
        cb.className = 'trade-maxfill-cb';
        cb.title = `Fill max (${qty})`;
        cb.style.cssText = 'margin-left: 6px; vertical-align: middle; cursor: pointer;';

        // Prevent the click from bubbling to the <li>, which would expand item details.
        cb.addEventListener('click', e => e.stopPropagation());

        cb.addEventListener('change', () => {
            setReactInputValue(amountInput, cb.checked ? String(qty) : '');
        });

        priceSpan.insertAdjacentElement('afterend', cb);
    }

    function processRows() {
        document.querySelectorAll('li[data-group="child"]').forEach(addCheckbox);
    }

    processRows();

    const observer = new MutationObserver(processRows);
    observer.observe(document.body, { childList: true, subtree: true });
})();
