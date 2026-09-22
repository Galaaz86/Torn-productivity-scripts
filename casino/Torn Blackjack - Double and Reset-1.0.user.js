// ==UserScript==
// @name         Torn Blackjack - Double and Reset
// @namespace    https://www.torn.com/
// @version      1.1.0
// @description  Sets a base, doubles the bet, and resets to the base.
// @match        https://www.torn.com/page.php?sid=blackjack*
// @match        https://torn.com/page.php?sid=blackjack*
// @grant        GM_getValue
// @grant        GM_setValue
// @run-at       document-idle
// @noframes
// ==/UserScript==

(() => {
	'use strict';

	const host = document.createElement('div');
	host.style.cssText = `
		position: fixed;
		top: 155px;
		right: 24px;
		width: 240px;
		max-width: calc(100vw - 32px);
		z-index: 99999;
		display: none;
	`;

	const panel = host.attachShadow({ mode: 'closed' });

	panel.innerHTML = `
		<style>
			* { box-sizing: border-box; }

			section {
				background: #242424;
				color: white;
				border: 1px solid #666;
				border-radius: 10px;
				padding: 16px;
				font: 14px Arial, sans-serif;
				box-shadow: 0 5px 20px #0008;
			}

			h3 {
				margin: 0 0 14px;
				cursor: move;
				user-select: none;
				touch-action: none;
			}

			label {
				display: block;
				margin-bottom: 7px;
			}

			input {
				width: 100%;
				padding: 10px;
				background: #111;
				color: white;
				border: 1px solid #777;
				border-radius: 5px;
				font-size: 16px;
			}

			.buttons {
				display: flex;
				gap: 8px;
				margin-top: 12px;
			}

			button {
				flex: 1;
				padding: 11px 5px;
				background: #54863b;
				color: white;
				border: none;
				border-radius: 5px;
				cursor: pointer;
				font-weight: bold;
			}

			#reset { background: #555; }
			button:hover { filter: brightness(1.2); }

			p {
				margin: 12px 0 0;
				font-size: 12px;
				line-height: 1.4;
			}
		</style>

		<section>
			<h3>Blackjack · Bet</h3>

			<label for="base">Base value ($)</label>
			<input id="base" type="text"
				   inputmode="numeric" placeholder="500000">

			<div class="buttons">
				<button id="double" type="button">Double</button>
				<button id="reset" type="button">Reset to base</button>
			</div>

			<p id="status" role="status" aria-live="polite">
				Set the base and use the buttons.
			</p>
		</section>
	`;

	document.body.appendChild(host);

	(function enableDrag() {
		const handle = panel.querySelector('h3');
		let offsetX = 0;
		let offsetY = 0;

		function onPointerMove(event) {
			const maxLeft = window.innerWidth - host.offsetWidth;
			const maxTop = window.innerHeight - host.offsetHeight;

			host.style.left = `${Math.min(Math.max(event.clientX - offsetX, 0), maxLeft)}px`;
			host.style.top = `${Math.min(Math.max(event.clientY - offsetY, 0), maxTop)}px`;
		}

		function onPointerUp(event) {
			handle.releasePointerCapture(event.pointerId);
			handle.removeEventListener('pointermove', onPointerMove);
			handle.removeEventListener('pointerup', onPointerUp);
		}

		handle.addEventListener('pointerdown', event => {
			if (event.button !== 0) return;

			const rect = host.getBoundingClientRect();
			host.style.left = `${rect.left}px`;
			host.style.top = `${rect.top}px`;
			host.style.right = 'auto';

			offsetX = event.clientX - rect.left;
			offsetY = event.clientY - rect.top;

			handle.setPointerCapture(event.pointerId);
			handle.addEventListener('pointermove', onPointerMove);
			handle.addEventListener('pointerup', onPointerUp);
		});
	})();

	const base = panel.querySelector('#base');
	const status = panel.querySelector('#status');

	base.value = GM_getValue('base', '500000');

	function parseMoney(value) {
		const text = String(value).trim().replace(/^\$\s*/, '');

		// Accepts 500000, 500.000, 500,000, and thousands with spaces.
		const valid =
			/^(?:\d+|\d{1,3}(?:,\d{3})+|\d{1,3}(?:\.\d{3})+|\d{1,3}(?:[ \u00a0\u202f]\d{3})+)$/;

		if (!valid.test(text)) return NaN;

		const number = Number(text.replace(/[.,\s]/g, ''));

		return Number.isSafeInteger(number) && number >= 0
			? number
			: NaN;
	}

	function getFields() {
		const visible = [
			...document.querySelectorAll(
				'input.bet.input-money:not([type="hidden"])'
			)
		].find(input => input.getClientRects().length > 0);

		const group =
			visible?.closest('.input-money-group') ||
			visible?.parentElement;

		const hidden = group?.querySelector(
			'input.bet.input-money[type="hidden"][name="bet"]'
		);

		return { visible, hidden };
	}

	function message(text, error = false) {
		status.textContent = text;
		status.style.color = error ? '#ffb3a8' : '#d9e9ce';
	}

	base.addEventListener('input', () => {
		const value = parseMoney(base.value);

		if (!Number.isSafeInteger(value) || value <= 0) {
			message('Enter a positive integer value.', true);
			return;
		}

		GM_setValue('base', String(value));
		message(`Base saved: $${value.toLocaleString('en-US')}.`);
	});

	const nativeSetter = Object.getOwnPropertyDescriptor(
		HTMLInputElement.prototype,
		'value'
	).set;

	function updateField(input, value) {
		nativeSetter.call(input, String(value));
		input.dispatchEvent(new Event('input', { bubbles: true }));
		input.dispatchEvent(new Event('change', { bubbles: true }));
	}

	function apply(action) {
		const { visible, hidden } = getFields();

		if (!visible) {
			message('Bet field not found.', true);
			return;
		}

		if (
			visible.readOnly ||
			visible.disabled ||
			visible.matches(':disabled')
		) {
			message(
				'The game locked the bet. Wait until the field is available.',
				true
			);
			return;
		}

		const value = action === 'double'
			? parseMoney(visible.value) * 2
			: parseMoney(base.value);

		if (!Number.isSafeInteger(value) || value <= 0) {
			message('The value must be a valid positive integer.', true);
			return;
		}

		const min = visible.getAttribute('min');
		const max = visible.getAttribute('max');

		if (
			(min && value < Number(min)) ||
			(max && value > Number(max))
		) {
			message('The value exceeds the field limits.', true);
			return;
		}

		updateField(visible, value);

		if (parseMoney(visible.value) !== value) {
			message('The game adjusted or rejected the value.', true);
			return;
		}

		if (hidden && parseMoney(hidden.value) !== value) {
			updateField(hidden, value);
		}

		visible.dispatchEvent(
			new FocusEvent('blur', { bubbles: true })
		);

		setTimeout(() => {
			const latest = getFields();

			const accepted =
				latest.visible &&
				parseMoney(latest.visible.value) === value &&
				(
					!latest.hidden ||
					parseMoney(latest.hidden.value) === value
				);

			message(
				accepted
					? `Value in field: $${value.toLocaleString('en-US')}.`
					: 'The game adjusted or rejected the value. Check the screen.',
				!accepted
			);
		}, 150);
	}

	panel.querySelector('#double').addEventListener(
		'click', () => apply('double')
	);

	panel.querySelector('#reset').addEventListener(
		'click', () => apply('reset')
	);

	function refresh() {
		host.style.display = getFields().visible ? 'block' : 'none';
	}

	refresh();
	setInterval(refresh, 800);
})();
