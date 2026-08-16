/* =========================================================
   SHOPEE PRODUCT METADATA
   Lấy tên + hình sản phẩm từ nhiều nguồn theo thứ tự:
   1) Shopee item API
   2) HTML OpenGraph / JSON-LD
   3) fallback product-data API cho short-link/URL khó đọc
   ========================================================= */

function decodeHtmlEntities(str) {
  str = String(str || '');
  var named = {
    '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"',
    '&#39;': "'", '&apos;': "'", '&nbsp;': ' '
  };
  Object.keys(named).forEach(function(k) { str = str.split(k).join(named[k]); });
  str = str.replace(/&#(\d+);/g, function(_, n) {
    try { return String.fromCharCode(parseInt(n, 10)); } catch (e) { return _; }
  });
  str = str.replace(/&#x([0-9a-f]+);/gi, function(_, n) {
    try { return String.fromCharCode(parseInt(n, 16)); } catch (e) { return _; }
  });
  return str;
}

function cleanProductName(name) {
  return decodeHtmlEntities(String(name || ''))
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\s*[|·-]\s*Shopee(?:\s+Việt Nam)?\s*$/i, '')
    .replace(/\s*-\s*Shopee\.vn\s*$/i, '')
    .trim();
}

function extractMetaContent(html, attr, value) {
  html = String(html || '');
  var escaped = String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  var q = "['\"]";

  var re1 = new RegExp(
    '<meta[^>]+(?:' + attr + ')=' + q + escaped + q +
    '[^>]+content=' + q + '([^' + "'\"" + ']+)' + q, 'i'
  );
  var m = html.match(re1);
  if (m) return decodeHtmlEntities(m[1]);

  var re2 = new RegExp(
    '<meta[^>]+content=' + q + '([^' + "'\"" + ']+)' + q +
    '[^>]+(?:' + attr + ')=' + q + escaped + q, 'i'
  );
  m = html.match(re2);
  return m ? decodeHtmlEntities(m[1]) : '';
}

function extractJsonLdProduct(html) {
  var out = { name: '', image: '' };
  var re = /<script[^>]+type=['\"]application\/ld\+json['\"][^>]*>([\s\S]*?)<\/script>/gi;
  var m;

  while ((m = re.exec(String(html || ''))) !== null) {
    try {
      var raw = m[1].replace(/^\s*<!--/, '').replace(/-->\s*$/, '').trim();
      var data = JSON.parse(raw);
      var items = Array.isArray(data) ? data.slice() : [data];

      for (var i = 0; i < items.length; i++) {
        var item = items[i];
        if (!item) continue;
        if (item['@graph'] && Array.isArray(item['@graph'])) {
          items = items.concat(item['@graph']);
        }

        var type = item['@type'];
        var isProduct = type === 'Product' ||
          (Array.isArray(type) && type.indexOf('Product') !== -1);
        if (!isProduct) continue;

        if (!out.name && item.name) out.name = cleanProductName(item.name);
        if (!out.image && item.image) {
          if (Array.isArray(item.image)) out.image = item.image[0] || '';
          else if (typeof item.image === 'string') out.image = item.image;
          else if (item.image.url) out.image = item.image.url;
        }
      }
    } catch (e) {}
  }
  return out;
}

function normalizeShopeeImage(image) {
  image = decodeHtmlEntities(String(image || '').trim());
  if (!image) return '';
  image = image.replace(/\\\//g, '/');
  if (/^https?:\/\//i.test(image)) return image;

  // Shopee thường trả image id thay vì full URL.
  if (/^[A-Za-z0-9_-]{10,}$/.test(image)) {
    return 'https://down-vn.img.susercontent.com/file/' + image;
  }
  return image;
}

function fetchShopeeItemApiMetadata(cleanUrl) {
  var out = { name: '', image: '' };
  var item = extractShopItem(cleanUrl);
  if (!item) return out;

  var apiUrl = 'https://shopee.vn/api/v4/item/get?shopid=' +
    encodeURIComponent(item.shopId) + '&itemid=' + encodeURIComponent(item.itemId);

  try {
    var res = UrlFetchApp.fetch(apiUrl, {
      method: 'get', followRedirects: true, muteHttpExceptions: true,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131 Safari/537.36',
        'Accept': 'application/json,text/plain,*/*',
        'Accept-Language': 'vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7',
        'Referer': 'https://shopee.vn/'
      }
    });

    if (res.getResponseCode() < 200 || res.getResponseCode() >= 300) return out;
    var json = JSON.parse(res.getContentText());
    var product = json && json.data ? (json.data.item || json.data) : null;
    if (!product) return out;

    out.name = cleanProductName(product.name || product.title || '');

    var images = product.images || product.image_list || product.imageList || [];
    if (Array.isArray(images) && images.length) out.image = normalizeShopeeImage(images[0]);
    if (!out.image && product.image) out.image = normalizeShopeeImage(product.image);
    if (!out.image && product.cover) out.image = normalizeShopeeImage(product.cover);
  } catch (e) {}

  return out;
}

function fetchShopeeHtmlMetadata(cleanUrl) {
  var out = { name: '', image: '' };
  try {
    var res = UrlFetchApp.fetch(cleanUrl, {
      method: 'get', followRedirects: true, muteHttpExceptions: true,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7'
      }
    });

    var html = res.getContentText() || '';
    out.name = cleanProductName(
      extractMetaContent(html, 'property', 'og:title') ||
      extractMetaContent(html, 'name', 'twitter:title') ||
      extractMetaContent(html, 'property', 'twitter:title')
    );
    out.image = normalizeShopeeImage(
      extractMetaContent(html, 'property', 'og:image') ||
      extractMetaContent(html, 'property', 'og:image:secure_url') ||
      extractMetaContent(html, 'name', 'twitter:image')
    );

    var jsonLd = extractJsonLdProduct(html);
    if (!out.name && jsonLd.name) out.name = jsonLd.name;
    if (!out.image && jsonLd.image) out.image = normalizeShopeeImage(jsonLd.image);

    if (!out.name) {
      var title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
      if (title) out.name = cleanProductName(title[1]);
    }
  } catch (e) {}
  return out;
}

/*
 * Fallback bên thứ ba.
 * API công khai này nhận cả URL sản phẩm đầy đủ và short-link, rồi trả
 * productName + imageUrl + productLink. Không phải Shopee Official API.
 */
function fetchFallbackProductData_(url) {
  var out = { name: '', image: '', productLink: '' };
  try {
    var endpoint = 'https://data.addlivetag.com/product-data/product-data.php?url=' + encodeURIComponent(url);
    var res = UrlFetchApp.fetch(endpoint, {
      method: 'get', followRedirects: true, muteHttpExceptions: true,
      headers: { 'Accept': 'application/json', 'User-Agent': 'HoanVi/1.0' }
    });
    if (res.getResponseCode() < 200 || res.getResponseCode() >= 300) return out;

    var json = JSON.parse(res.getContentText());
    var p = json && json.productInfo ? json.productInfo : null;
    if (!p) return out;

    out.name = cleanProductName(p.productName || p.name || p.title || '');
    out.image = normalizeShopeeImage(p.imageUrl || p.image || '');
    out.productLink = p.productLink || '';
  } catch (e) {}
  return out;
}

function fetchShopeeProductMetadata(cleanUrl) {
  cleanUrl = String(cleanUrl || '').trim();
  if (!cleanUrl) return { name: '', image: '' };

  var cache = CacheService.getScriptCache();
  var key = 'shopee_meta_' + Utilities.base64EncodeWebSafe(cleanUrl).slice(0, 180);
  var cached = cache.get(key);
  if (cached) {
    try { return JSON.parse(cached); } catch (e) {}
  }

  var out = { name: '', image: '' };

  // 1. Nhanh nhất và không phụ thuộc dịch vụ ngoài nếu đã có shop/item.
  var api = fetchShopeeItemApiMetadata(cleanUrl);
  if (api.name) out.name = api.name;
  if (api.image) out.image = api.image;

  // 2. HTML OpenGraph / JSON-LD.
  if (!out.name || !out.image) {
    var html = fetchShopeeHtmlMetadata(cleanUrl);
    if (!out.name) out.name = html.name;
    if (!out.image) out.image = html.image;
  }

  // 3. Fallback cho short-link hoặc trang Shopee chặn bot/API.
  if (!out.name || !out.image) {
    var fallback = fetchFallbackProductData_(cleanUrl);
    if (!out.name) out.name = fallback.name;
    if (!out.image) out.image = fallback.image;
  }

  out = {
    name: cleanProductName(out.name),
    image: normalizeShopeeImage(out.image)
  };

  try { cache.put(key, JSON.stringify(out), 21600); } catch (e) {}
  return out;
}

function getLinkColumnMap() {
  ensureSheets();
  var sh = getSheet(SHEET_LINKS);
  var headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  var map = {};
  headers.forEach(function(h, i) { map[String(h).trim()] = i + 1; });
  return map;
}

function backfillProductMetadata() {
  ensureSheets();
  var sh = getSheet(SHEET_LINKS);
  var data = sh.getDataRange().getValues();
  if (data.length <= 1) return { success: true, updated: 0, total: 0 };

  var map = getLinkColumnMap();
  var nameCol = map.ProductName;
  var imageCol = map.ProductImage;
  if (!nameCol || !imageCol) throw new Error('Thiếu cột ProductName/ProductImage trong sheet Links.');

  var updated = 0;
  for (var i = 1; i < data.length; i++) {
    var cleanUrl = data[i][map.CleanUrl - 1];
    var oldName = data[i][nameCol - 1];
    var oldImage = data[i][imageCol - 1];
    if (!cleanUrl || (oldName && oldImage)) continue;

    try {
      var meta = fetchShopeeProductMetadata(cleanUrl);
      if (meta.name) sh.getRange(i + 1, nameCol).setValue(meta.name);
      if (meta.image) sh.getRange(i + 1, imageCol).setValue(meta.image);
      if (meta.name || meta.image) updated++;
    } catch (e) {
      console.log('Backfill row ' + (i + 1) + ': ' + e.message);
    }
  }

  return { success: true, updated: updated, total: data.length - 1 };
}

function adminBackfillProductMetadata(token) {
  var admin = requireAdmin(token);
  if (!admin) return { success: false, message: 'Bạn không có quyền quản trị.' };
  try { return backfillProductMetadata(); }
  catch (e) { return { success: false, message: e.message || 'Không thể cập nhật dữ liệu sản phẩm.' }; }
}
