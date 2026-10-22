// ==UserScript==
// @name         Torn Gym Stat Percentages
// @namespace    https://www.torn.com/
// @version      1.1.0
// @description  Shows gym stat shares and recommends a training order for specialist gyms
// @author       Galaaz86 [4178341]
// @license      MIT License
// @match        https://www.torn.com/gym.php*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
	'use strict';

	const STAT_NAMES = ['Strength', 'Defense', 'Speed', 'Dexterity'];
	const TARGET_PERCENTAGES = {
		Strength: 28,
		Defense: 8,
		Speed: 28,
		Dexterity: 36,
	};
	const TRAINING_ORDER = ['Dexterity', 'Strength', 'Speed', 'Defense'];
	const GYM_ACCESS_BUFFER = 1.26;

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
		.torn-gym-stat-share.torn-gym-can-train {
			color: #4caf50;
			opacity: 1;
		}
		.torn-gym-stat-share.torn-gym-avoid {
			color: #ef5350;
			opacity: 1;
		}
		.torn-gym-stat-share.torn-gym-gym-risk {
			color: #fbc02d;
			opacity: 1;
			font-weight: 600;
		}
		.torn-gym-guidance {
			margin-top: 6px;
			font-size: 11px;
			line-height: 1.4;
			text-align: center;
			opacity: 0.75;
		}
	`;
	(document.head || document.documentElement).appendChild(style);

	function getGymRiskStats(stats) {
		const atRisk = new Map();
		const dexterity = stats.get('Dexterity').value;
		const highestOtherStat = Math.max(
			stats.get('Strength').value,
			stats.get('Defense').value,
			stats.get('Speed').value
		);
		const frontlineTotal = stats.get('Strength').value + stats.get('Speed').value;
		const otherTotal = stats.get('Defense').value + dexterity;

		if (dexterity < highestOtherStat * GYM_ACCESS_BUFFER) {
			atRisk.set('Dexterity', 'Elites access is close to its requirement');
		}
		if (frontlineTotal < otherTotal * GYM_ACCESS_BUFFER) {
			atRisk.set('Strength', 'Frontline Fitness access is close to its requirement');
			atRisk.set('Speed', 'Frontline Fitness access is close to its requirement');
		}

		return atRisk;
	}

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

		const gymRiskStats = getGymRiskStats(stats);
		const recommendedStat = TRAINING_ORDER.find(name => gymRiskStats.has(name))
			|| TRAINING_ORDER.find(name => stats.get(name).value / total * 100 <= TARGET_PERCENTAGES[name]);

		stats.forEach((stat, name) => {
			const percentage = Math.round((stat.value / total) * 100);
			let share = stat.titleRow.nextElementSibling;
			if (!share?.classList.contains('torn-gym-stat-share')) {
				share = document.createElement('div');
				share.className = 'torn-gym-stat-share';
				stat.titleRow.after(share);
			}

			const gymRisk = gymRiskStats.get(name);
			const isAtOrBelowTarget = stat.value / total * 100 <= TARGET_PERCENTAGES[name];
			const status = gymRisk
				? `${gymRisk} - train this stat`
				: name === recommendedStat
					? 'Recommended next'
					: isAtOrBelowTarget
						? 'Can train'
						: 'Above target - avoid';
			const text = `${percentage}% (target ${TARGET_PERCENTAGES[name]}%) | ${status}`;
			const colorClass = gymRisk
				? 'torn-gym-gym-risk'
				: isAtOrBelowTarget
					? 'torn-gym-can-train'
					: 'torn-gym-avoid';
			if (share.textContent !== text) share.textContent = text;
			share.classList.remove('torn-gym-can-train', 'torn-gym-avoid', 'torn-gym-gym-risk');
			share.classList.add(colorClass);
			share.title = gymRisk
				? `${gymRisk}. Yellow marks a stat that improves eligibility.`
				: `Suggested balance: Strength 28%, Defense 8%, Speed 28%, Dexterity 36%.`;
		});

		const statList = document.querySelector('ul[class*="properties___"]');
		if (statList && !statList.nextElementSibling?.classList.contains('torn-gym-guidance')) {
			const guidance = document.createElement('div');
			guidance.className = 'torn-gym-guidance';
			guidance.textContent = 'Green: can train | Red: avoid for this balance | Yellow: train to protect gym access. Recheck after each 150-400 energy session; gains vary, so a full-session forecast is not shown.';
			statList.after(guidance);
		}
	}

	const observer = new MutationObserver(updatePercentages);
	observer.observe(document.documentElement, {
		childList: true,
		characterData: true,
		subtree: true,
	});
	updatePercentages();
})();
