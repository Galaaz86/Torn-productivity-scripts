# Torn shop resale tracker

This userscript adds a live resale dashboard to the TornW3B Travel Stock page. It reads the page's same-origin travel-stock API, so it does not depend on a copied snapshot or a local server.

## Install

1. Install a userscript manager such as Tampermonkey in your browser.
2. Open `torn-shop-resale-tracker.user.js` and copy its contents.
3. Create a new userscript in Tampermonkey, replace its template with the copied code, and save.
4. Open or refresh <https://weav3r.dev/travel-stock>.
5. Click **Shop resale**. The dashboard fetches a current snapshot when opened; click **Refresh data** any time to update it.

## What it calculates

- **Market → shop:** market price as the buy cost, compared with the destination shop's resale price.
- **Shop → shop:** buy in one country and resell at another country's shop. Only routes with stock available to buy are included.
- Resale uses 75% of shop price, except items categorized as **Other**, which use 100%. Proceeds are rounded down to whole dollars.
- The route's potential gross is limited by the source shop stock shown in the snapshot.

Calculations are per item and exclude airfare, travel time, market fees, and other costs. Prices and stock can change; confirm them in Torn before buying. This userscript relies on TornW3B's public travel-stock API and may need an update if that service changes.
