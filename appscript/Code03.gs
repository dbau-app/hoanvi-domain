/* ---------- Shopee: làm sạch link + gắn affiliate theo đúng chuẩn an_redir ---------- */
// Nhận diện mọi tên miền Shopee hay gặp: trang chính, link rút gọn các kiểu
// Nhận diện tương đối 1 host có phải Shopee hay không (dùng để xác nhận SAU
// khi đã theo hết redirect — không dùng để chặn link ở bước đầu, vì Shopee có
// nhiều domain rút gọn khác nhau và có thể đổi/thêm domain mới bất kỳ lúc nào)
function isShopeeHost(url) {
  var m = url.match(/^https?:\/\/([^\/]+)/i);
  var host = m ? m[1].toLowerCase() : '';
  return host.indexOf('shopee') > -1 || host.indexOf('shpee') > -1 || host.indexOf('shp.ee') > -1;
}

// Chỉ kiểm tra xem chuỗi nhập vào có "giống" 1 URL hay không (để không cố xử
// lý những thứ rõ ràng không phải link)
function looksLikeUrl(url) {
  return /^https?:\/\/[^\s]+\.[^\s]+/i.test(url);
}

// Người dùng có thể dán link thiếu "https://" phía trước — tự thêm vào
function normalizeUrlInput(url) {
  url = (url || '').trim();
  if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
  return url;
}

// Nếu link dán vào đã là link affiliate (an_redir?origin_link=...) — của Shopee
// hoặc của một hệ thống khác — lấy đúng link gốc được mã hoá bên trong ra
function extractOriginLink(url) {
  var m = url.match(/[?&]origin_link=([^&]+)/i);
  if (!m) return null;
  try { return decodeURIComponent(m[1]); } catch (e) { return m[1]; }
}

// Trích xuất shopid/itemid từ mọi định dạng link sản phẩm Shopee hay gặp:
// /product/<shopid>/<itemid> · ...-i.<shopid>.<itemid> · ?shopid=&itemid=
function extractShopItem(url) {
  var m1 = url.match(/-i\.(\d+)\.(\d+)/);
  if (m1) return { shopId: m1[1], itemId: m1[2] };
  var m2 = url.match(/\/product\/(\d+)\/(\d+)/);
  if (m2) return { shopId: m2[1], itemId: m2[2] };
  var mShop = url.match(/[?&]shopid=(\d+)/i);
  var mItem = url.match(/[?&]itemid=(\d+)/i);
  if (mShop && mItem) return { shopId: mShop[1], itemId: mItem[1] };
  return null;
}

// Theo dõi redirect thủ công để lấy URL đích cuối cùng của các link rút gọn.
// Trả về chính url đầu vào nếu không có redirect (response 200) hoặc lỗi mạng.
function resolveRedirect(url, maxHops) {
  var current = url;
  for (var i = 0; i < (maxHops || 5); i++) {
    var res;
    try {
      res = UrlFetchApp.fetch(current, { followRedirects: false, muteHttpExceptions: true });
    } catch (e) {
      break;
    }
    var code = res.getResponseCode();
    if (code >= 300 && code < 400) {
      var headers = res.getAllHeaders();
      var loc = headers['Location'] || headers['location'];
      if (!loc) break;
      if (loc.indexOf('http') !== 0) {
        var m = current.match(/^https?:\/\/[^\/]+/);
        loc = (m ? m[0] : '') + loc;
      }
      current = loc;
    } else {
      break;
    }
  }
  return current;
}

// Làm sạch MỌI biến thể link Shopee — link dài, link rút gọn (bất kỳ domain
// rút gọn nào: s.shopee.vn, shope.ee, shp.ee, shpee.vn, hay domain mới nào
// Shopee dùng sau này), link web, link đã có sẵn tracking/affiliate cũ — về
// đúng link sản phẩm gốc, không kèm query rác.
//
// Cách làm: KHÔNG đoán trước domain rút gọn có phải Shopee hay không — cứ
// theo hết chuỗi redirect thực tế của link, rồi mới kiểm tra xem điểm đến
// cuối cùng có phải Shopee hay không. Nhờ vậy hệ thống tự động hỗ trợ được
// mọi domain rút gọn Shopee đang dùng hoặc sẽ dùng trong tương lai.
function cleanShopeeLink(rawUrl) {
  var url = normalizeUrlInput(rawUrl);
  if (!looksLikeUrl(url)) return null;

  for (var iter = 0; iter < 6; iter++) {
    var origin = extractOriginLink(url);
    if (origin) { url = normalizeUrlInput(origin); continue; }

    var item = extractShopItem(url);
    if (item) return 'https://shopee.vn/product/' + item.shopId + '/' + item.itemId;

    var resolved = resolveRedirect(url);
    if (resolved !== url) { url = resolved; continue; }

    break;
  }

  if (!isShopeeHost(url)) return null; // Sau khi theo hết redirect, không dẫn tới Shopee

  // Không nhận diện được shopid/itemid (vd: link trang shop, trang chủ, link
  // voucher...) — vẫn dùng được, chỉ bỏ query rác phía sau
  return url.split('?')[0];
}

// Mỗi tài khoản có 1 mã tracking cố định (TrackingCode) — dùng làm sub_id để
// đối soát hoa hồng theo tài khoản. Không gắn thêm thông tin theo từng link.
function buildSubId(userTrackingCode) {
  return [userTrackingCode, '0', '0', '0', '0'].join('-');
}

// Dựng đúng link affiliate theo chuẩn chính thức của Shopee (an_redir):
// https://s.shopee.vn/an_redir?origin_link=<origin_link đã mã hoá>&affiliate_id=...&sub_id=...
function toAffiliateLink(cleanUrl, subId) {
  var encodedOrigin = encodeURIComponent(cleanUrl);
  return 'https://s.shopee.vn/an_redir?origin_link=' + encodedOrigin +
    '&affiliate_id=' + SHOPEE_AFFILIATE_ID + '&sub_id=' + subId;
}

