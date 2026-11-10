# ShelfPrice

An iPhone app (installable web app) for checking whether stock is worth buying, made for use inside Costco with no signal.

- **Calculate** – unit price, ad cost, shipping (default £0.60), platform fees. Sell price can be typed in £ or as a mark-up % on buy cost + shipping → profit per unit, margin, ROI, batch profit, break-even price and price for your target margin. Handles VAT-registered and non-registered.
- **List** – add products to a list stored on the phone. When you're back online, upload it to Google Sheets: every purchase is logged and stock quantities are updated.

## Install on iPhone

1. Open the app's web address in **Safari** (on Wi-Fi).
2. Tap **Share → Add to Home Screen**.
3. Open it once from the home screen while online.

It now works fully offline.

## Hosting

The `Deploy to GitHub Pages` workflow publishes the app. In the repo go to **Settings → Pages → Source: GitHub Actions** if it isn't already set. The address will be `https://<your-username>.github.io/shelfprice/`.

## Google Sheets

See `google-apps-script/Code.gs` and the steps in the app under **Settings → Google Sheets**. The script creates two tabs:

- **Purchases** – a row for every item you upload
- **Stock** – one row per product (matched by Costco item number, or name); stock quantity is increased by packs × units each time

Uploads are safe to retry; the same entry is never counted twice.

## How the numbers work (per unit)

```
unit cost   = pack price / units in pack      (ex VAT if VAT registered, else inc VAT)
profit      = sell − VAT on sale* − unit cost − (fee% × sell + fixed fee) − ad − shipping
margin      = profit / sell
ROI         = profit / unit cost
* only if VAT registered: sell × VAT/(100+VAT), i.e. 1/6 at 20%
```

In % mode: sell = (unit cost + shipping) × (1 + mark-up%).

Ad cost can be £ per unit or % of sell price (tap the £/% button).
