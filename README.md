# HoànVí

Frontend published by GitHub Pages, with the existing Google Apps Script + Google Sheets application as the backend/data store.

## Architecture

- Frontend URL: GitHub Pages
- Backend: Google Apps Script Web App
- Data: Google Sheets (`Users`, `Links`, `Withdrawals`, `Transactions`)
- Affiliate processing: handled by the existing Apps Script backend

The original backend already creates/uses the required Sheets and applies the commission calculation. fileciteturn1file0L11-L19

## GitHub Pages

Repository: `dbau-app/hoanvi-domain`

Enable Pages in **Settings → Pages → Build and deployment → Deploy from a branch**, then choose `main` and `/`. GitHub documents branch-based publishing for static sites. 

## Custom domain later

When the final domain is available, configure it under **Settings → Pages → Custom domain**. For an apex domain GitHub Pages uses A/ALIAS/ANAME records; for a subdomain it uses a CNAME record. 

## Important

The current GitHub entry point intentionally embeds the already-deployed Apps Script application. This keeps the existing authentication, affiliate-link processing, email verification, wallet, withdrawals and admin functions working without exposing Google Sheets credentials in the browser.

A later phase can move the HTML/CSS/JS itself to GitHub Pages and use a dedicated cross-origin API bridge to Apps Script. The existing frontend currently calls the Apps Script runtime through `google.script.run`, so that migration requires an API bridge rather than simply copying the HTML file. fileciteturn1file3L213-L238
