// ==UserScript==
// @name         Torn Item Market Base Price Compare
// @namespace    https://www.torn.com/
// @version      1.0.0
// @description  Set your own base prices for plushies and exotic flowers, then see how far each Item Market listing is above (red) or below (green) that price
// @author       Galaaz86 [4178341]
// @license      MIT License
// @match        https://www.torn.com/page.php?sid=ItemMarket*
// @grant        none
// @run-at       document-idle
// @downloadURL https://update.greasyfork.org/scripts/597922/Torn%20Item%20Market%20Base%20Price%20Compare.user.js
// @updateURL https://update.greasyfork.org/scripts/597922/Torn%20Item%20Market%20Base%20Price%20Compare.meta.js
// ==/UserScript==

(function () {
	'use strict';

	if (window.__TORN_BASEPRICE_RUNNING__) return;
	window.__TORN_BASEPRICE_RUNNING__ = true;

	const STORAGE_KEY = 'TORN_BASEPRICE_VALUES';
	const UI_KEY = 'TORN_BASEPRICE_UI';

	// Museum sets: [name, itemID]
	const TABS = {
		plushies: {
			label: 'Plushies',
			items: [
				['Sheep Plushie', 186],
				['Teddy Bear Plushie', 187],
				['Kitten Plushie', 215],
				['Jaguar Plushie', 258],
				['Wolverine Plushie', 261],
				['Nessie Plushie', 266],
				['Red Fox Plushie', 268],
				['Monkey Plushie', 269],
				['Chamois Plushie', 273],
				['Panda Plushie', 274],
				['Lion Plushie', 281],
				['Camel Plushie', 384],
				['Stingray Plushie', 618],
			],
		},
		flowers: {
			label: 'Flowers',
			items: [
				['Dahlia', 260],
				['Orchid', 264],
				['African Violet', 282],
				['Cherry Blossom', 277],
				['Peony', 276],
				['Ceibo Flower', 271],
				['Edelweiss', 272],
				['Crocus', 263],
				['Heather', 267],
				['Tribulus Omanense', 385],
				['Banana Orchid', 617],
			],
		},
	};

	/** ==================== STORAGE ==================== **/
	function load(key, fallback) {
		try {
			const raw = localStorage.getItem(key);
			return raw ? JSON.parse(raw) : fallback;
		} catch (e) {
			return fallback;
		}
	}

	function save(key, value) {
		try {
			localStorage.setItem(key, JSON.stringify(value));
		} catch (e) { /* storage unavailable */ }
	}

	let basePrices = load(STORAGE_KEY, {});
	const ui = Object.assign({ collapsed: false, tab: 'plushies' }, load(UI_KEY, {}));

	/** ==================== HELPERS ==================== **/
	// Accepts "50000", "50,000", "$50,000", "50k", "1.5m"
	function parseAmount(text) {
		if (!text) return null;
		const m = String(text).toLowerCase().replace(/[$,\s]/g, '').match(/^(\d+(?:\.\d+)?)([kmb]?)$/);
		if (!m) return null;
		const mult = { '': 1, k: 1e3, m: 1e6, b: 1e9 }[m[2]];
		return Math.round(parseFloat(m[1]) * mult);
	}

	function formatMoney(n) {
		return n.toLocaleString('en-US');
	}

	// Reads the price text of an element while ignoring our own injected badge
	function readPrice(el) {
		let text = '';
		el.childNodes.forEach(node => {
			if (node.nodeType === Node.ELEMENT_NODE && node.classList.contains('tbp-badge')) return;
			text += node.textContent;
		});
		const m = text.match(/\$?\s*([\d,]+)/);
		return m ? parseInt(m[1].replace(/,/g, ''), 10) : null;
	}

	/** ==================== STYLES ==================== **/
	const style = document.createElement('style');
	style.textContent = `
		#tbp-panel {
			margin: 0 0 10px 0;
			border-radius: 5px;
			overflow: hidden;
			font-family: Arial, sans-serif;
			font-size: 12px;
			color: var(--default-color, #ddd);
			background: var(--default-bg-panel-color, #333);
			box-shadow: 0 1px 3px rgba(0,0,0,.4);
		}
		#tbp-panel .tbp-title {
			display: flex;
			align-items: center;
			justify-content: space-between;
			padding: 6px 10px;
			cursor: pointer;
			user-select: none;
			font-weight: bold;
			color: #fff;
			background: linear-gradient(180deg, #555 0%, #333 100%);
		}
		#tbp-panel .tbp-title svg { transition: transform .2s; }
		#tbp-panel.tbp-collapsed .tbp-title svg { transform: rotate(-90deg); }
		#tbp-panel.tbp-collapsed main { display: none; }
		#tbp-panel .tbp-tabs { display: flex; border-bottom: 1px solid rgba(128,128,128,.3); }
		#tbp-panel .tbp-tab {
			flex: 1;
			padding: 6px;
			border: none;
			background: transparent;
			color: inherit;
			cursor: pointer;
			font-weight: bold;
			font-size: 12px;
		}
		#tbp-panel .tbp-tab.tbp-active {
			background: rgba(128,128,128,.2);
			box-shadow: inset 0 -2px 0 #82ad28;
		}
		#tbp-panel .tbp-list {
			display: grid;
			grid-template-columns: repeat(auto-fill, minmax(230px, 1fr));
			gap: 4px 12px;
			padding: 8px 10px;
		}
		#tbp-panel .tbp-row { display: flex; align-items: center; gap: 6px; }
		#tbp-panel .tbp-row img { width: 38px; height: 19px; object-fit: contain; flex-shrink: 0; }
		#tbp-panel .tbp-row span { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
		#tbp-panel .tbp-row input {
			width: 90px;
			padding: 3px 5px;
			border-radius: 3px;
			border: 1px solid rgba(128,128,128,.5);
			background: rgba(0,0,0,.15);
			color: inherit;
			text-align: right;
			font-size: 12px;
		}
		#tbp-panel .tbp-row input.tbp-invalid { border-color: #d9534f; }
		#tbp-panel .tbp-hint { padding: 0 10px 8px; opacity: .7; font-size: 11px; }
		.tbp-badge {
			display: inline-block;
			margin-right: 5px;
			font-weight: bold;
			font-size: 11px;
		}
		.tbp-badge.tbp-below { color: #5cb85c; }
		.tbp-badge.tbp-above { color: #e0463f; }
		.tbp-badge.tbp-equal { color: #999; }
	`;
	document.head.appendChild(style);

	/** ==================== PANEL ==================== **/
	const CHEVRON = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" fill="currentColor" width="1em" height="1em"><path d="M213.66,101.66l-80,80a8,8,0,0,1-11.32,0l-80-80A8,8,0,0,1,48,88H208a8,8,0,0,1,5.66,13.66Z"></path></svg>';

	function buildPanel() {
		const panel = document.createElement('div');
		panel.id = 'tbp-panel';
		if (ui.collapsed) panel.classList.add('tbp-collapsed');

		const title = document.createElement('div');
		title.className = 'tbp-title';
		title.innerHTML = `<span>Base Prices</span>${CHEVRON}`;
		title.addEventListener('click', () => {
			ui.collapsed = !ui.collapsed;
			panel.classList.toggle('tbp-collapsed', ui.collapsed);
			save(UI_KEY, ui);
		});

		const main = document.createElement('main');
		const tabs = document.createElement('div');
		tabs.className = 'tbp-tabs';
		const list = document.createElement('div');
		list.className = 'tbp-list';

		Object.entries(TABS).forEach(([key, tab]) => {
			const btn = document.createElement('button');
			btn.type = 'button';
			btn.className = 'tbp-tab';
			btn.dataset.tab = key;
			btn.textContent = tab.label;
			btn.addEventListener('click', () => {
				ui.tab = key;
				save(UI_KEY, ui);
				renderList(tabs, list);
			});
			tabs.appendChild(btn);
		});

		const hint = document.createElement('div');
		hint.className = 'tbp-hint';
		hint.textContent = 'Shorthand like 50k or 1.5m works. Listings show green when below your base price and red when above.';

		main.append(tabs, list, hint);
		panel.append(title, main);
		renderList(tabs, list);
		return panel;
	}

	function renderList(tabs, list) {
		if (!TABS[ui.tab]) ui.tab = 'plushies';
		tabs.querySelectorAll('.tbp-tab').forEach(b => b.classList.toggle('tbp-active', b.dataset.tab === ui.tab));
		list.innerHTML = '';

		TABS[ui.tab].items.forEach(([name, id]) => {
			const row = document.createElement('label');
			row.className = 'tbp-row';

			const img = document.createElement('img');
			img.src = `/images/items/${id}/small.png`;
			img.alt = '';

			const label = document.createElement('span');
			label.textContent = name;
			label.title = name;

			const input = document.createElement('input');
			input.type = 'text';
			input.inputMode = 'numeric';
			input.placeholder = 'base price';
			if (basePrices[name]) input.value = formatMoney(basePrices[name]);

			input.addEventListener('input', () => {
				const raw = input.value.trim();
				const value = parseAmount(raw);
				input.classList.toggle('tbp-invalid', raw !== '' && !value);
				if (raw === '') delete basePrices[name];
				else if (value) basePrices[name] = value;
				else return;
				save(STORAGE_KEY, basePrices);
				scheduleScan();
			});
			input.addEventListener('blur', () => {
				if (basePrices[name] && !input.classList.contains('tbp-invalid')) input.value = formatMoney(basePrices[name]);
			});

			row.append(img, label, input);
			list.appendChild(row);
		});
	}

	function ensurePanel() {
		if (document.getElementById('tbp-panel')) return;
		const root = document.getElementById('item-market-root');
		if (!root || !root.parentNode) return;
		// Sibling of the React root so React re-renders never remove it
		root.parentNode.insertBefore(buildPanel(), root);
	}

	/** ==================== BADGES ==================== **/
	function applyBadge(priceEl, name, beforeEl) {
		const base = name && basePrices[name.trim()];
		const container = beforeEl ? beforeEl.parentNode : priceEl;
		let badge = beforeEl
			? (beforeEl.previousElementSibling?.classList.contains('tbp-badge') ? beforeEl.previousElementSibling : null)
			: priceEl.querySelector(':scope > .tbp-badge');

		const price = readPrice(priceEl);
		if (!base || !price) {
			if (badge) badge.remove();
			return;
		}

		const pct = (price - base) / base * 100;
		const rounded = Math.round(pct * 10) / 10;
		const text = `(${rounded > 0 ? '+' : ''}${rounded}%)`;
		const cls = rounded < 0 ? 'tbp-below' : rounded > 0 ? 'tbp-above' : 'tbp-equal';

		if (!badge) {
			badge = document.createElement('span');
			if (beforeEl) container.insertBefore(badge, beforeEl);
			else container.insertBefore(badge, container.firstChild);
		}
		const className = `tbp-badge ${cls}`;
		if (badge.className !== className) badge.className = className;
		if (badge.textContent !== text) badge.textContent = text;
		const title = `Base price: $${formatMoney(base)}`;
		if (badge.title !== title) badge.title = title;
	}

	function scan() {
		ensurePanel();

		// Individual seller rows in an expanded item
		document.querySelectorAll('[class*="sellerRow___"]').forEach(row => {
			const priceEl = row.querySelector('[class*="price___"]');
			const name = row.querySelector('[class*="thumbnail___"] img')?.alt;
			if (priceEl) applyBadge(priceEl, name);
		});

		// Item tiles in the category grid
		document.querySelectorAll('[class*="itemTile___"]').forEach(tile => {
			const name = tile.querySelector('[class*="name___"]')?.textContent;
			const priceSpan = tile.querySelector('[class*="priceAndTotal___"] > span:not(.tbp-badge):not([class*="titleTotal___"])');
			if (priceSpan) applyBadge(priceSpan, name, priceSpan);
		});

		// TornTools "Bazaar Market" listings, if present
		document.querySelectorAll('[class*="_bazaar-market_"]').forEach(box => {
			const name = box.querySelector('[class*="_title_"]')?.textContent;
			box.querySelectorAll('[class*="_listing_"] [class*="_price_"]').forEach(priceEl => applyBadge(priceEl, name));
		});
	}

	let scanQueued = false;
	function scheduleScan() {
		if (scanQueued) return;
		scanQueued = true;
		requestAnimationFrame(() => {
			scanQueued = false;
			scan();
		});
	}

	// Ignore mutations caused purely by our own badges/panel to avoid feedback loops
	function isOwnNode(node) {
		return node.nodeType === Node.ELEMENT_NODE && (node.classList.contains('tbp-badge') || node.id === 'tbp-panel' || node.closest?.('#tbp-panel'));
	}

	new MutationObserver(mutations => {
		for (const m of mutations) {
			if (isOwnNode(m.target) || m.target.parentNode && isOwnNode(m.target.parentNode)) continue;
			const nodes = [...m.addedNodes, ...m.removedNodes];
			if (m.type === 'childList' && nodes.length && nodes.every(isOwnNode)) continue;
			scheduleScan();
			return;
		}
	}).observe(document.body, { childList: true, subtree: true, characterData: true });

	window.addEventListener('storage', e => {
		if (e.key !== STORAGE_KEY) return;
		basePrices = load(STORAGE_KEY, {});
		scheduleScan();
	});

	scan();
})();
