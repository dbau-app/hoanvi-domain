/* =========================================================
   SHOPEE PRODUCT METADATA
   Lấy tên + hình sản phẩm để hiển thị ở User và Admin.
   Không làm fail việc tạo affiliate link nếu Shopee chặn metadata.
   ========================================================= */

function decodeHtmlEntities(str) {
  str = String(str || '');

  var named = {
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&#39;': "'",
    '&apos;': "'",
    '&nbsp;': ' '
  };

  Object.keys(named).forEach(function(k) {
    str = str.split(k).join(named[k]);
  });

  str = str.replace(/&#(\d+);/g, function(_, n) {
    try { return String.fromCharCode(parseInt(n, 10)); } catch (e) { return _; }
  });

  str = str.replace(/&#x([0-9a-f]+);/gi, function(_, n) {
    try { return String.fromCharCode(parseInt(n, 16)); } catch (e) { return _; }
  });

  return str;
}

function cleanProductName(name) {
  name = decodeHtmlEntities(String(name || ''))
    .replace(/\\s+/g, ' ')
    .trim();

  // Bỏ hậu tố thường gặp của title trang Shopee.
  name = name
    .replace(/\s*[|·-]\s*Shopee(?:\s+Việt Nam)?\s*$/i, '')
    .replace(/\s*-\s*Shopee\.vn\s*$/i, '')
    .trim();

  return name;
}

function extractMetaContent(html, attr, value) {
  html = String(html || '');
  attr = String(attr || '');
  value = String(value || '');

  var escaped = value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  // <meta property="og:title" content="...">
  var re1 = new RegExp(
    '<meta[^>]+(?:' + attr + ')=[' + "'\\\"" + ']' + escaped +
    '[' + "'\\\"" + '][^>]+content=[' + "'\\\"" + ']([^' + "'\\\"" + ']+)[' + "'\\\"" + ']',
    'i'
  );

  var m = html.match(re1);
  if (m) return decodeHtmlEntities(m[1]);

  // <meta content="..." property="og:title">
  var re2 = new RegExp(
    '<meta[^>]+content=[' + "'\\\"" + ']([^' + "'\\\"" + ']+)[' + "'\\\"" + '][^>]+(?:' + attr +
    ')=[' + "'\\\"" + ']' + escaped + '[' + "'\\\"" + ']',
    'i'
  );

  m = html.match(re2);
  return m ? decodeHtmlEntities(m[1]) : '';
}

function extractJsonLdProduct(html) {
  var out = { name: '', image: '' };
  var re = /<script[^>]+type=['\"]application\/ld\+json['\"][^>]*>([\s\S]*?)<\/script>/gi;
  var m;

  while ((m = re.exec(html)) !== null) {
    try {
      var raw = m[1]
        .replace(/^\s*<!--/, '')
        .replace(/-->\s*$/, '')
        .trim();

      var data = JSON.parse(raw);
      var items = Array.isArray(data) ? data : [data];

      // Một số JSON-LD chứa @graph.
      items.forEach(function(item) {
        if (!item) return;

        if (item['@graph'] && Array.isArray(item['@graph'])) {
          items = items.concat(item['@graph']);
        }

        var type = item['@type'];
        var isProduct = type === 'Product' ||
          (Array.isArray(type) && type.indexOf('Product') > -1);

        if (!isProduct) return;

        if (!out.name && item.name) out.name = cleanProductName(item.name);

        if (!out.image && item.image) {
          if (Array.isArray(item.image)) {
            out.image = item.image[0] || '';
          } else if (typeof item.image === 'string') {
            out.image = item.image;
          } else if (item.image.url) {
            out.image = item.image.url;
          }
        }
      });
    } catch (e) {
      // JSON-LD lỗi không làm hỏng luồng lấy link.
    }
  }

  return out;
}

function normalizeShopeeImage(image) {
  image = String(image || '').trim();
  if (!image) return '';

  if (/^https?:\/\//i.test(image)) return image;

  // Shopee API thường trả về file id.
  if (/^[A-Za-z0-9_-]{10,}$/.test(image)) {
    return 'https://down-vn.img.susercontent.com/file/' + image;
  }

  return image;
}

function fetchShopeeItemApiMetadata(cleanUrl) {
  var out = { name: '', image: '' };
  var item = extractShopItem(cleanUrl);
  if (!item) return out;

  var apiUrl =
    'https://shopee.vn/api/v4/item/get?shopid=' +
    encodeURIComponent(item.shopId) +
    '&itemid=' +
    encodeURIComponent(item.itemId);

  try {
    var res = UrlFetchApp.fetch(apiUrl, {
      method: 'get',
      followRedirects: true,
      muteHttpExceptions: true,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131 Safari/537.36',
        'Accept': 'application/json,text/plain,*/*',
        'Accept-Language': 'vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7',
        'Referer': 'https://shopee.vn/'
      }
    });

    if (res.getResponseCode() < 200 || res.getResponseCode() >= 300) {
      return out;
    }

    var json = JSON.parse(res.getContentText());
    var data = json && json.data ? json.data : {};
    var product = data.item || data;

    if (product) {
      out.name = cleanProductName(product.name || product.title || '');

      var images = product.images || product.image_list || [];
      if (Array.isArray(images) && images.length) {
        out.image = normalizeShopeeImage(images[0]);
      }

      if (!out.image && product.image) {
        out.image = normalizeShopeeImage(product.image);
      }
    }
  } catch (e) {
    // Fallback sang HTML bên dưới.
  }

  return out;
}

function fetchShopeeHtmlMetadata(cleanUrl) {
  var out = { name: '', image: '' };

  try {
    var res = UrlFetchApp.fetch(cleanUrl, {
      method: 'get',
      followRedirects: true,
      muteHttpExceptions: true,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7'
      }
    });

    var html = res.getContentText();
    if (!html) return out;

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

    // Fallback cuối cùng: <title>
    if (!out.name) {
      var titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
      if (titleMatch) out.name = cleanProductName(titleMatch[1]);
    }
  } catch (e) {
    // Không throw để affiliate link vẫn được tạo.
  }

  return out;
}

function fetchShopeeProductMetadata(cleanUrl) {
  var out = { name: '', image: '' };

  // 1. Ưu tiên API sản phẩm vì thường cho tên + image chính xác hơn.
  var apiMeta = fetchShopeeItemApiMetadata(cleanUrl);
  if (apiMeta.name) out.name = apiMeta.name;
  if (apiMeta.image) out.image = apiMeta.image;

  // 2. Fallback HTML Open Graph / JSON-LD.
  if (!out.name || !out.image) {
    var htmlMeta = fetchShopeeHtmlMetadata(cleanUrl);
    if (!out.name) out.name = htmlMeta.name;
    if (!out.image) out.image = htmlMeta.image;
  }

  return {
    name: cleanProductName(out.name),
    image: normalizeShopeeImage(out.image)
  };
}

function getLinkColumnMap() {
  ensureSheets();
  var sh = getSheet(SHEET_LINKS);
  var lastCol = sh.getLastColumn();
  var headers = sh.getRange(1, 1, 1, lastCol).getValues()[0];

  var map = {};
  headers.forEach(function(h, i) {
    map[String(h).trim()] = i + 1;
  });

  return map;
}

/*
 * Chạy 1 lần sau khi deploy phiên bản này để bổ sung
 * ProductName/ProductImage cho các link cũ.
 *
 * Có thể chạy trực tiếp trong Apps Script bằng hàm:
 * backfillProductMetadata()
 */
function backfillProductMetadata() {
  ensureSheets();

  var sh = getSheet(SHEET_LINKS);
  var data = sh.getDataRange().getValues();
  if (data.length <= 1) {
    return { success: true, updated: 0, total: 0 };
  }

  var map = getLinkColumnMap();
  var nameCol = map.ProductName;
  var imageCol = map.ProductImage;

  if (!nameCol || !imageCol) {
    throw new Error('Thiếu cột ProductName/ProductImage trong sheet Links.');
  }

  var updated = 0;

  for (var i = 1; i < data.length; i++) {
    var cleanUrl = data[i][3];
    var oldName = data[i][nameCol - 1];
    var oldImage = data[i][imageCol - 1];

    if (!cleanUrl) continue;
    if (oldName && oldImage) continue;

    try {
      var meta = fetchShopeeProductMetadata(cleanUrl);

      if (meta.name) sh.getRange(i + 1, nameCol).setValue(meta.name);
      if (meta.image) sh.getRange(i + 1, imageCol).setValue(meta.image);

      if (meta.name || meta.image) updated++;

      Utilities.sleep(300);
    } catch (e) {
      console.log('Backfill row ' + (i + 1) + ': ' + e.message);
    }
  }

  return {
    success: true,
    updated: updated,
    total: data.length - 1
  };
}

/*
 * Admin có thể gọi từ giao diện để cập nhật metadata cho các link
 * đang thiếu tên/hình. Giới hạn mỗi lần chạy theo thời gian Apps Script.
 */
function adminBackfillProductMetadata(token) {
  var admin = requireAdmin(token);
  if (!admin) return { success: false, message: 'Bạn không có quyền quản trị.' };

  try {
    return backfillProductMetadata();
  } catch (e) {
    return { success: false, message: e.message || 'Không thể cập nhật dữ liệu sản phẩm.' };
  }
}

