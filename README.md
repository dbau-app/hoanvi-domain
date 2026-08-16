# HoànVí

Frontend published by GitHub Pages, with the existing Google Apps Script + Google Sheets application as the backend/data store.

## Architecture

- Frontend/domain entry point: GitHub Pages
- Backend: Google Apps Script Web App
- Data: Google Sheets (`Users`, `Links`, `Withdrawals`, `Transactions`)
- Affiliate processing: handled by the existing Apps Script backend
- Product metadata: Shopee product name + image are stored in `Links.ProductName` and `Links.ProductImage`

## Repository

Repository: `dbau-app/hoanvi-domain`

### GitHub Pages entry point

The root `index.html` remains the GitHub Pages/domain wrapper and embeds the deployed Apps Script Web App. This is intentional: the Apps Script frontend uses `google.script.run`, so the Apps Script Web App remains the runtime for authentication, affiliate processing, Google Sheets access, email verification, wallet, withdrawals and admin functions.

### Apps Script source

The current Apps Script source is stored under `appscript/`:

- `Code01.gs` → `Code07.gs` — complete backend source, split into Apps Script files so the project can be copied into Apps Script without exposing Google Sheets credentials.
- `Index.html` — Apps Script HTML entry point.
- `Styles.html` — frontend CSS.
- `App.html` + `App01.html` → `App11.html` — frontend JavaScript split into Apps Script include files.

All `.gs` files are part of the same Apps Script project and share the same global scope.

## Deploy GitHub Pages

Enable Pages in **Settings → Pages → Build and deployment → Deploy from a branch**, then choose `main` and `/`.

## Custom domain later

When the final domain is available, configure it under **Settings → Pages → Custom domain**. For an apex domain GitHub Pages uses A/ALIAS/ANAME records; for a subdomain it uses a CNAME record.

## Product name and image

When a new Shopee link is converted, the Apps Script attempts to retrieve the product name and image through Shopee product metadata/API and HTML fallbacks. The values are stored in the `Links` sheet and shown on both the member page and the admin page.

For existing links, run `backfillProductMetadata()` once in Apps Script, or use the admin button **↻ Cập nhật tên & hình sản phẩm**.
