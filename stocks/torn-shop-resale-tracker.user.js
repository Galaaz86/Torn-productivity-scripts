// ==UserScript==
// @name         Torn Abroad Shop Resale Tracker for Weaver
// @namespace    https://weav3r.dev/
// @version      1.0.0
// @description  Finds market-to-shop profits and profitable country shop routes
// @match        https://weav3r.dev/travel-stock*
// @grant        none
// @license      MIT
// @run-at       document-idle
// @downloadURL https://update.greasyfork.org/scripts/601493/Torn%20Abroad%20Shop%20Resale%20Tracker%20for%20Weaver.user.js
// @updateURL https://update.greasyfork.org/scripts/601493/Torn%20Abroad%20Shop%20Resale%20Tracker%20for%20Weaver.meta.js
// ==/UserScript==

(function () {
	'use strict';

	const API_URL = '/api/travel-stock';
	const STYLE_ID = 'torn-shop-resale-style';
	const ROOT_ID = 'torn-shop-resale-root';
	const LAUNCHER_ID = 'torn-shop-resale-launcher';
	const currency = new Intl.NumberFormat(undefined, {
		style: 'currency',
		currency: 'USD',
		maximumFractionDigits: 0,
	});

	let marketDeals = [];
	let routeDeals = [];
	let snapshotCountries = [];
	let lastFetchedAt = null;
	let root;

	const styles = `
		#${LAUNCHER_ID} {
			position: fixed; right: 18px; bottom: 18px; z-index: 2147483646;
			border: 1px solid #d6ad48; border-radius: 9px; padding: 11px 16px;
			background: #f3c75f; color: #171716; font: 700 14px/1.2 "Segoe UI", Arial, sans-serif;
			box-shadow: 0 4px 18px #0008; cursor: pointer;
		}
		#${LAUNCHER_ID}:hover { background: #ffda78; }
		#${ROOT_ID}, #${ROOT_ID} * { box-sizing: border-box; }
		#${ROOT_ID} {
			position: fixed; inset: 0; z-index: 2147483647; display: none;
			background: #101419; color: #e7edf3; overflow: auto;
			font: 14px/1.5 "Segoe UI", Arial, sans-serif;
		}
		#${ROOT_ID}.open { display: block; }
		#${ROOT_ID} .tsr-main { width: min(1500px, 100% - 36px); margin: 0 auto; padding: 28px 0 48px; }
		#${ROOT_ID} .tsr-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 18px; margin-bottom: 16px; }
		#${ROOT_ID} h1 { margin: 0; color: #e7edf3; font: 750 clamp(24px, 4vw, 34px)/1.2 "Segoe UI", Arial, sans-serif; }
		#${ROOT_ID} h2 { margin: 0; color: #e7edf3; font: 700 19px/1.3 "Segoe UI", Arial, sans-serif; }
		#${ROOT_ID} p { margin: 7px 0 0; color: #9aa8b7; }
		#${ROOT_ID} button, #${ROOT_ID} input, #${ROOT_ID} select { font: inherit; }
		#${ROOT_ID} button { cursor: pointer; }
		#${ROOT_ID} .tsr-actions { display: flex; gap: 8px; }
		#${ROOT_ID} .tsr-button { border: 1px solid #d6ad48; border-radius: 8px; padding: 9px 14px; background: #f3c75f; color: #171716; font-weight: 700; }
		#${ROOT_ID} .tsr-button:hover { background: #ffda78; }
		#${ROOT_ID} .tsr-button:disabled { cursor: wait; opacity: .65; }
		#${ROOT_ID} .tsr-close { border: 1px solid #46515e; border-radius: 8px; padding: 8px 12px; background: #202833; color: #e7edf3; }
		#${ROOT_ID} .tsr-status { min-height: 24px; margin: 0 0 14px; color: #9aa8b7; }
		#${ROOT_ID} .tsr-status.error { color: #ff8a8a; }
		#${ROOT_ID} .tsr-cards { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; margin-bottom: 16px; }
		#${ROOT_ID} .tsr-card, #${ROOT_ID} .tsr-panel { border: 1px solid #303b48; border-radius: 10px; background: #191f27; }
		#${ROOT_ID} .tsr-card { padding: 13px 16px; }
		#${ROOT_ID} .tsr-card-label { color: #9aa8b7; font-size: 12px; }
		#${ROOT_ID} .tsr-card-value { color: #f3c75f; font-size: 24px; font-weight: 750; }
		#${ROOT_ID} .tsr-toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; margin-bottom: 14px; color: #9aa8b7; }
		#${ROOT_ID} .tsr-toolbar input, #${ROOT_ID} .tsr-toolbar select { min-height: 38px; border: 1px solid #303b48; border-radius: 7px; padding: 7px 9px; background: #191f27; color: #e7edf3; }
		#${ROOT_ID} .tsr-toolbar input { flex: 1 1 220px; }
		#${ROOT_ID} .tsr-toolbar select { min-width: 145px; }
		#${ROOT_ID} .tsr-panel { overflow: hidden; margin: 14px 0; }
		#${ROOT_ID} .tsr-panel-heading { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 14px 16px; }
		#${ROOT_ID} .tsr-panel-heading span { color: #9aa8b7; font-size: 12px; }
		#${ROOT_ID} .tsr-table-wrap { max-height: 42vh; overflow: auto; border-top: 1px solid #303b48; }
		#${ROOT_ID} table { width: 100%; border-collapse: collapse; white-space: nowrap; font-size: 12px; }
		#${ROOT_ID} th, #${ROOT_ID} td { padding: 9px 11px; border-bottom: 1px solid #28313b; text-align: left; }
		#${ROOT_ID} th { position: sticky; top: 0; z-index: 1; background: #202833; color: #9aa8b7; font-weight: 650; }
		#${ROOT_ID} td.numeric, #${ROOT_ID} th.numeric { text-align: right; font-variant-numeric: tabular-nums; }
		#${ROOT_ID} tbody tr:hover { background: #202832; }
		#${ROOT_ID} .tsr-profit { color: #61d39a; font-weight: 700; }
		#${ROOT_ID} .tsr-empty { padding: 22px; color: #9aa8b7; text-align: center; }
		#${ROOT_ID} .tsr-note { margin-top: 14px; padding: 12px 14px; border-left: 3px solid #f3c75f; background: #191f27; color: #9aa8b7; font-size: 12px; }
		@media (max-width: 700px) {
			#${ROOT_ID} .tsr-main { width: calc(100% - 20px); padding-top: 16px; }
			#${ROOT_ID} .tsr-header { flex-direction: column; }
			#${ROOT_ID} .tsr-cards { grid-template-columns: 1fr; gap: 7px; }
			#${ROOT_ID} .tsr-panel-heading { align-items: flex-start; flex-direction: column; }
			#${ROOT_ID} .tsr-table-wrap { max-height: 48vh; }
			#${LAUNCHER_ID} { right: 10px; bottom: 10px; }
		}
	`;

	function escapeHtml(value) {
		return String(value).replace(/[&<>"']/g, character => ({
			'&': '&amp;',
			'<': '&lt;',
			'>': '&gt;',
			'"': '&quot;',
			"'": '&#39;',
		})[character]);
	}

	function money(value) {
		return currency.format(value);
	}

	function sellBack(category, shopPrice) {
		const rate = String(category).trim().toLowerCase() === 'other' ? 1 : 0.75;
		return Math.floor(shopPrice * rate);
	}

	function parseRows(payload) {
		if (!payload || !Array.isArray(payload.countries)) {
			throw new Error('Travel-stock API returned an unexpected response.');
		}
		const rows = [];
		for (const country of payload.countries) {
			if (!country || !Array.isArray(country.rows)) continue;
			for (const item of country.rows) {
				const row = {
					country: String(country.countryName || country.countryCode || ''),
					itemId: Number(item.itemId),
					item: String(item.name || ''),
					category: String(item.type || ''),
					stock: Number(item.quantity) || 0,
					shop: Number(item.cost) || 0,
					market: Number(item.marketPrice) || 0,
				};
				if (row.country && row.item && Number.isFinite(row.itemId)) rows.push(row);
			}
		}
		if (!rows.length) throw new Error('Travel-stock API returned no shop listings.');
		return rows;
	}

	function calculate(rows) {
		const market = rows.map(row => {
			const sellPrice = sellBack(row.category, row.shop);
			return { ...row, sellPrice, profit: sellPrice - row.market };
		}).filter(row => row.market > 0 && row.profit > 0)
			.sort((a, b) => b.profit - a.profit);

		const locations = new Map();
		for (const row of rows) {
			const shops = locations.get(row.itemId) || [];
			shops.push(row);
			locations.set(row.itemId, shops);
		}
		const routes = [];
		for (const [itemId, shops] of locations) {
			for (const buy of shops) {
				if (buy.stock <= 0 || buy.shop <= 0) continue;
				for (const sell of shops) {
					if (buy.country === sell.country || sell.shop <= 0) continue;
					const sellPrice = sellBack(sell.category, sell.shop);
					const profit = sellPrice - buy.shop;
					if (profit > 0) {
						routes.push({
							itemId,
							item: buy.item,
							category: sell.category,
							buyCountry: buy.country,
							sellCountry: sell.country,
							buyPrice: buy.shop,
							buyStock: buy.stock,
							sellPrice,
							profit,
							potential: profit * buy.stock,
						});
					}
				}
			}
		}
		routes.sort((a, b) => b.profit - a.profit);
		return { market, routes };
	}

	function filtered(rows) {
		const query = root.querySelector('.tsr-search').value.trim().toLowerCase();
		const category = root.querySelector('.tsr-category').value;
		const country = root.querySelector('.tsr-country').value;
		return rows.filter(row => {
			const searchable = [
				row.item, row.category, row.country, row.buyCountry, row.sellCountry,
			].filter(Boolean).join(' ').toLowerCase();
			const matchesCountry = !country
				|| row.country === country
				|| row.buyCountry === country
				|| row.sellCountry === country;
			return (!query || searchable.includes(query))
				&& (!category || row.category === category)
				&& matchesCountry;
		});
	}

	function renderMarket() {
		const rows = filtered(marketDeals);
		const body = root.querySelector('.tsr-market-rows');
		if (!rows.length) {
			body.innerHTML = '<tr><td class="tsr-empty" colspan="9">No matching profitable items.</td></tr>';
			return;
		}
		body.innerHTML = rows.map(row => `
			<tr>
				<td>${escapeHtml(row.country)}</td><td>${escapeHtml(row.item)}</td>
				<td>${escapeHtml(row.category)}</td>
				<td class="numeric">${money(row.market)}</td><td class="numeric">${money(row.shop)}</td>
				<td class="numeric">${money(row.sellPrice)}</td>
				<td class="numeric tsr-profit">${money(row.profit)}</td>
				<td class="numeric">${(row.profit / row.market * 100).toFixed(1)}%</td>
				<td class="numeric">${row.stock.toLocaleString()}</td>
			</tr>`).join('');
	}

	function renderRoutes() {
		const rows = filtered(routeDeals);
		const body = root.querySelector('.tsr-route-rows');
		if (!rows.length) {
			body.innerHTML = '<tr><td class="tsr-empty" colspan="9">No matching profitable in-stock routes.</td></tr>';
			return;
		}
		body.innerHTML = rows.map(row => `
			<tr>
				<td>${escapeHtml(row.buyCountry)}</td><td>${escapeHtml(row.sellCountry)}</td>
				<td>${escapeHtml(row.item)}</td><td>${escapeHtml(row.category)}</td>
				<td class="numeric">${money(row.buyPrice)}</td><td class="numeric">${money(row.sellPrice)}</td>
				<td class="numeric tsr-profit">${money(row.profit)}</td>
				<td class="numeric">${row.buyStock.toLocaleString()}</td>
				<td class="numeric">${money(row.potential)}</td>
			</tr>`).join('');
	}

	function render() {
		renderMarket();
		renderRoutes();
	}

	function updateStatus(message, isError = false) {
		const status = root.querySelector('.tsr-status');
		status.textContent = message;
		status.classList.toggle('error', isError);
	}

	async function refresh() {
		const button = root.querySelector('.tsr-refresh');
		button.disabled = true;
		button.textContent = 'Refreshing…';
		updateStatus('Fetching the latest travel-shop snapshot…');
		try {
			const response = await fetch(API_URL, { cache: 'no-store' });
			const payload = await response.json();
			if (!response.ok) {
				throw new Error(payload.error || `Travel-stock request failed (${response.status}).`);
			}
			const rows = parseRows(payload);
			const deals = calculate(rows);
			marketDeals = deals.market;
			routeDeals = deals.routes;
			snapshotCountries = [...new Set(rows.map(row => row.country))].sort();
			lastFetchedAt = new Date();
			populateFilters(rows);
			root.querySelector('.tsr-market-count').textContent = marketDeals.length.toLocaleString();
			root.querySelector('.tsr-route-count').textContent = routeDeals.length.toLocaleString();
			root.querySelector('.tsr-country-count').textContent = snapshotCountries.length.toLocaleString();
			render();
			updateStatus(`Updated ${lastFetchedAt.toLocaleString()} · ${rows.length.toLocaleString()} shop listings across ${snapshotCountries.length} countries.`);
		} catch (error) {
			updateStatus(error instanceof Error ? error.message : 'Could not load current shop data.', true);
		} finally {
			button.disabled = false;
			button.textContent = 'Refresh data';
		}
	}

	function populateFilters(rows) {
		const category = root.querySelector('.tsr-category');
		const country = root.querySelector('.tsr-country');
		const previousCategory = category.value;
		const previousCountry = country.value;
		const categories = [...new Set(rows.map(row => row.category))].sort();
		category.innerHTML = '<option value="">All categories</option>'
			+ categories.map(value => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join('');
		country.innerHTML = '<option value="">All countries</option>'
			+ snapshotCountries.map(value => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join('');
		if (categories.includes(previousCategory)) category.value = previousCategory;
		if (snapshotCountries.includes(previousCountry)) country.value = previousCountry;
	}

	function buildDashboard() {
		const style = document.createElement('style');
		style.id = STYLE_ID;
		style.textContent = styles;
		document.head.appendChild(style);

		const launcher = document.createElement('button');
		launcher.id = LAUNCHER_ID;
		launcher.type = 'button';
		launcher.textContent = 'Shop resale';
		document.body.appendChild(launcher);

		const overlay = document.createElement('div');
		overlay.id = ROOT_ID;
		overlay.setAttribute('role', 'dialog');
		overlay.setAttribute('aria-modal', 'true');
		overlay.setAttribute('aria-label', 'Torn shop resale tracker');
		overlay.innerHTML = `
			<main class="tsr-main">
				<header class="tsr-header">
					<div>
						<h1>Torn Shop Resale Tracker</h1>
						<p>Find market-to-shop flips and profitable shop routes across countries.</p>
					</div>
					<div class="tsr-actions">
						<button class="tsr-button tsr-refresh" type="button">Refresh data</button>
						<button class="tsr-close" type="button" aria-label="Close dashboard">Close</button>
					</div>
				</header>
				<div class="tsr-status" role="status" aria-live="polite">Open the dashboard to load current values.</div>
				<section class="tsr-cards" aria-label="Deal summary">
					<div class="tsr-card"><div class="tsr-card-label">Market → shop deals</div><div class="tsr-card-value tsr-market-count">—</div></div>
					<div class="tsr-card"><div class="tsr-card-label">In-stock shop routes</div><div class="tsr-card-value tsr-route-count">—</div></div>
					<div class="tsr-card"><div class="tsr-card-label">Countries in snapshot</div><div class="tsr-card-value tsr-country-count">—</div></div>
				</section>
				<section class="tsr-toolbar" aria-label="Filters">
					<label>Search <input class="tsr-search" type="search" placeholder="Item or country"></label>
					<label>Category <select class="tsr-category"><option value="">All categories</option></select></label>
					<label>Country <select class="tsr-country"><option value="">All countries</option></select></label>
				</section>
				<section class="tsr-panel">
					<div class="tsr-panel-heading"><h2>Buy at market → sell to shop</h2><span>Estimated gross profit per item</span></div>
					<div class="tsr-table-wrap"><table>
						<thead><tr><th>Shop country</th><th>Item</th><th>Category</th><th class="numeric">Market buy</th><th class="numeric">Shop price</th><th class="numeric">Sell-back</th><th class="numeric">Profit / item</th><th class="numeric">ROI</th><th class="numeric">Shop stock</th></tr></thead>
						<tbody class="tsr-market-rows"><tr><td class="tsr-empty" colspan="9">Load data to see deals.</td></tr></tbody>
					</table></div>
				</section>
				<section class="tsr-panel">
					<div class="tsr-panel-heading"><h2>Buy in one country → sell to another shop</h2><span>Potential gross is capped by available buy-country stock</span></div>
					<div class="tsr-table-wrap"><table>
						<thead><tr><th>Buy country</th><th>Sell country</th><th>Item</th><th>Category</th><th class="numeric">Buy price</th><th class="numeric">Sell-back</th><th class="numeric">Profit / item</th><th class="numeric">Buy stock</th><th class="numeric">Potential gross</th></tr></thead>
						<tbody class="tsr-route-rows"><tr><td class="tsr-empty" colspan="9">Load data to see routes.</td></tr></tbody>
					</table></div>
				</section>
				<p class="tsr-note">Estimated sell-back uses 75% of shop price, except items categorized as Other, which use 100%; proceeds are rounded down to whole dollars. Profit excludes airfare, travel time, market fees, and other costs. Verify live stock and prices in Torn before buying. Data from the public <a href="https://weav3r.dev/travel-stock" target="_blank" rel="noreferrer">TornW3B Travel Stock</a> feed.</p>
			</main>`;
		document.body.appendChild(overlay);

		overlay.querySelector('.tsr-refresh').addEventListener('click', refresh);
		overlay.querySelector('.tsr-close').addEventListener('click', () => overlay.classList.remove('open'));
		overlay.addEventListener('click', event => {
			if (event.target === overlay) overlay.classList.remove('open');
		});
		overlay.querySelector('.tsr-search').addEventListener('input', render);
		overlay.querySelector('.tsr-category').addEventListener('change', render);
		overlay.querySelector('.tsr-country').addEventListener('change', render);
		launcher.addEventListener('click', () => {
			overlay.classList.add('open');
			if (!lastFetchedAt) refresh();
		});
		document.addEventListener('keydown', event => {
			if (event.key === 'Escape') overlay.classList.remove('open');
		});
	}

	if (!document.getElementById(ROOT_ID)) {
		root = {
			querySelector(selector) {
				return document.getElementById(ROOT_ID)?.querySelector(selector);
			},
		};
		buildDashboard();
	}
})();
