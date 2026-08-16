function createTrackingLink(token, productUrl) {
  var user = getUserByToken(token);
  if (!user) return { success: false, message: 'Phiên đăng nhập đã hết hạn.' };
  if (!productUrl || !productUrl.trim()) return { success: false, message: 'Vui lòng dán link sản phẩm.' };

  var url = normalizeUrlInput(productUrl);
  if (!looksLikeUrl(url)) return { success: false, message: 'Link không hợp lệ.' };

  var clean;
  try {
    clean = cleanShopeeLink(url);
  } catch (e) {
    return { success: false, message: 'Không thể xử lý link này, vui lòng thử lại.' };
  }

  if (!clean) {
    return {
      success: false,
      message: 'Link này không dẫn tới Shopee — hệ thống chỉ hỗ trợ link Shopee.'
    };
  }

  // Lấy metadata sau khi đã xác định được link sản phẩm gốc.
  // Nếu Shopee chặn metadata thì vẫn tạo affiliate link bình thường.
  var productMeta = { name: '', image: '' };
  try {
    productMeta = fetchShopeeProductMetadata(clean);
  } catch (e) {
    console.log('Product metadata error: ' + e.message);
  }

  var id = genId('LK-', 6);
  var subId = buildSubId(user.trackingCode);
  var affiliateUrl = toAffiliateLink(clean, subId);
  var now = new Date();

  var map = getLinkColumnMap();

  var row = [];
  row[map.ID - 1] = id;
  row[map.UserId - 1] = user.id;
  row[map.OriginalUrl - 1] = url;
  row[map.CleanUrl - 1] = clean;
  row[map.AffiliateUrl - 1] = affiliateUrl;
  row[map.SubId - 1] = subId;
  row[map.Status - 1] = 'Chưa có hoa hồng';
  row[map.GrossCommission - 1] = 0;
  row[map.NetCommission - 1] = 0;
  row[map.UserCommission - 1] = 0;
  row[map.AdminCommission - 1] = 0;
  row[map.CreatedAt - 1] = now;
  row[map.UpdatedAt - 1] = now;
  row[map.ProductName - 1] = productMeta.name || '';
  row[map.ProductImage - 1] = productMeta.image || '';

  // Bảo đảm đủ số cột hiện tại của sheet.
  var width = getSheet(SHEET_LINKS).getLastColumn();
  while (row.length < width) row.push('');

  getSheet(SHEET_LINKS).appendRow(row);

  return {
    success: true,
    shortLink: affiliateUrl,
    cleanLink: clean,
    productName: productMeta.name || '',
    productImage: productMeta.image || ''
  };
}

function getLinksForUser(userId) {
  var data = getSheet(SHEET_LINKS).getDataRange().getValues();
  var map = getLinkColumnMap();
  var out = [];

  for (var i = 1; i < data.length; i++) {
    if (String(data[i][map.UserId - 1]) === String(userId)) {
      out.push({
        id: data[i][map.ID - 1],
        original: data[i][map.OriginalUrl - 1],
        clean: data[i][map.CleanUrl - 1],
        affiliate: data[i][map.AffiliateUrl - 1],
        subId: data[i][map.SubId - 1],
        status: data[i][map.Status - 1],
        gross: data[i][map.GrossCommission - 1],
        net: data[i][map.NetCommission - 1],
        userShare: data[i][map.UserCommission - 1],
        adminShare: data[i][map.AdminCommission - 1],
        created: formatDate(data[i][map.CreatedAt - 1]),
        productName: data[i][map.ProductName - 1] || '',
        productImage: data[i][map.ProductImage - 1] || ''
      });
    }
  }

  return out.reverse();
}

