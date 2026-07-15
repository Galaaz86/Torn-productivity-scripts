// ==UserScript==
// @name         TornW3B Travel Stock - Restock Predictor
// @namespace    https://weav3r.dev/
// @version      1.3.0
// @description  Adds predicted restock time, sell-out estimate, and "fly now" stock-on-arrival check based on last sell-out + restock delay from the stock chart
// @author       Galaaz86 [4178341]
// @license      MIT License
// @match        https://weav3r.dev/travel-stock*
// @grant        none
// @run-at       document-idle
// @downloadURL https://update.greasyfork.org/scripts/584664/TornW3B%20Travel%20Stock%20-%20Restock%20Predictor.user.js
// @updateURL https://update.greasyfork.org/scripts/584664/TornW3B%20Travel%20Stock%20-%20Restock%20Predictor.meta.js
// ==/UserScript==

(function () {
	'use strict';

	// ── Hardcoded flight times [standard, airstrip, wlt, business] in minutes ──
	const FLIGHT_TIMES = {
		'ciudad juárez': [25,  17,  12,   8],
		'george town':   [33,  24,  17,  10],
		'toronto':       [39,  27,  19,  11],
		'honolulu':      [127,  89,  63,  38],
		'london':        [151, 105,  76,  45],
		'buenos aires':  [158, 111,  79,  47],
		'zurich':        [166, 117,  83,  50],
		'tokyo':         [213, 150, 107,  64],
		'beijing':       [229, 160, 115,  68],
		'dubai':         [257, 180, 128,  77],
		'johannesburg':  [281, 197, 141,  84],
	};

	const CITY_ALIASES = {
		'mexico': 'ciudad juárez',
		'cayman': 'george town', 'cayman islands': 'george town',
		'canada': 'toronto',
		'hawaii': 'honolulu',
		'uk': 'london', 'united kingdom': 'london', 'england': 'london',
		'argentina': 'buenos aires',
		'switzerland': 'zurich',
		'japan': 'tokyo',
		'china': 'beijing',
		'uae': 'dubai', 'united arab emirates': 'dubai',
		'south africa': 'johannesburg',
	};

	const MODE_MAP = {
		'standard': 0, 'airstrip': 1,
		'wlt': 2, 'wlt benefit': 2,
		'business': 3, 'business class': 3,
	};

	function resolveCity(raw) {
		const s = raw.toLowerCase().trim().replace(/[-_]/g, ' ');
		return FLIGHT_TIMES[s] ? s : (CITY_ALIASES[s] || null);
	}

	function minutesToDuration(mins) {
		const h = Math.floor(mins / 60), m = mins % 60;
		return h > 0 ? (m > 0 ? `${h}h ${m}m` : `${h}h`) : `${m}m`;
	}

	// Sort longest-first so "buenos aires" matches before "argentina", etc.
	const ALL_CITY_NAMES = [...Object.keys(FLIGHT_TIMES), ...Object.keys(CITY_ALIASES)]
		.sort((a, b) => b.length - a.length);

	// Map flag filenames → canonical city key (used for mobile where no text is shown)
	const FLAG_CITY_MAP = {
		'fl_mexico': 'ciudad juárez',
		'fl_cayman_islands': 'george town',
		'fl_canada': 'toronto',
		'fl_hawaii': 'honolulu',
		'fl_uk': 'london',
		'fl_argentina': 'buenos aires',
		'fl_switzerland': 'zurich',
		'fl_japan': 'tokyo',
		'fl_china': 'beijing',
		'fl_uae': 'dubai',
		'fl_south_africa': 'johannesburg',
	};

	function cityFromFlag(el) {
		const img = el?.querySelector('img[src*="fl_"]');
		if (!img) return null;
		const m = (img.getAttribute('src') || '').match(/fl_([\w]+)\.svg/);
		return m ? (FLAG_CITY_MAP['fl_' + m[1]] || null) : null;
	}

	function textCity(el) {
		if (!el) return null;
		const text = el.textContent.toLowerCase();
		for (const alias of ALL_CITY_NAMES) {
			if (text.includes(alias)) return resolveCity(alias);
		}
		return null;
	}

	function detectCity(panel) {
		// Desktop table: panel is inside <td colspan> → <tr> (expanded row).
		// Country name + flag are in the PREVIOUS <tr>.
		const row = panel.closest('tr');
		const prevRow = row?.previousElementSibling;
		if (prevRow) {
			const c = cityFromFlag(prevRow) || textCity(prevRow);
			if (c) return c;
		}

		// Mobile accordion: panel is inside a border-b wrapper div that also
		// contains the header div with the flag image.
		const borderDiv = panel.closest('[class*="border-b"]');
		if (borderDiv) {
			const c = cityFromFlag(borderDiv) || textCity(borderDiv);
			if (c) return c;
		}

		// Panel text itself
		const c = textCity(panel);
		if (c) return c;

		// URL path segments
		for (const seg of window.location.pathname.split('/')) {
			const key = resolveCity(decodeURIComponent(seg));
			if (key) return key;
		}
		// URL query params
		const params = new URLSearchParams(window.location.search);
		for (const k of ['city', 'destination', 'location', 'country']) {
			const key = resolveCity(params.get(k) || '');
			if (key) return key;
		}
		// Global headings fallback
		for (const el of document.querySelectorAll('h1, h2, h3')) {
			const key = textCity(el);
			if (key) return key;
		}
		return null;
	}

	function detectMode() {
		// URL params
		const params = new URLSearchParams(window.location.search);
		for (const k of ['mode', 'travel', 'travelmode', 'travel_mode', 'class', 'travelclass']) {
			const v = (params.get(k) || '').toLowerCase().replace(/[-_]/g, ' ');
			if (MODE_MAP[v] !== undefined) return v;
		}
		// Current markup: a ".ts-trip__modes" button group where the active
		// button carries the "ts-trip__mode--on" class.
		const activeModeBtn = document.querySelector('.ts-trip__mode--on, .ts-trip__mode.ts-trip__mode--on');
		if (activeModeBtn) {
			const text = activeModeBtn.textContent.trim().toLowerCase();
			if (MODE_MAP[text] !== undefined) return text;
		}
		// Legacy markup: inline styles for selection state — the active button
		// had "var(--accent-primary)" in its style whereas inactive buttons used
		// "var(--text-secondary)" and "border: 1px solid transparent".
		// Find the "Travel time" label, then check its sibling button group.
		const travelLabel = [...document.querySelectorAll('p')].find(p =>
			p.textContent.trim().toLowerCase() === 'travel time'
		);
		if (travelLabel) {
			const btnGroup = travelLabel.nextElementSibling;
			if (btnGroup) {
				for (const btn of btnGroup.querySelectorAll('button')) {
					const style = btn.getAttribute('style') || '';
					const text = btn.textContent.trim().toLowerCase();
					if (style.includes('var(--accent-primary)') && MODE_MAP[text] !== undefined) {
						return text;
					}
				}
			}
		}
		// Generic fallback (aria / class based)
		for (const sel of ['[aria-selected="true"]', '[data-state="active"]', '[data-active="true"]']) {
			for (const el of document.querySelectorAll(sel)) {
				const text = el.textContent.toLowerCase();
				for (const k of Object.keys(MODE_MAP)) {
					if (text.includes(k)) return k;
				}
			}
		}
		return null;
	}

	function getFlightInfo(panel) {
		const city = detectCity(panel);
		if (!city) return null;
		const mode = detectMode() || 'standard';
		const mins = FLIGHT_TIMES[city][MODE_MAP[mode] ?? 0];
		return { mins, city, mode };
	}

	// "1h 58m" | "45m" | "2h" → total minutes
	function parseDelayToMinutes(text) {
		let total = 0;
		const h = text.match(/(\d+)\s*h/);
		const m = text.match(/(\d+)\s*m/);
		if (h) total += parseInt(h[1], 10) * 60;
		if (m) total += parseInt(m[1], 10);
		return total;
	}

	// Absolute minutes → "HH:MM" (wraps at midnight)
	function minutesToHHMM(mins) {
		const n = ((mins % 1440) + 1440) % 1440;
		const h = Math.floor(n / 60);
		const m = Math.floor(n % 60);
		return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
	}

	// Build an array of {x, minutes} from the recharts x-axis tick labels.
	// Minutes are cumulative (handles midnight rollover by adding 1440).
	function buildTimeTicks(svg) {
		const group = svg.querySelector('.recharts-xAxis-tick-labels');
		if (!group) return [];

		const ticks = [];
		let prevRaw = null;
		let dayOffset = 0;

		group.querySelectorAll('text').forEach(el => {
			const x = parseFloat(el.getAttribute('x'));
			const tspan = el.querySelector('tspan');
			if (!tspan || isNaN(x)) return;

			const parts = tspan.textContent.trim().split(':');
			const rawMinutes = parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);

			if (prevRaw !== null && rawMinutes < prevRaw - 60) dayOffset += 1440;

			ticks.push({ x, minutes: rawMinutes + dayOffset });
			prevRaw = rawMinutes;
		});

		return ticks;
	}

	// Linear-interpolate an SVG x-coordinate to cumulative minutes
	function xToMinutes(x, ticks) {
		if (!ticks.length) return null;
		if (x <= ticks[0].x) return ticks[0].minutes;
		if (x >= ticks[ticks.length - 1].x) return ticks[ticks.length - 1].minutes;

		for (let i = 1; i < ticks.length; i++) {
			if (x <= ticks[i].x) {
				const ratio = (x - ticks[i - 1].x) / (ticks[i].x - ticks[i - 1].x);
				return ticks[i - 1].minutes + ratio * (ticks[i].minutes - ticks[i - 1].minutes);
			}
		}
		return null;
	}

	// Read the travel time displayed in the "Stock on Arrival Estimate" card.
	function getTravelTimeText(panel) {
		const p = [...panel.querySelectorAll('p')].find(el =>
			el.textContent.includes('Based on') && el.textContent.includes('travel time')
		);
		if (!p) return null;
		const match = p.textContent.match(/Based on (.+?) travel time/);
		return match ? match[1].trim() : null;
	}

	// Read the "Est. Restock" card.
	function getEstRestockStatus(panel, ticks) {
		const label = [...panel.querySelectorAll('p')].find(p =>
			p.textContent.trim() === 'Est. Restock'
		);
		if (!label) return { minutes: null, isAnyMoment: false };
		const valueText = label.nextElementSibling?.textContent?.trim() || '';
		if (valueText === 'Any moment') return { minutes: null, isAnyMoment: true };
		if (!/^\d{1,2}:\d{2}$/.test(valueText)) return { minutes: null, isAnyMoment: false };
		const [h, m] = valueText.split(':').map(Number);
		const rawMinutes = h * 60 + m;
		const approxNow = ticks[ticks.length - 1].minutes;
		const dayOffset = Math.round((approxNow - rawMinutes) / 1440) * 1440;
		return { minutes: rawMinutes + dayOffset, isAnyMoment: false };
	}

	// ── sessionStorage cache ──────────────────────────────────────────────────
	// When Est. Restock shows a specific time we cache it as a wall-clock ms
	// value. On subsequent refreshes (when the card shows "Any moment") we use
	// the cache rather than falling back to imprecise SVG parsing.

	function getPanelCacheKey(panel) {
		const panels = [...document.querySelectorAll('h4')]
			.filter(h4 => h4.textContent.includes('Stock Level - Last 24 Hours'))
			.map(h4 => h4.closest('.rounded-lg.border')?.parentElement)
			.filter(Boolean);
		return `rp_${panels.indexOf(panel)}`;
	}

	function cacheRestockWallClock(key, nextRestockMinutes, nowMinutes) {
		try {
			const ms = Date.now() + (nextRestockMinutes - nowMinutes) * 60000;
			sessionStorage.setItem(key, String(ms));
		} catch (e) {}
	}

	function getCachedRestockWallClock(key) {
		try {
			const v = sessionStorage.getItem(key);
			return v ? Number(v) : null;
		} catch (e) { return null; }
	}

	// ── React fiber probe ─────────────────────────────────────────────────────
	// Walk up from the recharts curve element to find the AreaChart data array,
	// then locate the last sell-out event using actual stock values + timestamps
	// instead of pixel positions.

	function rawMinutesFromValue(v) {
		if (typeof v === 'number') {
			if (v > 1e12) { const d = new Date(v);      return d.getHours() * 60 + d.getMinutes(); }
			if (v > 1e9)  { const d = new Date(v * 1000); return d.getHours() * 60 + d.getMinutes(); }
		}
		if (typeof v === 'string') {
			const m = v.match(/(\d{1,2}):(\d{2})/);
			if (m) return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
		}
		return null;
	}

function findSelloutInChartData(data, ticks) {
	if (!data?.length || typeof data[0] !== 'object') return null;
	const keys = Object.keys(data[0]);

	// Identify which key holds stock (numeric, goes to 0 at end)
	const stockKey = keys.find(k => {
		const vals = data.map(d => d[k]);
		return vals.every(v => typeof v === 'number') &&
			vals.some(v => v > 0) &&
			vals[vals.length - 1] === 0;
	});
	if (!stockKey) return null;

	// Identify which key holds time (string HH:MM or unix timestamp)
	const timeKey = keys.find(k => {
		if (k === stockKey) return false;
		const v = data[0][k];
		return (typeof v === 'number' && v > 1e9) ||
			(typeof v === 'string' && /^\d{1,2}:\d{2}/.test(v));
	});
	if (!timeKey) return null;

	const approxNow = ticks[ticks.length - 1].minutes;
	let bestPast = null;
	let bestFuture = null;

	for (let i = 1; i < data.length; i++) {
		if (data[i][stockKey] === 0 && data[i - 1][stockKey] > 0) {
			const rawMins = rawMinutesFromValue(data[i - 1][timeKey]) || rawMinutesFromValue(data[i][timeKey]);
			if (rawMins === null) continue;

			const dayOffset = Math.round((approxNow - rawMins) / 1440) * 1440;
			const selloutMinutes = rawMins + dayOffset;

			if (selloutMinutes <= approxNow) {
				bestPast = bestPast === null ? selloutMinutes : Math.max(bestPast, selloutMinutes);
			} else {
				bestFuture = bestFuture === null ? selloutMinutes : Math.min(bestFuture, selloutMinutes);
			}
		}
	}

	return bestPast !== null ? bestPast : bestFuture;
	}

	function getSelloutFromFiber(svg, ticks) {
		const curve = svg.querySelector('.recharts-area-curve');
		if (!curve) return null;

		const fKey = Object.keys(curve).find(k =>
			k.startsWith('__reactFiber$') || k.startsWith('__reactInternalInstance$')
		);
		if (!fKey) return null;

		let fiber = curve[fKey];
		for (let depth = 0; fiber && depth < 80; depth++) {
			const data = fiber.memoizedProps?.data;
			if (Array.isArray(data) && data.length > 5) {
				const minutes = findSelloutInChartData(data, ticks);
				if (minutes !== null) {
					return { label: minutesToHHMM(minutes), minutes, source: 'fiber' };
				}
			}
			fiber = fiber.return;
		}
		return null;
	}

	// ── SVG path fallback ─────────────────────────────────────────────────────

	function findLastSelloutInfo(svg, ticks) {
		// 1. Recharts red reference lines
		const lines = [...svg.querySelectorAll('.recharts-reference-line line')]
			.filter(line => line.getAttribute('stroke') === '#ef4444');

		if (lines.length) {
			lines.sort((a, b) => parseFloat(b.getAttribute('x1')) - parseFloat(a.getAttribute('x1')));
			const lastLine = lines[0];
			const x1 = parseFloat(lastLine.getAttribute('x1'));
			const g = lastLine.closest('.recharts-reference-line') || lastLine.parentElement;
			const labelText = g?.querySelector('text')?.textContent?.trim() || lastLine.getAttribute('x');

			if (labelText && /^\d{1,2}:\d{2}$/.test(labelText)) {
				const parts = labelText.split(':');
				const rawMinutes = parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
				const approxMinutes = xToMinutes(x1, ticks);
				const dayOffset = approxMinutes !== null
					? Math.round((approxMinutes - rawMinutes) / 1440) * 1440
					: 0;
				return { label: labelText, minutes: rawMinutes + dayOffset, source: 'refline' };
			}

			const minutes = xToMinutes(x1, ticks);
			if (minutes !== null) return { label: minutesToHHMM(minutes), minutes, source: 'refline' };
		}

		// 2. SVG path parsing
		const path = svg.querySelector('.recharts-area-curve') || svg.querySelector('.recharts-area-area');
		if (!path) return null;
		const d = path.getAttribute('d') || '';
		if (!d) return null;

		const points = [];
		const re = /[LM]([\d.]+),([\d.]+)/g;
		let m;
		while ((m = re.exec(d)) !== null) points.push({ x: parseFloat(m[1]), y: parseFloat(m[2]) });
		if (points.length < 2) return null;

		const maxY = Math.max(...points.map(p => p.y));
		const soldOutLevel = maxY - 5;
		let lastSelloutX = null;
		for (let i = 1; i < points.length; i++) {
			if (points[i].y >= soldOutLevel && points[i - 1].y < soldOutLevel) {
				const ratio = (soldOutLevel - points[i - 1].y) / (points[i].y - points[i - 1].y);
				lastSelloutX = points[i - 1].x + ratio * (points[i].x - points[i - 1].x);
			}
		}
		if (lastSelloutX === null) return null;

		const minutes = xToMinutes(lastSelloutX, ticks);
		if (minutes === null) return null;
		return { label: minutesToHHMM(minutes), minutes, source: 'svg' };
	}

	// ── Main panel processor ──────────────────────────────────────────────────

	function processPanel(panel) {
		if (panel.querySelector('[data-restock-predictor="accurate"]')) return;

		const h4 = [...panel.querySelectorAll('h4')].find(el =>
			el.textContent.includes('Stock Level - Last 24 Hours')
		);
		if (!h4) return;

		const chartBox = h4.closest('.rounded-lg.border');
		if (!chartBox) return;

		const svg = chartBox.querySelector('svg.recharts-surface');
		if (!svg) return;
		if (!svg.querySelector('.recharts-area-curve')?.getAttribute('d')) return;

		const delayLabel = [...panel.querySelectorAll('p')].find(p =>
			p.textContent.trim() === 'Restock Delay'
		);
		if (!delayLabel) return;

		const delayText = delayLabel.nextElementSibling?.textContent?.trim() || '';
		const delayMinutes = parseDelayToMinutes(delayText);
		if (!delayMinutes) return;

		const sellOutLabel = [...panel.querySelectorAll('p')].find(p =>
			p.textContent.trim() === 'Sell Out Time'
		);
		const sellOutText = sellOutLabel?.nextElementSibling?.textContent?.trim() || '';
		const sellOutMinutes = sellOutText ? parseDelayToMinutes(sellOutText) : null;

		const ticks = buildTimeTicks(svg);
		if (ticks.length < 2) return;

		const nowMinutes = ticks[ticks.length - 1].minutes;
		const estStatus = getEstRestockStatus(panel, ticks);
		const cacheKey = getPanelCacheKey(panel);
		const existingBanner = panel.querySelector('[data-restock-predictor]');

		let nextRestockMinutes = null;
		let lastSelloutStr = null;
		let accurate = false;

		// ── Priority 1: Est. Restock card shows specific time ────────────────
		if (estStatus.minutes !== null) {
			nextRestockMinutes = estStatus.minutes;
			lastSelloutStr = minutesToHHMM(nextRestockMinutes - delayMinutes);
			accurate = true;
			cacheRestockWallClock(cacheKey, nextRestockMinutes, nowMinutes);
		}

		// ── Priority 2: React fiber chart data (actual timestamps) ───────────
		// Checked before the cache because it reads the live chart on every
		// render — a stale cache from a prior restock/sellout cycle would
		// otherwise win just because it hasn't "expired" yet.
		if (!accurate) {
			const fiberInfo = getSelloutFromFiber(svg, ticks);
			if (fiberInfo) {
				nextRestockMinutes = fiberInfo.minutes + delayMinutes;
				lastSelloutStr = fiberInfo.label;
				accurate = true;
				cacheRestockWallClock(cacheKey, nextRestockMinutes, nowMinutes);
			}
		}

		// ── Priority 3: cached wall-clock from a prior accurate reading ──────
		// Fallback for when fiber data isn't parseable (e.g. chart not yet
		// mounted with data in the expected shape).
		if (!accurate) {
			const cached = getCachedRestockWallClock(cacheKey);
			if (cached !== null && cached > Date.now()) {
				const minsFromNow = (cached - Date.now()) / 60000;
				nextRestockMinutes = nowMinutes + minsFromNow;
				lastSelloutStr = minutesToHHMM(nextRestockMinutes - delayMinutes);
				accurate = true;
			}
		}

		// ── Priority 4: SVG path fallback ────────────────────────────────────
		if (!accurate) {
			const selloutInfo = findLastSelloutInfo(svg, ticks);
			if (!selloutInfo) return;
			nextRestockMinutes = selloutInfo.minutes + delayMinutes;
			lastSelloutStr = selloutInfo.label;

			if (existingBanner) return; // don't re-render same approximate data
		}

		existingBanner?.remove();

		const nextRestockStr = minutesToHHMM(nextRestockMinutes);

		const flightInfo = getFlightInfo(panel);
		let travelMinutes, travelLabel;
		if (flightInfo) {
			travelMinutes = flightInfo.mins;
			travelLabel = `${minutesToDuration(flightInfo.mins)} · ${flightInfo.city} · ${flightInfo.mode}`;
		} else {
			const travelTimeText = getTravelTimeText(panel);
			travelMinutes = travelTimeText ? parseDelayToMinutes(travelTimeText) : null;
			travelLabel = travelTimeText ? `${travelTimeText} (site)` : null;
		}
		// Only skip to a future cycle if departing right now would still miss
		// the stock window entirely (arriving after it has sold out again).
		// Arriving any time between restock and the next sell-out still gets
		// stock, even if that's after the restock instant itself.
		let targetRestockMinutes = nextRestockMinutes;
		let cyclesSkipped = 0;
		if (travelMinutes != null && sellOutMinutes != null) {
			const cyclePeriod = delayMinutes + sellOutMinutes;
			if (cyclePeriod > 0) {
				while ((targetRestockMinutes + sellOutMinutes - travelMinutes) < nowMinutes && cyclesSkipped < 50) {
					targetRestockMinutes += cyclePeriod;
					cyclesSkipped++;
				}
			}
		}

		const targetRestockStr = minutesToHHMM(targetRestockMinutes);
		const minsUntil = Math.round(targetRestockMinutes - nowMinutes);
		// "Depart by" is the ideal moment to arrive right as it restocks; if
		// that moment already passed (but stock hasn't sold out again), the
		// best you can do is leave now, so clamp to nowMinutes.
		const leaveByStr = travelMinutes != null
			? minutesToHHMM(Math.max(targetRestockMinutes - travelMinutes, nowMinutes))
			: null;

		function statusFor(mins) {
			if (mins > 5)    return `in ~${mins}m`;
			if (mins >= -60) return 'any moment';
			return `${Math.abs(mins)}m overdue`;
		}

		let bg, borderColor, color;
		if (minsUntil > 5) {
			bg = 'rgba(59,130,246,0.06)';
			borderColor = 'rgba(59,130,246,0.4)';
			color = 'var(--accent-primary, #3b82f6)';
		} else {
			bg = 'rgba(239,68,68,0.06)';
			borderColor = 'rgba(239,68,68,0.3)';
			color = 'rgb(239,68,68)';
		}

		const endOfStockMinutes = sellOutMinutes != null ? targetRestockMinutes + sellOutMinutes : null;
		const endOfStockStr = endOfStockMinutes != null ? minutesToHHMM(endOfStockMinutes) : null;
		const minsUntilEnd = endOfStockMinutes != null ? Math.round(endOfStockMinutes - nowMinutes) : null;

		// ── "Depart Now" — does flying right now land you with stock? ───────
		let flyNowSection = '';
		if (travelMinutes != null && sellOutMinutes != null) {
			const depletionLabelP = [...panel.querySelectorAll('p')].find(p => p.textContent.trim() === 'Depletion Rate');
			const rateHigh = parseFloat((depletionLabelP?.nextElementSibling?.textContent || '').match(/[\d.]+/)?.[0]);
			const medMatch = (depletionLabelP?.nextElementSibling?.nextElementSibling?.textContent || '').match(/Med:\s*([\d.]+)/i);
			const rateLow = medMatch ? parseFloat(medMatch[1]) : rateHigh;

			const restockQtyLabelP = [...panel.querySelectorAll('p')].find(p => p.textContent.trim() === 'Restock Qty');
			const maxStock = parseInt((restockQtyLabelP?.nextElementSibling?.textContent || '').replace(/[^\d]/g, ''), 10) || null;

			const emptyInLabelP = [...panel.querySelectorAll('p')].find(p => p.textContent.trim() === 'Est. Empty In');
			const emptyInText = emptyInLabelP?.nextElementSibling?.textContent?.trim() || '';
			const estEmptyMinutes = emptyInText && emptyInText !== 'Any moment' ? parseDelayToMinutes(emptyInText) : null;

			if (maxStock && !isNaN(rateHigh)) {
				const cyclePeriod = delayMinutes + sellOutMinutes;
				let windowRestockMinutes = nextRestockMinutes; // R0: last-known restock event, may be past (stock live) or future (still waiting)
				let windowEmptyMinutes = (windowRestockMinutes <= nowMinutes && estEmptyMinutes != null)
					? nowMinutes + estEmptyMinutes
					: windowRestockMinutes + sellOutMinutes;

				const arrivalMinutes = nowMinutes + travelMinutes;
				let flyCycles = 0;
				while (arrivalMinutes >= windowEmptyMinutes && cyclePeriod > 0 && flyCycles < 50) {
					windowRestockMinutes += cyclePeriod;
					windowEmptyMinutes = windowRestockMinutes + sellOutMinutes;
					flyCycles++;
				}

				const arrivalStr = minutesToHHMM(arrivalMinutes);
				const arrivesWithStock = arrivalMinutes >= windowRestockMinutes && arrivalMinutes < windowEmptyMinutes;

				if (arrivesWithStock) {
					const elapsed = Math.max(0, arrivalMinutes - windowRestockMinutes);
					const remA = Math.max(0, Math.round(maxStock - rateHigh * elapsed));
					const remB = Math.max(0, Math.round(maxStock - rateLow * elapsed));
					const remUpper = Math.max(remA, remB);
					const remLower = Math.min(remA, remB);
					const soldOutStr = minutesToHHMM(windowEmptyMinutes);
					const minsUntilSoldOut = Math.round(windowEmptyMinutes - nowMinutes);

					flyNowSection = `
					<p style="font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;color:var(--text-secondary);margin:0 0 2px 0;">Depart Now</p>
					<p style="font-size:13px;font-weight:700;color:${color};margin:0;">
						Arrive ${arrivalStr} local
					</p>
					<p style="font-size:11px;font-weight:600;color:var(--text-secondary);margin:4px 0 1px 0;">
						Est. stock left: <span style="color:${color}">${remUpper.toLocaleString()}–${remLower.toLocaleString()}</span>
					</p>
					<p style="font-size:9px;color:var(--text-secondary);margin:2px 0 0 0;">Sold out at ${soldOutStr} (${statusFor(minsUntilSoldOut)})</p>`;
				} else {
					flyNowSection = `
					<p style="font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;color:var(--text-secondary);margin:0 0 2px 0;">Depart At:</p>
					<p style="font-size:13px;font-weight:700;color:${color};margin:0;">
						${leaveByStr ? `${leaveByStr} local` : 'N/A'}
					</p>
					<p style="font-size:9px;color:rgb(239,68,68);margin:4px 0 1px 0;">Flying now arrives ${arrivalStr} — sold out on arrival</p>
					<p style="font-size:9px;color:var(--text-secondary);margin:2px 0 0 0;">Next stock at ${targetRestockStr}</p>`;
				}
			}
		}

		const statsGrid = panel.querySelector('.grid');
		if (!statsGrid) return;

		const banner = document.createElement('div');
		banner.className = 'rounded-lg border p-2 sm:p-3';
		banner.setAttribute('data-restock-predictor', accurate ? 'accurate' : 'estimate');
		banner.style.cssText = `background:${bg};border-color:${borderColor};margin-top:8px;`;
		banner.innerHTML = `
			<div style="display:flex;align-items:flex-start;gap:8px;">
				<svg style="width:16px;height:16px;flex-shrink:0;margin-top:2px;color:${color}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
				</svg>
				<div style="display:flex;gap:0;flex:1;min-width:0;">
					<div style="flex:1;min-width:0;">
						<p style="font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;color:var(--text-secondary);margin:0 0 2px 0;">Predicted Restock</p>
						<p style="font-size:13px;font-weight:700;color:${color};margin:0;">
							${targetRestockStr} local &nbsp;<span style="font-size:11px;font-weight:400;color:var(--text-secondary);">(${statusFor(minsUntil)}${cyclesSkipped > 0 ? ` · +${cyclesSkipped} cycle${cyclesSkipped > 1 ? 's' : ''}` : ''})</span>
						</p>
						${leaveByStr ? `
						<p style="font-size:11px;font-weight:600;color:var(--text-secondary);margin:4px 0 1px 0;">
							Depart by: <span style="color:${color}">${leaveByStr} local</span>
							<span style="font-size:9px;font-weight:400;opacity:0.65;"> — ${travelLabel}</span>
						</p>` : ''}
						<p style="font-size:9px;color:var(--text-secondary);margin:2px 0 0 0;">Sold out at ${lastSelloutStr} + ${delayText} restock delay${cyclesSkipped > 0 ? ` · travel exceeds window, targeting cycle +${cyclesSkipped}` : ''}</p>
					</div>
					${endOfStockStr ? `
					<div style="width:1px;background:var(--border-color,rgba(128,128,128,0.25));margin:0 12px;align-self:stretch;flex-shrink:0;"></div>
					<div style="flex:1;min-width:0;">
						<p style="font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;color:var(--text-secondary);margin:0 0 2px 0;">Est. End of Stock</p>
						<p style="font-size:13px;font-weight:700;color:${color};margin:0;">
							${endOfStockStr} local &nbsp;<span style="font-size:11px;font-weight:400;color:var(--text-secondary);">(${statusFor(minsUntilEnd)})</span>
						</p>
						<p style="font-size:9px;color:var(--text-secondary);margin:2px 0 0 0;">${targetRestockStr} + ${sellOutText} sell out time</p>
					</div>` : ''}
					${flyNowSection ? `
					<div style="width:1px;background:var(--border-color,rgba(128,128,128,0.25));margin:0 12px;align-self:stretch;flex-shrink:0;"></div>
					<div style="flex:1;min-width:0;">
						${flyNowSection}
					</div>` : ''}
				</div>
			</div>`;

		statsGrid.insertAdjacentElement('afterend', banner);
	}

	let debounce;
	function scheduleCheck() {
		clearTimeout(debounce);
		debounce = setTimeout(() => {
			document.querySelectorAll('h4').forEach(h4 => {
				if (!h4.textContent.includes('Stock Level - Last 24 Hours')) return;
				const chartBox = h4.closest('.rounded-lg.border');
				if (!chartBox) return;
				const panel = chartBox.parentElement;
				if (panel) processPanel(panel);
			});
		}, 400);
	}

	new MutationObserver(scheduleCheck).observe(document.body, {
		childList: true,
		subtree: true,
	});

	scheduleCheck();
})();
