function adminGetLinks(token) {
  var admin = requireAdmin(token);
  if (!admin) return { success: false, message: 'Bạn không có quyền quản trị.' };

  var users = getSheet(SHEET_USERS).getDataRange().getValues();
  var userMap = {};
  for (var i = 1; i < users.length; i++) {
    userMap[users[i][0]] = { name: users[i][1], email: users[i][2] };
  }

  var data = getSheet(SHEET_LINKS).getDataRange().getValues();
  var map = getLinkColumnMap();
  var links = [];
  var totalGross = 0, totalNet = 0, totalUserShare = 0, totalAdminShare = 0;

  for (var i = 1; i < data.length; i++) {
    var status = data[i][map.Status - 1];

    links.push({
      id: data[i][map.ID - 1],
      userId: data[i][map.UserId - 1],
      userName: (userMap[data[i][map.UserId - 1]] || {}).name || '—',
      userEmail: (userMap[data[i][map.UserId - 1]] || {}).email || '—',
      original: data[i][map.OriginalUrl - 1],
      clean: data[i][map.CleanUrl - 1],
      affiliate: data[i][map.AffiliateUrl - 1],
      subId: data[i][map.SubId - 1],
      status: status,
      gross: data[i][map.GrossCommission - 1],
      net: data[i][map.NetCommission - 1],
      userShare: data[i][map.UserCommission - 1],
      adminShare: data[i][map.AdminCommission - 1],
      created: formatDate(data[i][map.CreatedAt - 1]),
      productName: data[i][map.ProductName - 1] || '',
      productImage: data[i][map.ProductImage - 1] || ''
    });

    if (status === 'Đã ghi nhận hoa hồng') {
      totalGross += Number(data[i][map.GrossCommission - 1]) || 0;
      totalNet += Number(data[i][map.NetCommission - 1]) || 0;
      totalUserShare += Number(data[i][map.UserCommission - 1]) || 0;
      totalAdminShare += Number(data[i][map.AdminCommission - 1]) || 0;
    }
  }

  return {
    success: true,
    links: links.reverse(),
    summary: {
      totalGross: totalGross,
      totalNet: totalNet,
      totalUserShare: totalUserShare,
      totalAdminShare: totalAdminShare
    }
  };
}

// Công thức chia hoa hồng:
// 1) Hoa hồng gốc (Shopee duyệt) → trừ 1% phí sàn
// 2) Trừ tiếp 10% thuế TNCN trên phần còn lại → ra "hoa hồng thực nhận"
// 3) Hoa hồng thực nhận chia 85% cho thành viên, 15% admin giữ lại
function computeCommissionSplit(gross) {
  var afterPlatformFee = gross * (1 - PLATFORM_FEE_RATE);
  var net = Math.round(afterPlatformFee * (1 - PERSONAL_INCOME_TAX_RATE)); // hoa hồng thực nhận
  var userShare = Math.round(net * USER_SHARE_RATE);
  var adminShare = net - userShare; // phần còn lại của net, tránh lệch số do làm tròn
  return { net: net, userShare: userShare, adminShare: adminShare };
}

function adminUpdateLinkCommission(token, linkId, grossCommission) {
  var admin = requireAdmin(token);
  if (!admin) return { success: false, message: 'Bạn không có quyền quản trị.' };
  var gross = parseFloat(grossCommission);
  if (isNaN(gross) || gross < 0) return { success: false, message: 'Số tiền hoa hồng không hợp lệ.' };

  var split = computeCommissionSplit(gross);

  var sh = getSheet(SHEET_LINKS);
  var data = sh.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (data[i][0] === linkId) {
      var oldUserShare = data[i][9] || 0;
      var linkUserId = data[i][1];

      sh.getRange(i + 1, 7).setValue('Đã ghi nhận hoa hồng'); // Status
      sh.getRange(i + 1, 8).setValue(gross);                  // GrossCommission
      sh.getRange(i + 1, 9).setValue(split.net);              // NetCommission (thực nhận)
      sh.getRange(i + 1, 10).setValue(split.userShare);       // UserCommission (85%)
      sh.getRange(i + 1, 11).setValue(split.adminShare);      // AdminCommission (15%)
      sh.getRange(i + 1, getLinkColumnMap().UpdatedAt).setValue(new Date()); // UpdatedAt

      var delta = split.userShare - oldUserShare;
      if (delta !== 0) {
        var label = oldUserShare ? 'Điều chỉnh hoa hồng link · ' + linkId : 'Hoa hồng link · ' + linkId;
        getSheet(SHEET_TX).appendRow([genId('TX-', 6), linkUserId, label, Math.abs(delta), delta > 0 ? 'plus' : 'minus', new Date(), linkId]);
      }
      return { success: true };
    }
  }
  return { success: false, message: 'Không tìm thấy link.' };
}

function adminCancelLink(token, linkId) {
  var admin = requireAdmin(token);
  if (!admin) return { success: false, message: 'Bạn không có quyền quản trị.' };
  var sh = getSheet(SHEET_LINKS);
  var data = sh.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (data[i][0] === linkId) {
      var oldUserShare = data[i][9] || 0;
      var linkUserId = data[i][1];
      if (oldUserShare > 0) {
        getSheet(SHEET_TX).appendRow([genId('TX-', 6), linkUserId, 'Huỷ hoa hồng link · ' + linkId, oldUserShare, 'minus', new Date(), linkId]);
      }
      sh.getRange(i + 1, 7).setValue('Đã huỷ');  // Status
      sh.getRange(i + 1, 8).setValue(0);          // GrossCommission
      sh.getRange(i + 1, 9).setValue(0);          // NetCommission
      sh.getRange(i + 1, 10).setValue(0);         // UserCommission
      sh.getRange(i + 1, 11).setValue(0);         // AdminCommission
      sh.getRange(i + 1, getLinkColumnMap().UpdatedAt).setValue(new Date()); // UpdatedAt
      return { success: true };
    }
  }
  return { success: false, message: 'Không tìm thấy link.' };
}

function adminGetWithdrawals(token) {
  var admin = requireAdmin(token);
  if (!admin) return { success: false, message: 'Bạn không có quyền quản trị.' };
  var users = getSheet(SHEET_USERS).getDataRange().getValues();
  var userMap = {};
  for (var i = 1; i < users.length; i++) userMap[users[i][0]] = { name: users[i][1], email: users[i][2] };

  var data = getSheet(SHEET_WD).getDataRange().getValues();
  var out = [];
  for (var i = 1; i < data.length; i++) {
    if (data[i][6] === 'Đang xử lý') {
      out.push({
        id: data[i][0], userName: (userMap[data[i][1]] || {}).name || '—',
        amount: data[i][2], bank: data[i][3], account: data[i][4], holder: data[i][5],
        created: formatDate(data[i][7])
      });
    }
  }
  return { success: true, withdrawals: out.reverse() };
}

function adminCompleteWithdrawal(token, withdrawId) {
  var admin = requireAdmin(token);
  if (!admin) return { success: false, message: 'Bạn không có quyền quản trị.' };
  var sh = getSheet(SHEET_WD);
  var data = sh.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (data[i][0] === withdrawId) {
      sh.getRange(i + 1, 7).setValue('Đã chuyển khoản');
      return { success: true };
    }
  }
  return { success: false, message: 'Không tìm thấy yêu cầu rút tiền.' };
}
