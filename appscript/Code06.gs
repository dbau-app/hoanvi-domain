/* ---------- Reads: withdrawals / transactions ---------- */
function getTransactionsForUser(userId) {
  var data = getSheet(SHEET_TX).getDataRange().getValues();
  var out = [];
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][1]) === String(userId)) {
      out.push({ id: data[i][0], type: data[i][2], amount: data[i][3], sign: data[i][4], date: formatDate(data[i][5]), relatedId: data[i][6] });
    }
  }
  return out.reverse();
}

function getWithdrawalsForUser(userId) {
  var data = getSheet(SHEET_WD).getDataRange().getValues();
  var out = [];
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][1]) === String(userId)) {
      out.push({ id: data[i][0], amount: data[i][2], bank: data[i][3], account: data[i][4], holder: data[i][5], status: data[i][6], created: formatDate(data[i][7]) });
    }
  }
  return out.reverse();
}

function computeAvailable(userId) {
  var tx = getTransactionsForUser(userId);
  var avail = 0;
  tx.forEach(function (t) {
    if (t.sign === 'plus') avail += t.amount;
    if (t.sign === 'minus') avail -= t.amount;
  });
  return avail;
}

/* ---------- Dashboard (thành viên) ---------- */
function getDashboard(token) {
  var user = getUserByToken(token);
  if (!user) return { success: false, message: 'Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại.' };

  var links = getLinksForUser(user.id);
  var tx = getTransactionsForUser(user.id);
  var wds = getWithdrawalsForUser(user.id);

  var lifetimeCommission = 0;
  links.forEach(function (l) { if (l.status === 'Đã ghi nhận hoa hồng') lifetimeCommission += l.userShare; });
  var balanceAvailable = computeAvailable(user.id);
  var totalWithdrawn = 0;
  wds.forEach(function (w) { if (w.status === 'Đã chuyển khoản') totalWithdrawn += w.amount; });

  return {
    success: true, user: user,
    balanceAvailable: balanceAvailable, lifetimeCommission: lifetimeCommission, totalWithdrawn: totalWithdrawn,
    totalLinks: links.length, links: links.slice(0, 30), transactions: tx, withdrawals: wds
  };
}

/* ---------- Withdrawal (thành viên) ---------- */
function requestWithdrawal(token, amount, bank, account, holder) {
  var user = getUserByToken(token);
  if (!user) return { success: false, message: 'Phiên đăng nhập đã hết hạn.' };
  amount = parseInt(amount, 10) || 0;
  if (amount < MIN_WITHDRAW) return { success: false, message: 'Số tiền rút tối thiểu là ' + MIN_WITHDRAW.toLocaleString('vi-VN') + 'đ.' };
  if (!bank || !account || !holder) return { success: false, message: 'Vui lòng điền đầy đủ thông tin ngân hàng.' };
  var available = computeAvailable(user.id);
  if (amount > available) return { success: false, message: 'Số dư khả dụng không đủ.' };

  var id = genId('RT-', 6);
  getSheet(SHEET_WD).appendRow([id, user.id, amount, bank.trim(), account.trim(), holder.trim(), 'Đang xử lý', new Date()]);
  getSheet(SHEET_TX).appendRow([genId('TX-', 6), user.id, 'Yêu cầu rút tiền · ' + bank.trim() + ' ••' + account.trim().slice(-4), amount, 'minus', new Date(), id]);
  return { success: true };
}

/* =========================================================
   ADMIN — nhập/cập nhật hoa hồng link, duyệt rút tiền
   Quyền admin gắn theo tài khoản (cột Role trong sheet Users).
   ========================================================= */

