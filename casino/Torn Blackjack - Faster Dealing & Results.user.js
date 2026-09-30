// ==UserScript==
// @name         Torn Blackjack - Faster Dealing & Results
// @namespace    torn-blackjack-speed
// @version      1.0.1
// @license      MIT License
// @description  Speeds up Blackjack's visual dealing/result animations only.
// @match        https://www.torn.com/page.php?sid=blackjack*
// @match        https://torn.com/page.php?sid=blackjack*
// @run-at       document-start
// @grant        none
// ==/UserScript==

(() => {
    'use strict';

    if (window.__tornBlackjackSpeedInstalled) {
        return;
    }

    window.__tornBlackjackSpeedInstalled = true;

    const originalSetTimeout = window.setTimeout;

    window.setTimeout = function (callback, delay, ...args) {

        let newDelay = delay;

        // Only inspect callbacks with the exact delays we care about
        if (typeof callback === 'function' && (delay === 300 || delay === 400)) {

            const source = Function.prototype.toString.call(callback);

            // Blackjack: delay between individual cards being dealt
            if (
                delay === 300 &&
                source.includes('addClass("inplace")') &&
                source.includes('animateCard(index)')
            ) {
                newDelay = 75;

                console.log(
                    '[Torn Blackjack] Deal delay: 300ms → 75ms'
                );
            }

            // Blackjack: delay before displaying the score/result
            if (
                delay === 400 &&
                source.includes('setScore(who)') &&
                source.includes('dfd.resolve')
            ) {
                newDelay = 100;

                console.log(
                    '[Torn Blackjack] Result delay: 400ms → 100ms'
                );
            }
        }

        return originalSetTimeout.call(
            this,
            callback,
            newDelay,
            ...args
        );
    };

    console.log('[Torn Blackjack] Speed script loaded.');
})();
