// ==UserScript==
// @name         TornW3B Travel Stock - Restock Predictor
// @namespace    https://weav3r.dev/
// @version      1.0.0
// @description  Adds predicted restock time based on last sell-out + restock delay from the stock chart
// @author       Galaaz86 [4178341]
// @license      MIT License
// @match        https://weav3r.dev/travel-stock*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  const processed = new WeakSet();

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

      // A large backwards jump in raw time means we crossed midnight
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
  // Returns e.g. "1h 51m" or null if not found.
  function getTravelTimeText(panel) {
    const p = [...panel.querySelectorAll('p')].find(el =>
      el.textContent.includes('Based on') && el.textContent.includes('travel time')
    );
    if (!p) return null;
    const match = p.textContent.match(/Based on (.+?) travel time/);
    return match ? match[1].trim() : null;
  }

  // Parse the recharts area-curve path and find the last x where stock
  // transitioned from in-stock to sold-out (y rose above the zero-stock baseline).
  function findLastSelloutX(svg) {
    const path =
      svg.querySelector('.recharts-area-curve') ||
      svg.querySelector('.recharts-area-area');
    if (!path) return null;

    const d = path.getAttribute('d') || '';
    if (!d) return null;

    // Extract every (x, y) pair from M and L commands
    const points = [];
    const re = /[LM]([\d.]+),([\d.]+)/g;
    let match;
    while ((match = re.exec(d)) !== null) {
      points.push({ x: parseFloat(match[1]), y: parseFloat(match[2]) });
    }
    if (points.length < 2) return null;

    // The maximum y value in the path = the "zero stock" baseline (e.g. y=170)
    const maxY = Math.max(...points.map(p => p.y));
    // Threshold just below maxY — everything above this is "at zero stock"
    const soldOutLevel = maxY - 0.2;

    let lastSelloutX = null;
    for (let i = 1; i < points.length; i++) {
      // Transition: previous point had stock, current point has no stock
      if (points[i].y > soldOutLevel && points[i - 1].y <= soldOutLevel) {
        lastSelloutX = points[i].x;
      }
    }
    return lastSelloutX;
  }

  function processPanel(panel) {
    if (processed.has(panel)) return;

    // The stock chart section is identified by its heading
    const h4 = [...panel.querySelectorAll('h4')].find(el =>
      el.textContent.includes('Stock Level - Last 24 Hours')
    );
    if (!h4) return;

    const chartBox = h4.closest('.rounded-lg.border');
    if (!chartBox) return;

    const svg = chartBox.querySelector('svg.recharts-surface');
    if (!svg) return;

    // Wait until Recharts has rendered the path data
    if (!svg.querySelector('.recharts-area-curve')?.getAttribute('d')) return;

    // Restock Delay card: find the label <p>, value is in the next sibling <p>
    const delayLabel = [...panel.querySelectorAll('p')].find(p =>
      p.textContent.trim() === 'Restock Delay'
    );
    if (!delayLabel) return;

    const delayText = delayLabel.nextElementSibling?.textContent?.trim() || '';
    const delayMinutes = parseDelayToMinutes(delayText);
    if (!delayMinutes) return;

    const ticks = buildTimeTicks(svg);
    if (ticks.length < 2) return;

    const lastSelloutX = findLastSelloutX(svg);
    if (lastSelloutX === null) return;

    const lastSelloutMinutes = xToMinutes(lastSelloutX, ticks);
    if (lastSelloutMinutes === null) return;

    const nextRestockMinutes = lastSelloutMinutes + delayMinutes;
    const nextRestockStr = minutesToHHMM(nextRestockMinutes);
    const lastSelloutStr = minutesToHHMM(lastSelloutMinutes);

    // Travel time from the "Stock on Arrival Estimate" card
    const travelTimeText = getTravelTimeText(panel);
    const travelMinutes = travelTimeText ? parseDelayToMinutes(travelTimeText) : null;
    const leaveByStr = travelMinutes
      ? minutesToHHMM(nextRestockMinutes - travelMinutes)
      : null;

    // The rightmost tick approximates the current time shown in the chart
    const nowMinutes = ticks[ticks.length - 1].minutes;
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
    banner.setAttribute('data-restock-predictor', '1');
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
    processed.add(panel);
  }

  let debounce;
  function scheduleCheck() {
    clearTimeout(debounce);
    debounce = setTimeout(() => {
      document.querySelectorAll('h4').forEach(h4 => {
        if (!h4.textContent.includes('Stock Level - Last 24 Hours')) return;
        const chartBox = h4.closest('.rounded-lg.border');
        if (!chartBox) return;
        // The panel (space-y-3 div) is the direct parent of each chart section box
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
