// ==UserScript==
// @name         Torn Travel Stock Restock Watcher
// @namespace    https://www.torn.com/
// @version      1.0.0
// @description  Watch travel-shop items and flash and sound an alert when their stock returns
// @author       Galaaz86 [4178341]
// @license      MIT License
// @match        https://www.torn.com/page.php?sid=travel*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
	'use strict';

	if (window.__TORN_TRAVEL_STOCK_WATCHER_RUNNING__) return;
	window.__TORN_TRAVEL_STOCK_WATCHER_RUNNING__ = true;

	const STORAGE_KEY = 'TORN_TRAVEL_STOCK_WATCHER_ITEMS';
	const stockByItem = new Map();
	const watchedItems = loadWatchedItems();
	let audioContext = null;

	function prepareAudio() {
		if (audioContext || !window.AudioContext) return;
		try {
			audioContext = new AudioContext();
			if (audioContext.state === 'suspended') {
				audioContext.resume().catch(error => {
					console.error('[Travel Stock Watcher] Could not enable alert sound.', error);
				});
			}
		} catch (error) {
			console.error('[Travel Stock Watcher] Could not initialize alert sound.', error);
		}
	}

	function loadWatchedItems() {
		try {
			const stored = localStorage.getItem(STORAGE_KEY);
			const items = stored ? JSON.parse(stored) : [];
			if (!Array.isArray(items) || !items.every(item => typeof item === 'string')) {
				throw new TypeError('Stored watched items must be an array of strings.');
			}
			return new Set(items);
		} catch (error) {
			console.error('[Travel Stock Watcher] Could not load watched items.', error);
			return new Set();
		}
	}

	function saveWatchedItems() {
		try {
			localStorage.setItem(STORAGE_KEY, JSON.stringify([...watchedItems]));
		} catch (error) {
			console.error('[Travel Stock Watcher] Could not save watched items.', error);
		}
	}

	function addStyles() {
		const style = document.createElement('style');
		style.textContent = `
			.torn-stock-watch-control {
				display: inline-flex;
				align-items: center;
				gap: 3px;
				margin-left: 8px;
				font-size: 11px;
				white-space: nowrap;
				cursor: pointer;
			}
			.torn-stock-watch-flash {
				position: fixed;
				inset: 0;
				z-index: 2147483647;
				background: rgba(255, 0, 0, .55);
				opacity: 0;
				pointer-events: none !important;
				animation: torn-stock-watch-pulse 1.2s ease-in-out;
			}
			@keyframes torn-stock-watch-pulse {
				0%, 100% { opacity: 0; }
				10%, 30% { opacity: 1; }
				20%, 40% { opacity: 0; }
			}
		`;
		document.head.appendChild(style);
	}

	function getItemKey(row, name) {
		const form = row.querySelector('form[id^="item-"][id$="-form"]');
		return form ? form.id.slice(0, -5) : name.trim().toLowerCase();
	}

	function readStock(stockCell) {
		const match = stockCell.textContent.trim().match(/([\d,]+)\s*$/);
		return match ? Number(match[1].replace(/,/g, '')) : null;
	}

	function ensureWatchControl(nameCell, itemKey, itemName) {
		let control = nameCell.querySelector('.torn-stock-watch-control');
		if (control) return;

		control = document.createElement('label');
		control.className = 'torn-stock-watch-control';
		control.title = `Watch ${itemName} stock`;

		const checkbox = document.createElement('input');
		checkbox.type = 'checkbox';
		checkbox.checked = watchedItems.has(itemKey);
		checkbox.setAttribute('aria-label', `Watch ${itemName} stock`);
		checkbox.addEventListener('change', () => {
			prepareAudio();
			if (checkbox.checked) {
				watchedItems.add(itemKey);
			} else {
				watchedItems.delete(itemKey);
			}
			saveWatchedItems();
		});

		const labelText = document.createElement('span');
		labelText.textContent = 'Watch';
		control.append(checkbox, labelText);
		nameCell.appendChild(control);
	}

	function playBeep(startTime) {
		const oscillator = audioContext.createOscillator();
		const filter = audioContext.createBiquadFilter();
		const gain = audioContext.createGain();
		const duration = 0.28;

		oscillator.type = 'sawtooth';
		oscillator.frequency.setValueAtTime(480, startTime);
		oscillator.frequency.exponentialRampToValueAtTime(170, startTime + duration);
		filter.type = 'bandpass';
		filter.frequency.setValueAtTime(1100, startTime);
		filter.frequency.exponentialRampToValueAtTime(600, startTime + duration);
		filter.Q.setValueAtTime(1.4, startTime);
		gain.gain.setValueAtTime(0.0001, startTime);
		gain.gain.exponentialRampToValueAtTime(0.3, startTime + 0.015);
		gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
		oscillator.connect(filter);
		filter.connect(gain);
		gain.connect(audioContext.destination);
		oscillator.start(startTime);
		oscillator.stop(startTime + duration);
	}

	function playAlertSound() {
		if (!audioContext) return;
		try {
			const now = audioContext.currentTime;
			const gap = 0.35;
			playBeep(now);
			playBeep(now + gap);
			playBeep(now + gap * 2);
		} catch (error) {
			console.error('[Travel Stock Watcher] Could not play alert sound.', error);
		}
	}

	function flashPage() {
		let flash = document.querySelector('.torn-stock-watch-flash');
		if (!flash) {
			flash = document.createElement('div');
			flash.className = 'torn-stock-watch-flash';
			document.body.appendChild(flash);
		}
		flash.classList.remove('torn-stock-watch-flash');
		void flash.offsetWidth;
		flash.classList.add('torn-stock-watch-flash');
	}

	function scanRows() {
		document.querySelectorAll('[data-tt-content-type="stock"]').forEach(stockCell => {
			const row = stockCell.closest('li');
			const nameCell = row?.querySelector('[data-tt-content-type="name"]');
			const nameButton = nameCell?.querySelector('button');
			if (!row || !nameCell || !nameButton) return;

			const itemName = nameButton.textContent.trim();
			const itemKey = getItemKey(row, itemName);
			const stock = readStock(stockCell);
			if (!itemName || stock === null) return;

			ensureWatchControl(nameCell, itemKey, itemName);

			const previousStock = stockByItem.get(itemKey);
			if (previousStock === 0 && stock > 0 && watchedItems.has(itemKey)) {
				flashPage();
				playAlertSound();
			}
			stockByItem.set(itemKey, stock);
		});
	}

	addStyles();
	document.addEventListener('pointerdown', prepareAudio, { once: true, capture: true });
	scanRows();
	new MutationObserver(scanRows).observe(document.body, {
		childList: true,
		subtree: true,
		characterData: true,
	});
})();
