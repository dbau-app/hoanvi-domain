# HoànVí

Frontend published by GitHub Pages, with the existing Google Apps Script + Google Sheets application as the backend/data store.

## Architecture

- Frontend URL: GitHub Pages
- Backend: Google Apps Script Web App
- Data: Google Sheets (`Users`, `Links`, `Withdrawals`, `Transactions`)
- Affiliate processing: handled by the existing Apps Script backend

## GitHub Pages

Repository: `dbau-app/hoanvi-domain`

Enable Pages in **Settings → Pages → Build and deployment → Deploy from a branch**, then choose `main` and `/`.

## Custom domain later

When the final domain is available, configure it under **Settings → Pages → Custom domain**. For an apex domain GitHub Pages uses A/ALIAS/ANAME records; for a subdomain it uses a CNAME record.

## Important

The current GitHub entry point intentionally embeds the already-deployed Apps Script application. This keeps the existing authentication, affiliate-link processing, email verification, wallet, withdrawals and admin functions working without exposing Google Sheets credentials in the browser.

The original frontend currently calls the Apps Script runtime through `google.script.run`. Moving all HTML/CSS/JS itself to GitHub Pages therefore requires a cross-origin API bridge rather than simply copying the HTML file.
