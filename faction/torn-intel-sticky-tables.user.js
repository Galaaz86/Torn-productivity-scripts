// ==UserScript==
// @name         Torn Intel - Sticky Tables
// @namespace    https://www.torn.com/
// @version      1.0.0
// @description  Makes Torn Intel tables page-wide and screen-high with their own scrollbars, freezing the header row and the first (name) column
// @author       Galaaz86 [4178341]
// @license      MIT License
// @match        https://torn-intel.com/*
// @grant        none
// @run-at       document-start
// ==/UserScript==

(function () {
	'use strict';

	// Hide the right-hand ad column so tables can use the full page width.
	const HIDE_SIDE_COLUMN = true;

	// Space kept free below the table so its horizontal scrollbar stays on screen.
	const BOTTOM_GAP_PX = 16;

	// Only table wrappers that directly hold a table are touched (Tailwind's .overflow-x-auto).
	const WRAP = 'div.overflow-x-auto:has(> table)';

	const css = `
		/* The wrapper becomes the scroll box: wide as the card, at most as tall as the viewport. */
		${WRAP} {
			overflow: auto !important;
			max-height: calc(100dvh - var(--anchor-height, 0px) - ${BOTTOM_GAP_PX}px);
		}

		/* Less card padding around the table = more room for columns. */
		div.p-6:has(> ${WRAP}) {
			padding: 0.5rem !important;
		}

		/* Sticky cells lose their borders with border-collapse, so draw borders on the cells instead of the rows. */
		${WRAP} > table {
			border-collapse: separate !important;
			border-spacing: 0;
		}
		${WRAP} > table > thead > tr,
		${WRAP} > table > tbody > tr {
			border-bottom-width: 0 !important;
		}
		${WRAP} > table > thead > tr > th {
			border-bottom: 1px solid var(--border);
		}
		${WRAP} > table > tbody > tr > td:not([colspan]) {
			border-bottom: 1px solid var(--border);
		}

		/* Frozen header row. */
		${WRAP} > table > thead > tr > th {
			position: sticky;
			top: 0;
			z-index: 3;
			background: var(--bg-card, #141823);
		}

		/* Frozen first column (spacer rows with colspan are left alone). */
		${WRAP} > table > tbody > tr > td:first-child:not([colspan]) {
			position: sticky;
			left: 0;
			z-index: 2;
			white-space: nowrap;
			background: var(--bg-card, #141823);
			box-shadow: inset -1px 0 0 var(--border);
		}

		/* Top-left corner sits above both frozen axes. */
		${WRAP} > table > thead > tr > th:first-child {
			left: 0;
			z-index: 4;
			box-shadow: inset -1px 0 0 var(--border);
		}

		/* Keep the row hover highlight on the frozen cell (layered over the opaque card colour). */
		${WRAP} > table > tbody > tr:hover > td:first-child:not([colspan]) {
			background: linear-gradient(var(--bg-secondary), var(--bg-secondary)), var(--bg-card, #141823);
		}

		${HIDE_SIDE_COLUMN ? `main aside:has(#site-side-column-wide) { display: none !important; }` : ''}
	`;

	const style = document.createElement('style');
	style.id = 'ti-sticky-tables';
	style.textContent = css;

	function inject() {
		if (document.getElementById(style.id)) return;
		(document.head || document.documentElement).appendChild(style);
	}

	inject();
	// Next.js can replace <head> contents on hydration/navigation; re-add the style if it disappears.
	new MutationObserver(inject).observe(document.documentElement, { childList: true, subtree: true });
})();
