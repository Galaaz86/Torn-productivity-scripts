// ==UserScript==
// @name         Torn Pickpocketing Coloring
// @version      1.1.0
// @namespace    https://www.torn.com/
// @description  Color codes crimes based on difficulty
// @icon         https://www.google.com/s2/favicons?sz=64&domain=torn.com
// @author       Galaaz86 [4178341]
// @license      MIT License
// @match        https://www.torn.com/page.php?sid=crimes*
// @grant        none
// ==/UserScript==

(function() {
	'use strict';

	// Objective text color — always shows the category's inherent danger level
	const categoryColorMap = {
		"Safe":              "#37b24d",
		"Moderately Unsafe": "#74b816",
		"Unsafe":            "#f59f00",
		"Risky":             "#f76707",
		"Dangerous":         "#f03e3e",
		"Very Dangerous":    "#7048e8",
	};

	// Border color tiers — shows how risky each category is FOR YOU based on your skill
	const tierMaps = [
		{ "Safe":"#37b24d","Moderately Unsafe":"#f76707","Unsafe":"#f03e3e","Risky":"#f03e3e","Dangerous":"#f03e3e","Very Dangerous":"#7048e8" }, // skill < 10
		{ "Safe":"#37b24d","Moderately Unsafe":"#37b24d","Unsafe":"#f76707","Risky":"#f03e3e","Dangerous":"#f03e3e","Very Dangerous":"#7048e8" }, // skill < 35
		{ "Safe":"#37b24d","Moderately Unsafe":"#37b24d","Unsafe":"#37b24d","Risky":"#f76707","Dangerous":"#f03e3e","Very Dangerous":"#7048e8" }, // skill < 65
		{ "Safe":"#37b24d","Moderately Unsafe":"#37b24d","Unsafe":"#37b24d","Risky":"#37b24d","Dangerous":"#f76707","Very Dangerous":"#7048e8" }, // skill < 80
		{ "Safe":"#37b24d","Moderately Unsafe":"#37b24d","Unsafe":"#37b24d","Risky":"#37b24d","Dangerous":"#37b24d","Very Dangerous":"#7048e8" }, // skill >= 80
	];

	const markGroups = {
		"Safe":              ["Drunk man", "Drunk woman", "Homeless person", "Junkie", "Elderly man", "Elderly woman"],
		"Moderately Unsafe": ["Classy lady", "Laborer", "Postal worker", "Young man", "Young woman", "Student"],
		"Unsafe":            ["Rich kid", "Sex worker", "Thug"],
		"Risky":             ["Jogger", "Businessman", "Businesswoman", "Gang member", "Mobster"],
		"Dangerous":         ["Cyclist"],
		"Very Dangerous":    ["Police officer"],
	};

	function getSideColorMap() {
		const el = document.querySelector('[class*="value___"][class*="copyTrigger___"]');
		const skill = el ? parseFloat(el.textContent) || 0 : 0;
		if (skill < 10) return tierMaps[0];
		if (skill < 35) return tierMaps[1];
		if (skill < 65) return tierMaps[2];
		if (skill < 80) return tierMaps[3];
		return tierMaps[4];
	}

	function updateDivColors() {
		if (!window.location.href.includes("pickpocketing")) return;

		const sideColorMap = getSideColorMap();
		const divElements = document.querySelectorAll('[class*="titleAndProps___"]:not(.processed)');

		divElements.forEach(divElement => {
			const titleDiv = divElement.querySelector('div');
			if (!titleDiv) return;
			const divContent = titleDiv.textContent.trim();
			const additionalData = divElement.querySelector('[class*="physicalPropsButton___"]');
			if (!additionalData) return;

			const text = divContent + ' ' + additionalData.textContent.trim();

			for (const category in markGroups) {
				if (markGroups[category].some(group => text.includes(group))) {
					titleDiv.style.color = categoryColorMap[category];
					if (window.innerWidth > 386) {
						titleDiv.textContent = `${divContent} (${category})`;
					}
					divElement.classList.add('processed');

					const parentElement = divElement.parentElement?.parentElement?.parentElement;
					if (parentElement && !parentElement.classList.contains('processed')) {
						parentElement.style.borderLeft = `3px solid ${sideColorMap[category]}`;
						parentElement.classList.add('processed');
					}
					break;
				}
			}
		});
	}

	let scheduled = false;
	function schedule() {
		if (scheduled) return;
		scheduled = true;
		requestAnimationFrame(() => { scheduled = false; updateDivColors(); });
	}

	const observer = new MutationObserver(schedule);
	observer.observe(document.body, { childList: true, subtree: true });
	updateDivColors();
})();
