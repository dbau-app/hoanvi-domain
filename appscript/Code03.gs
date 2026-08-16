/* =========================================================
   SHOPEE LINK RESOLVER
   Hỗ trợ link sản phẩm dài, /-i.shopid.itemid, /product/shop/item,
   query shopid/itemid, s.shopee.vn, shope.ee, shp.ee, vn.shp.ee,
   shpee.vn và link affiliate có origin_link.
   ========================================================= */

function isShopeeHost(url) {
  var m = String(url || '').match(/^https?:\/\/([^\/]+)/i);
  var host = m ? m[1].toLowerCase().split(':')[0] : '';
  return /(^|\.)shopee\.vn$/.test(host) ||
         /(^|\.)shopee\.co\.vn$/.test(host) ||
         /(^|\.)s\.shopee\.vn$/.test(host) ||
         /(^|\.)shope\.ee$/.test(host) ||
         /(^|\.)shp\.ee$/.test(host) ||
         /(^|\.)vn\.shp\.ee$/.test(host) ||
         /(^|\.)shpee\.vn$/.test(host);
}

function looksLikeUrl(url) {
  return /^https?:\/\/[^\s]+\.[^\s]+/i.test(String(url || ''));
}

function normalizeUrlInput(url) {
  url = String(url || '').trim();
  if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
  return url;
}

function extractOriginLink(url) {
  var m = String(url || '').match(/[?&]origin_link=([^&]+)/i);
  if (!m) return null;
  try { return decodeURIComponent(m[1]); } catch (e) { return m[1]; }
}

function extractShopItem(url) {
  url = String(url || '');

  // https://shopee.vn/ten-san-pham-i.123456.987654
  var m = url.match(/(?:^|[?&#\/])(?:[^?#]*?)-i\.(\d+)\.(\d+)(?:[/?#&]|$)/i);
  if (m) return { shopId: m[1], itemId: m[2] };

  // https://shopee.vn/product/123456/987654
  m = url.match(/\/product\/(\d+)\/(\d+)(?:[/?#&]|$)/i);
  if (m) return { shopId: m[1], itemId: m[2] };

  // Một số universal-link có /product-i.123.456
  m = url.match(/\/product-i\.(\d+)\.(\d+)(?:[/?#&]|$)/i);
  if (m) return { shopId: m[1], itemId: m[2] };

  // Query parameters.
  var shop = url.match(/[?&#](?:shopid|shop_id)=(\d+)/i);
  var item = url.match(/[?&#](?:itemid|item_id|itemId)=(\d+)/i);
  if (shop && item) return { shopId: shop[1], itemId: item[1] };

  // Một số URL có .../<shopid>/<itemid>.
  m = url.match(/\/([0-9]{4,})\/([0-9]{4,})(?:[/?#&]|$)/);
  if (m && isShopeeHost(url)) return { shopId: m[1], itemId: m[2] };

  return null;
}

function canonicalShopeeProduct_(item) {
  if (!item || !item.shopId || !item.itemId) return '';
  return 'https://shopee.vn/product/' + item.shopId + '/' + item.itemId;
}

function absoluteUrl(base, loc) {
  if (!loc) return '';
  loc = String(loc).trim().replace(/^[\'"]|[\'"]$/g, '');
  if (/^https?:\/\//i.test(loc)) return loc;

  var m = String(base).match(/^(https?:\/\/[^\/]+)/i);
  if (!m) return loc;
  if (loc.indexOf('//') === 0) return m[1].split(':')[0] + ':' + loc;
  if (loc.charAt(0) === '/') return m[1] + loc;
  return m[1] + '/' + loc;
}

function extractHtmlUrl(html, baseUrl, names) {
  html = String(html || '');
  for (var i = 0; i < names.length; i++) {
    var n = names[i].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    var q = "['\\\"]";
    var re1 = new RegExp('<meta[^>]+(?:property|name)=' + q + n + q + '[^>]+content=' + q + '([^' + "'\\\"" + ']+)' + q, 'i');
    var re2 = new RegExp('<meta[^>]+content=' + q + '([^' + "'\\\"" + ']+)' + q + '[^>]+(?:property|name)=' + q + n + q, 'i');
    var m = html.match(re1) || html.match(re2);
    if (m && m[1]) return absoluteUrl(baseUrl, decodeHtmlEntities(m[1]));
  }
  return '';
}

function resolveRedirect(url, maxHops) {
  var current = url;
  for (var i = 0; i < (maxHops || 5); i++) {
    var res;
    try {
      res = UrlFetchApp.fetch(current, {
        method: 'get',
        followRedirects: false,
        muteHttpExceptions: true,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131 Safari/537.36',
          'Accept': '*/*',
          'Accept-Language': 'vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7'
        }
      });
    } catch (e) {
      break;
    }

    var code = res.getResponseCode();
    if (code >= 300 && code < 400) {
      var headers = res.getAllHeaders();
      var loc = headers.Location || headers.location;
      if (Array.isArray(loc)) loc = loc[0];
      if (!loc) break;
      current = absoluteUrl(current, loc);
      continue;
    }
    break;
  }
  return current;
}

/*
 * Một số short-link không trả Location mà trả HTML/JS.
 * Thử canonical, og:url, JSON/JS chứa URL Shopee.
 */
function resolveShopeeHtmlDestination(url) {
  try {
    var res = UrlFetchApp.fetch(url, {
      method: 'get',
      followRedirects: true,
      muteHttpExceptions: true,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7'
      }
    });

    var html = res.getContentText() || '';

    var canonical = extractHtmlUrl(html, url, ['og:url', 'twitter:url']);
    if (canonical && canonical !== url) return canonical;

    var linkCanonical =
      html.match(/<link[^>]+rel=['\"]canonical['\"][^>]+href=['\"]([^'\"]+)/i) ||
      html.match(/<link[^>]+href=['\"]([^'\"]+)['\"][^>]+rel=['\"]canonical['\"]/i);
    if (linkCanonical && linkCanonical[1]) {
      return absoluteUrl(url, decodeHtmlEntities(linkCanonical[1]));
    }

    var product = extractShopItem(html);
    if (product) return canonicalShopeeProduct_(product);

    var patterns = [
      /(?:redirect|target|destination|url|redirectUrl|canonicalUrl)\s*[:=]\s*['\"](https?:\/\/[^'\"\\]+)/i,
      /https?:\\?\/\\?(?:www\.)?shopee\.vn\/[^'\"\s\\]+/i,
      /https?:\/\/(?:s\.shopee\.vn|shope\.ee|shp\.ee|vn\.shp\.ee|shpee\.vn)\/[^'\"\s\\]+/i
    ];

    for (var i = 0; i < patterns.length; i++) {
      var m = html.match(patterns[i]);
      if (!m) continue;
      var candidate = (m[1] || m[0]).replace(/\\\//g, '/');
      if (isShopeeHost(candidate)) return candidate;
    }
  } catch (e) {}

  return '';
}

/*
 * Fallback quan trọng cho short-link mà Google không resolve được.
 * API này là bên thứ ba, không phải Shopee Official API; chỉ dùng khi
 * resolver trực tiếp của Shopee không lấy được sản phẩm.
 */
function resolveShopeeViaFallbackApi_(url) {
  try {
    var endpoint = 'https://data.addlivetag.com/product-data/product-data.php?url=' + encodeURIComponent(url);
    var res = UrlFetchApp.fetch(endpoint, {
      method: 'get',
      followRedirects: true,
      muteHttpExceptions: true,
      headers: { 'Accept': 'application/json', 'User-Agent': 'HoanVi/1.0' }
    });
    if (res.getResponseCode() < 200 || res.getResponseCode() >= 300) return '';

    var json = JSON.parse(res.getContentText());
    var p = json && json.productInfo ? json.productInfo : null;
    if (!p) return '';

    if (p.productLink) return normalizeUrlInput(p.productLink);
    if (p.shopId && p.itemId) return canonicalShopeeProduct_({ shopId: p.shopId, itemId: p.itemId });
    if (p.shopid && p.itemid) return canonicalShopeeProduct_({ shopId: p.shopid, itemId: p.itemid });
  } catch (e) {}
  return '';
}

function cleanShopeeLink(rawUrl) {
  var original = normalizeUrlInput(rawUrl);
  if (!looksLikeUrl(original)) return null;

  var cache = CacheService.getScriptCache();
  var cacheKey = 'shopee_clean_' + Utilities.base64EncodeWebSafe(original).slice(0, 180);
  var cached = cache.get(cacheKey);
  if (cached) return cached;

  var url = original;

  // Affiliate URL: lấy origin_link trước.
  for (var iter = 0; iter < 6; iter++) {
    var origin = extractOriginLink(url);
    if (origin) {
      url = normalizeUrlInput(origin);
      continue;
    }

    var item = extractShopItem(url);
    if (item) {
      var canonical = canonicalShopeeProduct_(item);
      cache.put(cacheKey, canonical, 21600);
      return canonical;
    }

    var resolved = resolveRedirect(url, 5);
    if (resolved && resolved !== url) {
      url = resolved;
      continue;
    }

    var htmlDestination = resolveShopeeHtmlDestination(url);
    if (htmlDestination && htmlDestination !== url) {
      url = htmlDestination;
      continue;
    }

    break;
  }

  item = extractShopItem(url);
  if (item) {
    var canonical2 = canonicalShopeeProduct_(item);
    cache.put(cacheKey, canonical2, 21600);
    return canonical2;
  }

  // Fallback cuối cho short-link Shopee.
  var fallback = resolveShopeeViaFallbackApi_(original);
  if (fallback) {
    item = extractShopItem(fallback);
    var finalUrl = item ? canonicalShopeeProduct_(item) : fallback.split('#')[0].split('?')[0];
    if (isShopeeHost(finalUrl)) {
      cache.put(cacheKey, finalUrl, 21600);
      return finalUrl;
    }
  }

  if (!isShopeeHost(url)) return null;

  var clean = url.split('#')[0].split('?')[0];
  cache.put(cacheKey, clean, 21600);
  return clean;
}

function buildSubId(userTrackingCode) {
  return [userTrackingCode, '0', '0', '0', '0'].join('-');
}

function toAffiliateLink(cleanUrl, subId) {
  return 'https://s.shopee.vn/an_redir?origin_link=' + encodeURIComponent(cleanUrl) +
    '&affiliate_id=' + SHOPEE_AFFILIATE_ID + '&sub_id=' + subId;
}
