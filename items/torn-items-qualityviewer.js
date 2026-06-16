// ==UserScript==
// @name         Torn item Quality Viewer
// @namespace    http://tampermonkey.net/
// @version      1.3.0
// @description  This script gives players a quick visual guide to how good a weapon or armor roll is by color-coding the quality directly onto the item image with a heat map based font coloring.
// @author       Galaaz86 [4178341]
// @license      MIT License
// @match        https://www.torn.com/page.php?sid=ItemMarket*
// @match        https://www.torn.com/bazaar.php*
// @match        https://www.torn.com/bigalgunshop.php*
// @match        https://www.torn.com/item.php*
// @match        https://www.torn.com/dump.php*
// @match        https://www.torn.com/factions.php*
// @match        https://www.torn.com/amarket.php*
// @run-at       document-idle
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        none
// @downloadURL https://update.greasyfork.org/scripts/579809/Torn%20item%20Quality%20Viewer.user.js
// @updateURL https://update.greasyfork.org/scripts/579809/Torn%20item%20Quality%20Viewer.meta.js
// ==/UserScript==

(function () {
	"use strict";

	if (window.__TORN_HEAT_RUNNING__) return;
	window.__TORN_HEAT_RUNNING__ = true;

	/** ==================== MARKET PRICE CACHE ==================== **/
	const PRICE_CACHE_KEY = 'TORN_ITEM_PRICES';
	const PRICE_CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours
	let pricesCache = {};

	async function fetchItemPrices() {
		try {
			const cached = GM_getValue(PRICE_CACHE_KEY);
			if (cached && Date.now() - cached.timestamp < PRICE_CACHE_DURATION) {
				pricesCache = cached.data;
				return pricesCache;
			}
			let prices = await fetchFromItemMarket();
			if (Object.keys(prices).length === 0) {
				prices = await fetchFromBazaar();
			}
			if (Object.keys(prices).length > 0) {
				GM_setValue(PRICE_CACHE_KEY, { data: prices, timestamp: Date.now() });
				pricesCache = prices;
			}
			return prices;
		} catch (e) {
			console.error('[Torn Heat] Error fetching prices:', e);
			return {};
		}
	}

	function fetchFromItemMarket() {
		return new Promise((resolve) => {
			GM_xmlhttpRequest({
				method: 'GET',
				url: 'https://www.torn.com/page.php?sid=ItemMarket',
				timeout: 5000,
				onload: function(response) {
					resolve(extractPrices(response.responseText));
				},
				onerror: () => resolve({}),
				ontimeout: () => resolve({})
			});
		});
	}

	function fetchFromBazaar() {
		return new Promise((resolve) => {
			GM_xmlhttpRequest({
				method: 'GET',
				url: 'https://www.torn.com/bazaar.php',
				timeout: 5000,
				onload: function(response) {
					resolve(extractPrices(response.responseText));
				},
				onerror: () => resolve({}),
				ontimeout: () => resolve({})
			});
		});
	}

	function extractPrices(html) {
		const prices = {};
		const parser = new DOMParser();
		const doc = parser.parseFromString(html, 'text/html');
		const priceElements = doc.querySelectorAll('[data-item]');
		priceElements.forEach(el => {
			const itemId = el.getAttribute('data-item');
			let priceEl = el.querySelector('.tt-item-price');
			if (!priceEl) priceEl = el.querySelector('[class*="price"]');
			if (itemId && priceEl) {
				const priceText = priceEl.textContent.trim();
				const price = priceText.replace(/[$,\s]/g, '');
				if (!isNaN(price)) prices[itemId] = price;
			}
		});
		const listItems = doc.querySelectorAll('li[data-item], li[data-rowkey]');
		listItems.forEach(li => {
			let itemId = li.getAttribute('data-item');
			if (!itemId) {
				const dataRowkey = li.getAttribute('data-rowkey');
				if (dataRowkey) itemId = dataRowkey.match(/f?(\d+)/)?.[1];
			}
			const priceEl = li.querySelector('.tt-item-price, [class*="price"]');
			if (itemId && priceEl) {
				const priceText = priceEl.textContent.trim();
				const price = priceText.replace(/[$,\s]/g, '');
				if (!isNaN(price) && price) prices[itemId] = price;
			}
		});
		return prices;
	}

	function formatPrice(price) {
		return '$' + Number(price).toLocaleString();
	}

	function addPriceToElement(element, itemId) {
		if (!element || !pricesCache[itemId]) return;
		if (element.querySelector('.torn-dump-price')) return;
		const price = formatPrice(pricesCache[itemId]);
		const priceEl = document.createElement('span');
		priceEl.className = 'torn-dump-price';
		priceEl.style.cssText = 'color: #2e7d32; font-weight: bold; margin-left: 6px;';
		priceEl.textContent = price;
		element.appendChild(priceEl);
	}

	/** ==================== BASE STAT DATA (by item ID) ==================== **/
	// Source: OpenMarket script by https://www.torn.com/forums.php#p=threads&f=67&t=16469095
	// Formula: quality% = ((damage - baseDamage) + (accuracy - baseAccuracy)) * 10
	//          armor quality% = (armour - baseArmour) * 20

	const BASE_DAMAGE_VALUES = {
	1: 17, 2: 16, 3: 20, 4: 11, 5: 21, 6: 25, 7: 28, 8: 34, 9: 40, 10: 61,
	11: 58, 12: 28, 13: 29, 14: 32, 15: 36, 16: 44, 17: 48, 18: 52, 19: 55, 20: 59,
	21: 64, 22: 41, 23: 39, 24: 45, 25: 48, 26: 56, 27: 55, 28: 59, 29: 61, 30: 64,
	31: 67, 63: 72, 76: 52, 98: 59, 99: 33, 100: 64, 108: 65, 109: 77, 110: 27, 111: 39,
	146: 65, 147: 22, 170: 60, 173: 24, 174: 50, 175: 1, 177: 61, 189: 42, 217: 57, 218: 35,
	219: 63, 223: 69, 224: 23, 225: 56, 227: 38, 228: 50, 230: 18, 231: 60, 232: 62, 233: 61,
	234: 31, 235: 22, 236: 35, 237: 62, 238: 29, 240: 78, 241: 50, 243: 30, 244: 15, 245: 13,
	247: 52, 248: 62, 249: 46, 250: 50, 251: 53, 252: 49, 253: 27, 254: 47, 255: 67, 289: 70,
	290: 70, 291: 70, 292: 70, 346: 40, 359: 16, 360: 53, 382: 75, 387: 67, 388: 74, 391: 57,
	393: 14, 395: 61, 397: 71, 398: 69, 399: 68, 400: 63, 401: 26, 402: 51, 438: 18, 439: 19,
	440: 1, 483: 42, 484: 46, 485: 40, 486: 38, 487: 39, 488: 37, 489: 35, 490: 46, 539: 36,
	545: 79, 546: 76, 547: 78, 548: 77, 549: 80, 599: 60, 600: 61, 604: 43, 605: 45, 612: 65,
	613: 47, 614: 60, 615: 64, 632: 48, 790: 5, 792: 17, 805: 18, 830: 95, 831: 54, 832: 21,
	837: 66, 838: 63, 839: 60, 844: 15, 845: 58, 846: 56, 850: 58, 871: 5, 874: 68, 1053: 41,
	1055: 35, 1056: 40, 1152: 76, 1153: 74, 1154: 73, 1155: 70, 1156: 68, 1157: 69, 1158: 62,
	1159: 51, 1173: 37, 1231: 29, 1255: 54, 1257: 1, 1296: 27
	};

	const BASE_ACCURACY_VALUES = {
	1: 55, 2: 57, 3: 52, 4: 62, 5: 45, 6: 55, 7: 60, 8: 52, 9: 58, 10: 23,
	11: 52, 12: 53, 13: 52, 14: 56, 15: 54, 16: 58, 17: 51, 18: 49, 19: 38, 20: 36,
	21: 30, 22: 63, 23: 65, 24: 51, 25: 51, 26: 52, 27: 47, 28: 55, 29: 47, 30: 45,
	31: 41, 63: 28, 76: 24, 98: 24, 99: 57, 100: 24, 108: 43, 109: 39, 110: 52, 111: 51,
	146: 49, 147: 15, 170: 24, 173: 55, 174: 56, 175: 54, 177: 53, 189: 54, 217: 49, 218: 63,
	219: 55, 223: 52, 224: 52, 225: 62, 227: 48, 228: 48, 230: 22, 231: 46, 232: 50, 233: 55,
	234: 52, 235: 59, 236: 55, 237: 56, 238: 52, 240: 25, 241: 57, 243: 57, 244: 39, 245: 55,
	247: 55, 248: 53, 249: 47, 250: 53, 251: 51, 252: 62, 253: 41, 254: 52, 255: 39, 289: 54,
	290: 54, 291: 54, 292: 54, 346: 63, 359: 50, 360: 57, 382: 62, 387: 63, 388: 45, 391: 65,
	393: 54, 395: 60, 397: 28, 398: 50, 399: 57, 400: 35, 401: 33, 402: 60, 438: 42, 439: 43,
	440: 63, 483: 52, 484: 41, 485: 54, 486: 45, 487: 43, 488: 41, 489: 48, 490: 24, 539: 55,
	545: 38, 546: 47, 547: 46, 548: 45, 549: 36, 599: 48, 600: 41, 604: 45, 605: 48, 612: 52,
	613: 63, 614: 62, 615: 52, 632: 48, 790: 29, 792: 57, 805: 55, 830: 45, 831: 53, 832: 54,
	837: 36, 838: 60, 839: 45, 844: 45, 845: 53, 846: 52, 850: 50, 871: 59, 874: 57, 1053: 65,
	1055: 49, 1056: 47, 1152: 42, 1153: 44, 1154: 40, 1155: 45, 1156: 36, 1157: 49, 1158: 39,
	1159: 56, 1173: 67, 1231: 59, 1255: 52, 1257: 59, 1296: 58
	};

	const BASE_ARMOUR_VALUES = {
	32: 20, 33: 32, 34: 34, 49: 31, 50: 36, 176: 23, 178: 30, 332: 38, 333: 40, 334: 42,
	348: 10, 538: 25, 640: 32, 641: 34, 642: 30, 643: 30, 644: 34, 645: 30, 646: 24, 647: 20,
	648: 20, 649: 20, 650: 20, 651: 38, 652: 38, 653: 38, 654: 38, 655: 35, 656: 45, 657: 45,
	658: 45, 659: 45, 660: 44, 661: 44, 662: 44, 663: 44, 664: 44, 665: 46, 666: 46, 667: 46,
	668: 46, 669: 46, 670: 49, 671: 49, 672: 49, 673: 49, 674: 49, 675: 40, 676: 52, 677: 52,
	678: 52, 679: 52, 680: 55, 681: 55, 682: 55, 683: 55, 684: 55, 848: 32, 1164: 38, 1165: 50,
	1166: 50, 1167: 50, 1168: 50, 1174: 39, 1307: 53, 1308: 53, 1309: 53, 1310: 53, 1311: 53,
	1355: 48, 1356: 48, 1357: 48, 1358: 48, 1359: 48
	};

	const WEAPON_BASE = (() => {
	const m = Object.create(null);
	for (const id of Object.keys(BASE_DAMAGE_VALUES)) {
	  if (BASE_ACCURACY_VALUES[id] !== undefined) {
		m[id] = { baseDamage: BASE_DAMAGE_VALUES[id], baseAccuracy: BASE_ACCURACY_VALUES[id] };
	  }
	}
	return m;
	})();

	const ARMOR_BASE = (() => {
	const m = Object.create(null);
	for (const [id, v] of Object.entries(BASE_ARMOUR_VALUES)) m[id] = { baseArmour: v };
	return m;
	})();

	/** ==================== SCRIPT CONFIG ==================== **/
	const STEP = 0.01;
	const HEAT_MAX = 1.00;

	/** ==================== SELECTORS ==================== **/
	const IM_TILE_SELECTOR        = "li.tt-highlight-modified";
	const IM_SEARCH_TILE_SELECTOR = 'div[class*="itemTile___"]';

	const AL_TILE_SELECTOR = 'div[class*="virtualListing"]';
	const AL_BUTTON_SELECTOR = 'button[class*="viewInfoButton"]';

	const BZ_ITEM_SELECTOR = 'div[data-testid="item"]';
	const BZ_ADD_ITEM_SELECTOR = 'ul.items-cont li.clearfix[data-group="child"]';
	const BZ_STATS_SELECTOR = '[class*="infoBonuses"], .bonuses-wrap';

	const IP_TILE_SELECTOR = "ul.itemsList > li";
	const IP_NAME_SELECTOR = ".title-wrap .name";
	const IP_NAME_SELECTOR_2 = ".title-wrap .name-wrap .t-overflow";
	const IP_CONT_WRAP_SELECTOR = ".cont-wrap";

	const DP_TILE_SELECTOR = "li[data-group='child']";

	const FA_TILE_SELECTOR = ".armoury-tabs ul.item-list > li";

	const AM_TILE_SELECTOR = "div.item-cont-wrap";
	const AM_STATS_WRAP_SELECTOR = ".item-bonuses";
	const BIGAL_TILE_SELECTOR = 'li[data-item], li[data-rowkey]';

	/** ==================== UTILS ==================== **/
	function safeText(el) { return (el?.textContent || "").trim(); }

	function clamp(x, lo, hi) {
	if (!Number.isFinite(x)) return lo;
	return Math.max(lo, Math.min(hi, x));
	}

	function quantizeHeat(p) {
	const q = Math.round(p / STEP) * STEP;
	return clamp(q, 0, HEAT_MAX);
	}

	function lerp(a, b, t) { return a + (b - a) * t; }
	function rgb(r, g, b) { return `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`; }

	function colorForHeat(pRaw) {
	const p = clamp(pRaw, 0, HEAT_MAX);

	const gray   = { r:120, g:120, b:120 };
	const blue   = { r: 60, g:140, b:240 };
	const green  = { r: 60, g:200, b: 90 };
	const yellow = { r:244, g:200, b: 42 };
	const orange = { r:245, g:130, b: 35 };
	const red    = { r:220, g: 40, b: 40 };

	if (p <= 0.25) {
	  const t = p / 0.25;
	  return rgb(lerp(gray.r, blue.r, t), lerp(gray.g, blue.g, t), lerp(gray.b, blue.b, t));
	}
	if (p <= 0.50) {
	  const t = (p - 0.25) / 0.25;
	  return rgb(lerp(blue.r, green.r, t), lerp(blue.g, green.g, t), lerp(blue.b, green.b, t));
	}
	if (p <= 0.75) {
	  const t = (p - 0.50) / 0.25;
	  return rgb(lerp(green.r, yellow.r, t), lerp(green.g, yellow.g, t), lerp(green.b, yellow.b, t));
	}
	if (p <= 0.90) {
	  const t = (p - 0.75) / 0.15;
	  return rgb(lerp(yellow.r, orange.r, t), lerp(yellow.g, orange.g, t), lerp(yellow.b, orange.b, t));
	}
	const t = (p - 0.90) / 0.10;
	return rgb(lerp(orange.r, red.r, t), lerp(orange.g, red.g, t), lerp(orange.b, red.b, t));
	}

	function toHeat(rawP) {
	if (!Number.isFinite(rawP)) return 0;
	return clamp(rawP, 0, HEAT_MAX);
	}

	/** ==================== MARKET URL BUILDER ==================== **/
	function buildMarketUrl(itemId, stats) {
	const base = 'https://www.torn.com/page.php?sid=ItemMarket#/market/view=search';
	if (stats.isWeapon && stats.damage !== null && stats.accuracy !== null) {
	  const d = Math.floor(stats.damage);
	  const a = Math.floor(stats.accuracy);
	  return `${base}&itemID=${itemId}&sortField=price&sortOrder=ASC&damageFrom=${d}&damageTo=100&accuracyFrom=${a}&accuracyTo=100`;
	}
	if (stats.isArmor && stats.armor !== null) {
	  const arm = Math.floor(stats.armor);
	  return `${base}&itemID=${itemId}&sortField=price&sortOrder=ASC&armorFrom=${arm}&armorTo=100`;
	}
	return null;
	}

	/** ==================== ITEM ID EXTRACTION ==================== **/
	function getItemId(root) {
	// item.php / dump.php / item market rows: li has data-item attribute
	if (root.dataset?.item) return root.dataset.item;
	// Big Al and other list rows may use data-rowkey instead
	const rowKey = root.dataset?.rowkey || root.getAttribute?.('data-rowkey');
	if (rowKey) {
		const m = rowKey.match(/f?(\d+)/);
		if (m) return m[1];
	}
	const img = root.querySelector('img[src*="/images/items/"]');
	const m = img?.src.match(/\/images\/items\/(\d+)\//);
	return m ? m[1] : null;
	}

	/** ==================== HEAT CALC ==================== **/
	function weaponHeatRaw(d, a, base) {
	const q = ((d - base.baseDamage) + (a - base.baseAccuracy)) / 10;
	return Number.isFinite(q) ? q : null;
	}

	function armorHeatRaw(r, base) {
	const q = (r - base.baseArmour) / 5;
	return Number.isFinite(q) ? q : null;
	}

	/** ==================== BADGE ==================== **/
	const BADGE_CLASS       = "torn-heat-quality-badge";
	const BADGE_TEXT_CLASS  = "torn-heat-badge-text";
	const LABEL_CLASS       = "tt-quality-inline-label";
	const MONEYBAG_CLASS    = "torn-heat-market-btn";
	const BZ_MONEYBAG_CLASS = "torn-heat-bz-market-row";
	let cssInjected = false;

	function injectCSSOnce() {
	if (cssInjected) return;
	cssInjected = true;

	const style = document.createElement("style");
	style.textContent = `
	  .${BADGE_CLASS} {
		position: absolute;
		top: 4px;
		left: 4px;
		z-index: 10;
		font-size: 11px;
		font-weight: 900;
		line-height: 1;
		padding: 3px 6px;
		border-radius: 6px;
		background: rgba(0, 0, 0, 0.65);
		text-shadow: 0 1px 1px rgba(0,0,0,0.85);
		pointer-events: none;
		user-select: none;
		white-space: nowrap;
	  }
	  .${LABEL_CLASS} {
		font-size: 11px;
		font-weight: bold;
		margin-left: 5px;
		vertical-align: middle;
	  }
	  .${MONEYBAG_CLASS} {
		cursor: pointer;
		text-decoration: none;
		pointer-events: auto;
		opacity: 0.85;
		display: inline-block;
		vertical-align: middle;
		line-height: 1;
		font-size: 13px;
		margin-left: 4px;
		transition: opacity 0.15s, transform 0.15s;
	  }
	  .${MONEYBAG_CLASS}:hover {
		opacity: 1;
		transform: scale(1.2);
	  }
	`;
	document.head.appendChild(style);
	}

	function removeQualityTitles(root) {
	if (!root) return;
	const rt = root.getAttribute?.("title") || "";
	if (/^\s*Quality:\s*/i.test(rt)) root.removeAttribute("title");
	const titled = root.querySelectorAll?.("[title]") || [];
	for (const el of titled) {
	  const t = el.getAttribute("title") || "";
	  if (/^\s*Quality:\s*/i.test(t)) el.removeAttribute("title");
	}
	}

	function formatBadgeTextFromRaw(pRaw) {
	return `${Math.round(pRaw * 100)}%`;
	}

	function ensurePositioned(anchor) {
	const cs = window.getComputedStyle(anchor);
	if (!cs || cs.position === "static") anchor.style.position = "relative";
	}

	function upsertBadge(anchor, pRaw, color) {
	if (!anchor) return;
	injectCSSOnce();
	ensurePositioned(anchor);
	removeQualityTitles(anchor);

	let badge = anchor.querySelector(`.${BADGE_CLASS}`);
	if (!badge) {
	  badge = document.createElement("span");
	  badge.className = BADGE_CLASS;
	  anchor.appendChild(badge);
	}
	// Use a child span for the text so prepending the moneybag doesn't get wiped
	let textSpan = badge.querySelector(`.${BADGE_TEXT_CLASS}`);
	if (!textSpan) {
	  textSpan = document.createElement("span");
	  textSpan.className = BADGE_TEXT_CLASS;
	  badge.appendChild(textSpan);
	}
	textSpan.textContent = formatBadgeTextFromRaw(pRaw);
	textSpan.style.color = color;
	}

	function upsertBadgeMoneybag(anchor, url) {
	if (!anchor || !url) return;
	const badge = anchor.querySelector(`.${BADGE_CLASS}`);
	if (!badge) return;
	badge.style.pointerEvents = 'auto';
	let btn = badge.querySelector(`.${MONEYBAG_CLASS}`);
	if (!btn) {
	  btn = document.createElement('a');
	  btn.className = MONEYBAG_CLASS;
	  btn.textContent = '💰';
	  btn.title = 'Search Item Market for this stat range';
	  badge.insertBefore(btn, badge.firstChild);
	}
	btn.href = url;
	btn.target = '_blank';
	btn.rel = 'noopener noreferrer';
	}

	function upsertInlineLabel(nameEl, pRaw, color) {
	if (!nameEl) return null;
	injectCSSOnce();
	// Scan siblings rather than only checking the immediate next sibling,
	// so re-renders still find the label after the moneybag has been inserted between them
	let label = null;
	let sib = nameEl.nextElementSibling;
	while (sib) {
	  if (sib.classList.contains(LABEL_CLASS)) { label = sib; break; }
	  sib = sib.nextElementSibling;
	}
	if (!label) {
	  label = document.createElement("span");
	  label.className = LABEL_CLASS;
	  nameEl.after(label);
	}
	label.textContent = formatBadgeTextFromRaw(pRaw);
	label.style.color = color;
	return label;
	}

	function upsertInlineMoneybag(labelEl, url) {
	if (!labelEl || !url) return;
	// Insert/update the moneybag link directly after the quality label
	let btn = labelEl.nextElementSibling;
	if (!btn || !btn.classList.contains(MONEYBAG_CLASS)) {
	  btn = document.createElement('a');
	  btn.className = MONEYBAG_CLASS;
	  btn.textContent = '💰';
	  btn.title = 'Search Item Market for this stat range';
	  labelEl.after(btn);
	}
	btn.href = url;
	btn.target = '_blank';
	btn.rel = 'noopener noreferrer';
	}

	function upsertBazaarMoneybag(itemEl, url) {
	if (!url) return;
	const desc = itemEl.querySelector('[data-testid="description"]');
	if (!desc) return;

	// Clean up old-style wrapper div from previous renders
	desc.querySelector(`.${BZ_MONEYBAG_CLASS}`)?.remove();

	// Target the "(X in stock)" paragraph - use partial class match for CSS-module resilience
	const amountEl = desc.querySelector('[class*="amount___"]');
	if (!amountEl) return;

	// Ensure the paragraph is visible (Torn hides it when stock info isn't loaded yet)
	if (amountEl.style.display === 'none') amountEl.style.display = '';

	let btn = amountEl.querySelector(`.${MONEYBAG_CLASS}`);
	if (!btn) {
	  btn = document.createElement('a');
	  btn.className = MONEYBAG_CLASS;
	  btn.textContent = '💰';
	  btn.title = 'Search Item Market for this stat range';
	  amountEl.appendChild(btn);
	}
	btn.href = url;
	btn.target = '_blank';
	btn.rel = 'noopener noreferrer';
	}

	function findImageAnchor(root) {
	if (!root) return null;
	const direct =
	  root.querySelector('div.imageWrapper___RqvUg') ||
	  root.querySelector('div[class*="imageWrapper"]') ||
	  root.querySelector('div.imgContainer___Ec4I5[data-testid="img-container"]') ||
	  root.querySelector('div[data-testid="img-container"]') ||
	  root.querySelector('span.image-wrap') ||
	  root.querySelector('div.image-wrap') ||
	  root.querySelector('div.img-wrap[data-armoryid]') ||
	  root.querySelector('span.item-plate') ||
	  root.querySelector('span.img-wrap') ||
	  null;
	if (direct) return direct;
	const img = root.querySelector("img");
	if (!img) return null;
	return img.closest("div, span") || img.parentElement || null;
	}

	/** ==================== STAT READERS ==================== **/
	function readStatFromTile(root, iconClass) {
	const icon = root.querySelector(`i.${iconClass}`);
	if (!icon) return null;

	const attachment = icon.closest(".bonus-attachment");
	if (attachment) {
	  const valEl = attachment.querySelector("span.label-value, span.t-overflow, span");
	  const txt = safeText(valEl);
	  const v = parseFloat(txt);
	  return Number.isFinite(v) ? v : null;
	}

	const li = icon.closest("li");
	if (li) {
	  const candidates = li.querySelectorAll("span.label-value, span.t-overflow, span");
	  for (const sp of candidates) {
		const txt = safeText(sp);
		if (/^\d+(\.\d+)?$/.test(txt)) {
		  const v = parseFloat(txt);
		  if (Number.isFinite(v)) return v;
		}
	  }
	}

	const near = icon.parentElement?.querySelector("span.label-value, span.t-overflow, span");
	if (near) {
	  const txt = safeText(near);
	  if (/^\d+(\.\d+)?$/.test(txt)) {
		const v = parseFloat(txt);
		if (Number.isFinite(v)) return v;
	  }
	}

	const sib = icon.nextElementSibling;
	if (sib) {
	  const txt = safeText(sib);
	  if (/^\d+(\.\d+)?$/.test(txt)) {
		const v = parseFloat(txt);
		if (Number.isFinite(v)) return v;
	  }
	}

	return null;
	}

	function imParsePointsFromAria(tile, containsText) {
	const el = tile.querySelector(`[aria-label*="${containsText}"]`);
	if (!el) return null;
	const aria = el.getAttribute("aria-label") || "";
	const val = parseFloat(aria);
	return Number.isFinite(val) ? val : null;
	}

	function imGetRollStats(tile) {
	const damage = imParsePointsFromAria(tile, "damage points");
	const accuracy = imParsePointsFromAria(tile, "accuracy points");
	const armor = imParsePointsFromAria(tile, "armor points");
	return {
	  isWeapon: damage !== null && accuracy !== null,
	  isArmor: armor !== null && damage === null,
	  damage, accuracy, armor
	};
	}

	function bzFindValue(statsBlock, label) {
	// Torn bazaar uses the non-standard "area-label" attribute instead of "aria-label".
	// The add listing page also renders icons only by class name.
	const selectors = [
	  `i[area-label="${label}"]`,
	  `i[aria-label="${label}"]`,
	];
	if (label === 'defence') {
	  selectors.push('i.bonus-attachment-item-defence-bonus', 'i.bonus-attachment-item-armor-bonus');
	} else {
	  selectors.push(`i.bonus-attachment-item-${label}-bonus`);
	}
	const icon = statsBlock.querySelector(selectors.join(', '));
	if (!icon) return null;
	const container = icon.closest('div') || icon.parentElement;
	const valEl = container?.querySelector('span.t-overflow') || icon.nextElementSibling;
	const val = parseFloat(safeText(valEl));
	return Number.isFinite(val) ? val : null;
	}

	function bzGetRollStats(itemEl) {
	const statsBlock = itemEl.querySelector(BZ_STATS_SELECTOR);
	if (!statsBlock) return { isWeapon: false, isArmor: false };
	const damage = bzFindValue(statsBlock, "damage");
	const accuracy = bzFindValue(statsBlock, "accuracy");
	const defence = bzFindValue(statsBlock, "defence");
	return {
	  isWeapon: damage !== null && accuracy !== null,
	  isArmor: defence !== null && damage === null,
	  damage, accuracy, armor: defence
	};
	}

	function ipGetRollStats(tileLi) {
	const cont = tileLi.querySelector(IP_CONT_WRAP_SELECTOR) || tileLi;
	const damage = readStatFromTile(cont, "bonus-attachment-item-damage-bonus");
	const accuracy = readStatFromTile(cont, "bonus-attachment-item-accuracy-bonus");
	const defence = readStatFromTile(cont, "bonus-attachment-item-defence-bonus");
	return {
	  isWeapon: damage !== null && accuracy !== null,
	  isArmor: defence !== null && damage === null,
	  damage, accuracy, armor: defence
	};
	}

	function genericGetRollStats(root) {
	const damage = readStatFromTile(root, "bonus-attachment-item-damage-bonus");
	const accuracy = readStatFromTile(root, "bonus-attachment-item-accuracy-bonus");
	const defence = readStatFromTile(root, "bonus-attachment-item-defence-bonus");
	return {
	  isWeapon: damage !== null && accuracy !== null,
	  isArmor: defence !== null && damage === null,
	  damage, accuracy, armor: defence
	};
	}

	/** ==================== SHARED APPLY ==================== **/
	function applyBadge(root, stats, itemId) {
	let pRaw = null;
	if (stats.isWeapon) {
	  const base = WEAPON_BASE[itemId];
	  if (!base) return;
	  pRaw = weaponHeatRaw(stats.damage, stats.accuracy, base);
	} else if (stats.isArmor) {
	  const base = ARMOR_BASE[itemId];
	  if (!base) return;
	  pRaw = armorHeatRaw(stats.armor, base);
	} else return;

	if (pRaw === null) return;
	const color = colorForHeat(quantizeHeat(toHeat(pRaw)));
	const anchor = findImageAnchor(root);
	if (anchor) upsertBadge(anchor, pRaw, color);
	}

	/** ==================== RECOLOR PASSES ==================== **/
	function recolorItemMarket() {
	for (const tile of document.querySelectorAll(IM_TILE_SELECTOR)) {
	  const itemId = getItemId(tile);
	  if (!itemId) continue;
	  const stats = imGetRollStats(tile);
	  applyBadge(tile, stats, itemId);
	  if (stats.isWeapon || stats.isArmor) {
		const anchor = findImageAnchor(tile);
		if (anchor) upsertBadgeMoneybag(anchor, buildMarketUrl(itemId, stats));
	  }
	}
	}

	function recolorItemMarketSearch() {
	for (const tile of document.querySelectorAll(IM_SEARCH_TILE_SELECTOR)) {
	  const itemId = getItemId(tile);
	  if (!itemId) continue;
	  applyBadge(tile, imGetRollStats(tile), itemId);
	}
	}

	function recolorBazaar() {
	for (const itemEl of document.querySelectorAll(BZ_ITEM_SELECTOR)) {
	  const itemId = getItemId(itemEl);
	  if (!itemId) continue;
	  const stats = bzGetRollStats(itemEl);
	  if (!stats.isWeapon && !stats.isArmor) continue;
	  applyBadge(itemEl, stats, itemId);
	  upsertBazaarMoneybag(itemEl, buildMarketUrl(itemId, stats));
	}
	}

	function recolorBazaarAdd() {
	for (const itemEl of document.querySelectorAll(BZ_ADD_ITEM_SELECTOR)) {
	  const itemId = getItemId(itemEl);
	  if (!itemId) continue;
	  const stats = bzGetRollStats(itemEl);
	  if (!stats.isWeapon && !stats.isArmor) continue;
	  let pRaw = null;
	  if (stats.isWeapon) {
		const base = WEAPON_BASE[itemId];
		if (!base) continue;
		pRaw = weaponHeatRaw(stats.damage, stats.accuracy, base);
	  } else {
		const base = ARMOR_BASE[itemId];
		if (!base) continue;
		pRaw = armorHeatRaw(stats.armor, base);
	  }
	  if (pRaw === null) continue;
	  const color = colorForHeat(quantizeHeat(toHeat(pRaw)));
	  const nameEl = itemEl.querySelector('.title-wrap .name-wrap span.t-overflow');
	  const labelEl = upsertInlineLabel(nameEl, pRaw, color);
	  upsertInlineMoneybag(labelEl, buildMarketUrl(itemId, stats));
	}
	}

	function recolorItemPage() {
	for (const li of document.querySelectorAll(IP_TILE_SELECTOR)) {
	  const itemId = getItemId(li);
	  if (!itemId) continue;

	  const stats = ipGetRollStats(li);
	  if (!stats.isWeapon && !stats.isArmor) continue;

	  let pRaw = null;
	  if (stats.isWeapon) {
		const base = WEAPON_BASE[itemId];
		if (!base) continue;
		pRaw = weaponHeatRaw(stats.damage, stats.accuracy, base);
	  } else {
		const base = ARMOR_BASE[itemId];
		if (!base) continue;
		pRaw = armorHeatRaw(stats.armor, base);
	  }
	  if (pRaw === null) continue;

	  const color   = colorForHeat(quantizeHeat(toHeat(pRaw)));
	  const nameEl  = li.querySelector(IP_NAME_SELECTOR_2) || li.querySelector(IP_NAME_SELECTOR);
	  const labelEl = upsertInlineLabel(nameEl, pRaw, color);
	  upsertInlineMoneybag(labelEl, buildMarketUrl(itemId, stats));
	}
	}

	function alGetRollStats(tile) {
	// Stats appear as: <span aria-label="34.26 armor"> — parseFloat handles the trailing keyword
	function parseAria(keyword) {
	  const el = tile.querySelector(`[aria-label*=" ${keyword}"]`);
	  if (!el) return null;
	  const val = parseFloat(el.getAttribute("aria-label") || "");
	  return Number.isFinite(val) ? val : null;
	}
	const damage   = parseAria("damage");
	const accuracy = parseAria("accuracy");
	const armor    = parseAria("armor");
	return {
	  isWeapon: damage !== null && accuracy !== null,
	  isArmor:  armor  !== null && damage   === null,
	  damage, accuracy, armor
	};
	}

	function recolorAddListing() {
	for (const tile of document.querySelectorAll(AL_TILE_SELECTOR)) {
	  const itemId = getItemId(tile);
	  if (!itemId) continue;
	  const stats = alGetRollStats(tile);
	  if (!stats.isWeapon && !stats.isArmor) continue;
	  let pRaw = null;
	  if (stats.isWeapon) {
		const base = WEAPON_BASE[itemId];
		if (!base) continue;
		pRaw = weaponHeatRaw(stats.damage, stats.accuracy, base);
	  } else {
		const base = ARMOR_BASE[itemId];
		if (!base) continue;
		pRaw = armorHeatRaw(stats.armor, base);
	  }
	  if (pRaw === null) continue;
	  const color   = colorForHeat(quantizeHeat(toHeat(pRaw)));
	  const viewBtn = tile.querySelector(AL_BUTTON_SELECTOR);
	  const nameEl  = viewBtn?.querySelector("span.t-overflow");
	  const labelEl = upsertInlineLabel(nameEl, pRaw, color);
	  upsertInlineMoneybag(labelEl, buildMarketUrl(itemId, stats));
	}
	}

	function recolorDumpTrash() {
	for (const li of document.querySelectorAll(DP_TILE_SELECTOR)) {
	  const itemId = getItemId(li);
	  if (!itemId) continue;
	  const stats = genericGetRollStats(li);
	  if (!stats.isWeapon && !stats.isArmor) continue;
	  let pRaw = null;
	  if (stats.isWeapon) {
		const base = WEAPON_BASE[itemId];
		if (!base) continue;
		pRaw = weaponHeatRaw(stats.damage, stats.accuracy, base);
	  } else {
		const base = ARMOR_BASE[itemId];
		if (!base) continue;
		pRaw = armorHeatRaw(stats.armor, base);
	  }
	  if (pRaw === null) continue;
	  const color  = colorForHeat(quantizeHeat(toHeat(pRaw)));
	  const nameEl = li.querySelector(".title-wrap .name-wrap .t-overflow");
	  const labelEl = upsertInlineLabel(nameEl, pRaw, color);
	  // Add price to dump items
	  if (labelEl && pricesCache[itemId]) {
		addPriceToElement(labelEl, itemId);
	  }
	}
	}

	function recolorFactionArmory() {
	for (const li of document.querySelectorAll(FA_TILE_SELECTOR)) {
	  const itemId = getItemId(li);
	  if (!itemId) continue;
	  applyBadge(li, genericGetRollStats(li), itemId);
	}
	}

	function recolorAuctionMarket() {
	for (const wrap of document.querySelectorAll(AM_TILE_SELECTOR)) {
	  const itemId = getItemId(wrap);
	  if (!itemId) continue;
	  const statsRoot = wrap.querySelector(AM_STATS_WRAP_SELECTOR) || wrap;
	  applyBadge(wrap, genericGetRollStats(statsRoot), itemId);
	  removeQualityTitles(wrap);
	}
	}

	function bigAlGetRollStats(root) {
	const statsContainer = root.querySelector('.bonuses, .bonuses-wrap') || root;
	let damage = null;
	let accuracy = null;
	let armor = null;
	for (const li of statsContainer.querySelectorAll('li')) {
	  const txt = safeText(li).replace(/[$,]/g, '');
	  const value = parseFloat(txt);
	  if (!Number.isFinite(value)) continue;
	  const icon = li.querySelector('i');
	  if (!icon) continue;
	  const cls = icon.className;
	  if (cls.includes('bonus-attachment-item-damage-bonus')) {
		damage = value;
	  } else if (cls.includes('bonus-attachment-item-accuracy-bonus')) {
		accuracy = value;
	  } else if (cls.includes('bonus-attachment-item-defence-bonus') || cls.includes('bonus-attachment-item-armor-bonus')) {
		armor = value;
	  }
	}
	return {
	  isWeapon: damage !== null && accuracy !== null,
	  isArmor: armor !== null && damage === null,
	  damage, accuracy, armor
	};
	}

	function recolorBigAlGunShop() {
	for (const li of document.querySelectorAll(BIGAL_TILE_SELECTOR)) {
	  const itemId = getItemId(li);
	  if (!itemId) continue;
	  const stats = bigAlGetRollStats(li);
	  if (!stats.isWeapon && !stats.isArmor) continue;
	  const pRaw = stats.isWeapon
	    ? weaponHeatRaw(stats.damage, stats.accuracy, WEAPON_BASE[itemId])
	    : armorHeatRaw(stats.armor, ARMOR_BASE[itemId]);
	  if (pRaw === null) continue;
	  const color = colorForHeat(quantizeHeat(toHeat(pRaw)));
	  const nameEl = li.querySelector(
	    'li.desc.t-overflow span.name, .desc.t-overflow span.name, .desc span.name, span.name'
	  );
	  const labelEl = upsertInlineLabel(nameEl, pRaw, color);
	  upsertInlineMoneybag(labelEl, buildMarketUrl(itemId, stats));
	}
	}

	/** ==================== MAIN ==================== **/
	const PAGE = (() => {
	const h = window.location.href;
	if (h.includes('page.php?sid=ItemMarket')) return 'itemmarket';
	if (h.includes('bazaar.php'))              return 'bazaar';
	if (h.includes('bigalgunshop.php'))        return 'bigalgunshop';
	if (h.includes('item.php'))                return 'itempage';
	if (h.includes('dump.php'))                return 'dump';
	if (h.includes('factions.php'))            return 'factions';
	if (h.includes('amarket.php'))             return 'amarket';
	return 'unknown';
	})();

	async function recolorAll() {
	try {
	  // Fetch prices for dump page
	  if (PAGE === 'dump') {
		await fetchItemPrices();
	  }
	  if      (PAGE === 'itemmarket') { recolorItemMarket(); recolorAddListing(); recolorItemMarketSearch(); }
	  else if (PAGE === 'bazaar') {
	    recolorBazaar();
	    //if (window.location.href.includes('bazaar.php#/add')) recolorBazaarAdd();
	  }
	  else if (PAGE === 'bigalgunshop') recolorBigAlGunShop();
	  else if (PAGE === 'itempage')   recolorItemPage();
	  else if (PAGE === 'dump')       recolorDumpTrash();
	  else if (PAGE === 'factions')   recolorFactionArmory();
	  else if (PAGE === 'amarket')    recolorAuctionMarket();
	} catch (e) {
	  console.error("[Torn Heat] Script error:", e);
	}
	}

	/** ==================== AUTO-UPDATE ==================== **/
	let scheduled = false;
	function schedule() {
	if (scheduled) return;
	scheduled = true;
	requestAnimationFrame(() => { scheduled = false; recolorAll(); });
	}

	const observer = new MutationObserver(schedule);
	observer.observe(document.body, { childList: true, subtree: true });

	// Initialize script
	if (PAGE === 'dump') {
		fetchItemPrices().then(() => recolorAll());
	} else {
		recolorAll();
	}
})();
