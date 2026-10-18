// ==UserScript==
// @name         Torn Gym Stat Percentages
// @namespace    https://www.torn.com/
// @version      1.0.1
// @description  Shows each gym stat's share below its title and value
// @author       Galaaz86 [4178341]
// @license      MIT License
// @match        https://www.torn.com/gym.php*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
	'use strict';

	const STAT_NAMES = ['Strength', 'Defense', 'Speed', 'Dexterity'];

	const style = document.createElement('style');
	style.textContent = `
		.torn-gym-stat-share {
			display: block;
			width: 100%;
			box-sizing: border-box;
			margin-top: 2px;
			text-align: center;
			font-size: 11px;
			line-height: 1.2;
			font-weight: normal;
			opacity: 0.7;
		}
	`;
	(document.head || document.documentElement).appendChild(style);

	function updatePercentages() {
		const stats = new Map();

		document.querySelectorAll('ul[class*="properties___"] > li').forEach(item => {
			const heading = item.querySelector('h3[class*="title___"]');
			const value = item.querySelector('[class*="propertyValue___"]');
			const titleRow = heading?.parentElement;
			const name = heading?.textContent?.replace(/\s*\(\d+%\)\s*$/, '').trim();
			if (!heading || !value || !titleRow || !name || !STAT_NAMES.includes(name)) return;

			const rawValue = value.textContent?.trim().replace(/,/g, '');
			if (!rawValue || !/^\d+$/.test(rawValue)) return;

			if (heading.textContent !== name) heading.textContent = name;
			stats.set(name, { titleRow, value: Number(rawValue) });
		});

		if (stats.size !== STAT_NAMES.length) return;

		const total = [...stats.values()].reduce((sum, stat) => sum + stat.value, 0);
		if (total === 0) return;

		stats.forEach((stat, name) => {
			const percentage = Math.round((stat.value / total) * 100);
			let share = stat.titleRow.nextElementSibling;
			if (!share?.classList.contains('torn-gym-stat-share')) {
				share = document.createElement('div');
				share.className = 'torn-gym-stat-share';
				stat.titleRow.after(share);
			}
			const text = `${percentage}% of total`;
			if (share.textContent !== text) share.textContent = text;
		});
	}

	const observer = new MutationObserver(updatePercentages);
	observer.observe(document.documentElement, {
		childList: true,
		characterData: true,
		subtree: true,
	});
	updatePercentages();
})();
