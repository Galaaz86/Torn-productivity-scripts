// ==UserScript==
// @name         Torn Blackjack - Double and Reset
// @namespace    https://www.torn.com/
// @version      1.2.0
// @license      MIT License
// @description  Sets a base, doubles the bet, and resets to the base.
// @match        https://www.torn.com/page.php?sid=blackjack*
// @match        https://torn.com/page.php?sid=blackjack*
// @grant        GM_getValue
// @grant        GM_setValue
// @run-at       document-idle
// @noframes
// @downloadURL https://update.greasyfork.org/scripts/598044/Torn%20Blackjack%20-%20Double%20and%20Reset.user.js
// @updateURL https://update.greasyfork.org/scripts/598044/Torn%20Blackjack%20-%20Double%20and%20Reset.meta.js
// ==/UserScript==

(() => {
	'use strict';

	const host = document.createElement('div');
	host.style.cssText = `
		position: fixed;
		top: 155px;
		right: 8px;
		z-index: 99999;
		display: none;
	`;

	const panel = host.attachShadow({ mode: 'closed' });

	panel.innerHTML = `
		<style>
			* { box-sizing: border-box; }

			.bar {
				display: flex;
				flex-direction: column;
				gap: 6px;
				width: 52px;
				padding: 4px 4px 6px;
				background: #242424;
				border: 1px solid #666;
				border-radius: 10px;
				box-shadow: 0 3px 12px #0008;
				font: 13px Arial, sans-serif;
			}

			.grip {
				height: 16px;
				color: #999;
				text-align: center;
				line-height: 16px;
				letter-spacing: 2px;
				cursor: move;
				user-select: none;
				touch-action: none;
			}

			button {
				height: 38px;
				padding: 0;
				background: #54863b;
				color: white;
				border: none;
				border-radius: 6px;
				cursor: pointer;
				font: bold 13px Arial, sans-serif;
				touch-action: manipulation;
			}

			#set { background: #3b5f86; }
			#set.active { background: #5a8cc4; }
			#reset { background: #555; }
			button:hover { filter: brightness(1.2); }

			.pop {
				position: absolute;
				top: 0;
				right: calc(100% + 6px);
				background: #242424;
				color: white;
				border: 1px solid #666;
				border-radius: 10px;
				box-shadow: 0 3px 12px #0008;
				font: 13px Arial, sans-serif;
			}

			.pop.flip {
				right: auto;
				left: calc(100% + 6px);
			}

			.pop[hidden] { display: none; }

			#flyout {
				width: 190px;
				padding: 10px;
			}

			label {
				display: block;
				margin-bottom: 6px;
			}

			input {
				width: 100%;
				padding: 8px;
				background: #111;
				color: white;
				border: 1px solid #777;
				border-radius: 5px;
				font-size: 16px;
			}

			#status {
				margin: 8px 0 0;
				font-size: 12px;
				line-height: 1.3;
			}

			#toast {
				width: max-content;
				max-width: 180px;
				padding: 6px 8px;
				font-size: 12px;
				line-height: 1.3;
				pointer-events: none;
			}
		</style>

		<div class="bar">
			<div class="grip" title="Drag">⋮⋮</div>
			<button id="set" type="button" title="Set base value">Set</button>
			<button id="double" type="button" title="Double the bet">x2</button>
			<button id="reset" type="button" title="Reset to base">Base</button>
		</div>

		<div id="flyout" class="pop" hidden>
			<label for="base">Base value ($)</label>
			<input id="base" type="text"
				   inputmode="numeric" placeholder="100000">
			<p id="status" role="status" aria-live="polite">
				Set the base and use the buttons.
			</p>
		</div>

		<div id="toast" class="pop" hidden></div>
	`;

	document.body.appendChild(host);

	const flyout = panel.querySelector('#flyout');
	const toast = panel.querySelector('#toast');
	const setButton = panel.querySelector('#set');

	// Opens popups on the right of the bar when it sits near the left edge.
	function placePopups() {
		const flip = host.getBoundingClientRect().left < 200;
		flyout.classList.toggle('flip', flip);
		toast.classList.toggle('flip', flip);
	}

	function clampPosition(left, top) {
		const maxLeft = window.innerWidth - host.offsetWidth;
		const maxTop = window.innerHeight - host.offsetHeight;

		host.style.left = `${Math.min(Math.max(left, 0), Math.max(maxLeft, 0))}px`;
		host.style.top = `${Math.min(Math.max(top, 0), Math.max(maxTop, 0))}px`;
		host.style.right = 'auto';
	}

	const savedPosition = GM_getValue('position', null);

	function restorePosition() {
		if (!savedPosition || !host.offsetWidth) return;
		clampPosition(savedPosition.left, savedPosition.top);
	}

	window.addEventListener('resize', () => {
		if (host.style.right !== 'auto') return;
		const rect = host.getBoundingClientRect();
		clampPosition(rect.left, rect.top);
		placePopups();
	});

	(function enableDrag() {
		const handle = panel.querySelector('.grip');
		let offsetX = 0;
		let offsetY = 0;

		function onPointerMove(event) {
			clampPosition(event.clientX - offsetX, event.clientY - offsetY);
			placePopups();
		}

		function onPointerUp(event) {
			handle.releasePointerCapture(event.pointerId);
			handle.removeEventListener('pointermove', onPointerMove);
			handle.removeEventListener('pointerup', onPointerUp);

			const rect = host.getBoundingClientRect();
			GM_setValue('position', { left: rect.left, top: rect.top });
		}

		handle.addEventListener('pointerdown', event => {
			if (event.button !== 0) return;

			const rect = host.getBoundingClientRect();
			clampPosition(rect.left, rect.top);

			offsetX = event.clientX - rect.left;
			offsetY = event.clientY - rect.top;

			handle.setPointerCapture(event.pointerId);
			handle.addEventListener('pointermove', onPointerMove);
			handle.addEventListener('pointerup', onPointerUp);
		});
	})();

	setButton.addEventListener('click', () => {
		const open = flyout.hidden;
		flyout.hidden = !open;
		setButton.classList.toggle('active', open);
		toast.hidden = true;
		placePopups();
	});

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

	let toastTimer = 0;

	function message(text, error = false) {
		const color = error ? '#ffb3a8' : '#d9e9ce';
		status.textContent = text;
		status.style.color = color;

		// With the Set panel closed, show feedback briefly next to the bar.
		if (!flyout.hidden) return;
		toast.textContent = text;
		toast.style.color = color;
		toast.hidden = false;
		placePopups();
		clearTimeout(toastTimer);
		toastTimer = setTimeout(() => { toast.hidden = true; }, error ? 3000 : 1500);
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

	let positioned = false;

	function refresh() {
		host.style.display = getFields().visible ? 'block' : 'none';

		if (!positioned && host.offsetWidth) {
			positioned = true;
			restorePosition();
		}
	}

	refresh();
	setInterval(refresh, 800);
})();
