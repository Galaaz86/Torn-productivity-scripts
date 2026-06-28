// ==UserScript==
// @name         TornW3B Travel Stock - Restock Predictor
// @namespace    https://weav3r.dev/
// @version      1..0
// @description  Adds predicted restock time based on last sell-out + restock delay from the stock chart
// @author       Galaaz86 [4178341]
// @license      MIT License
// @match        https://weav3r.dev/travel-stock*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
	'use strict';

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

	function findSelloutInChartData(data) {
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

		// Last transition: stock > 0 → stock = 0
		let rawMins = null;
		for (let i = 1; i < data.length; i++) {
			if (data[i][stockKey] === 0 && data[i - 1][stockKey] > 0) {
				rawMins = rawMinutesFromValue(data[i][timeKey]);
			}
		}
		return rawMins;
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
				const rawMins = findSelloutInChartData(data);
				if (rawMins !== null) {
					const approxNow = ticks[ticks.length - 1].minutes;
					const dayOffset = Math.round((approxNow - rawMins) / 1440) * 1440;
					const minutes = rawMins + dayOffset;
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

		// ── Priority 2: cached wall-clock from a prior accurate reading ──────
		if (!accurate) {
			const cached = getCachedRestockWallClock(cacheKey);
			if (cached !== null && cached > Date.now()) {
				const minsFromNow = (cached - Date.now()) / 60000;
				nextRestockMinutes = nowMinutes + minsFromNow;
				lastSelloutStr = minutesToHHMM(nextRestockMinutes - delayMinutes);
				accurate = true;
			}
		}

		// ── Priority 3: React fiber chart data (actual timestamps) ───────────
		if (!accurate) {
			const fiberInfo = getSelloutFromFiber(svg, ticks);
			if (fiberInfo) {
				nextRestockMinutes = fiberInfo.minutes + delayMinutes;
				lastSelloutStr = fiberInfo.label;
				accurate = true;
				cacheRestockWallClock(cacheKey, nextRestockMinutes, nowMinutes);
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

		const travelTimeText = getTravelTimeText(panel);
		const travelMinutes = travelTimeText ? parseDelayToMinutes(travelTimeText) : null;
		const leaveByStr = travelMinutes
			? minutesToHHMM(nextRestockMinutes - travelMinutes)
			: null;

		const minsUntil = Math.round(nextRestockMinutes - nowMinutes);

		let statusText, bg, borderColor, color;
		if (minsUntil > 5) {
			statusText = `in ~${minsUntil}m`;
			bg = 'rgba(59,130,246,0.06)';
			borderColor = 'rgba(59,130,246,0.4)';
			color = 'var(--accent-primary, #3b82f6)';
		} else if (minsUntil >= -60) {
			statusText = 'due any moment';
			bg = 'rgba(239,68,68,0.06)';
			borderColor = 'rgba(239,68,68,0.3)';
			color = 'rgb(239,68,68)';
		} else {
			statusText = `${Math.abs(minsUntil)}m overdue`;
			bg = 'rgba(239,68,68,0.06)';
			borderColor = 'rgba(239,68,68,0.3)';
			color = 'rgb(239,68,68)';
		}

		const statsGrid = panel.querySelector('.grid');
		if (!statsGrid) return;

		const banner = document.createElement('div');
		banner.className = 'rounded-lg border p-2 sm:p-3';
		banner.setAttribute('data-restock-predictor', accurate ? 'accurate' : 'estimate');
		banner.style.cssText = `background:${bg};border-color:${borderColor};margin-top:8px;`;
		banner.innerHTML = `
			<div style="display:flex;align-items:center;gap:8px;">
				<svg style="width:16px;height:16px;flex-shrink:0;color:${color}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
				</svg>
				<div>
					<p style="font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;color:var(--text-secondary);margin:0 0 2px 0;">Predicted Restock</p>
					<p style="font-size:13px;font-weight:700;color:${color};margin:0;">
						${nextRestockStr} local &nbsp;<span style="font-size:11px;font-weight:400;color:var(--text-secondary);">(${statusText})</span>
					</p>
					${leaveByStr ? `
					<p style="font-size:11px;font-weight:600;color:var(--text-secondary);margin:4px 0 1px 0;">
						Depart by: <span style="color:${color}">${leaveByStr} local</span>
						<span style="font-size:9px;font-weight:400;opacity:0.65;"> — site travel time: ${travelTimeText}</span>
					</p>` : ''}
					<p style="font-size:9px;color:var(--text-secondary);margin:2px 0 0 0;">Sold out at ${lastSelloutStr} + ${delayText} restock delay</p>
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
