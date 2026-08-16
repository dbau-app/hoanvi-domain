/* ---------- Auth: đăng ký + xác nhận email ---------- */
function registerUser(name, email, password) {
  ensureSheets();
  name = (name || '').trim();
  email = (email || '').trim().toLowerCase();
  password = password || '';
  if (!name || !email || !password) return { success: false, message: 'Vui lòng nhập đầy đủ thông tin.' };
  if (!isValidEmail(email)) return { success: false, message: 'Email không hợp lệ.' };
  if (password.length < 6) return { success: false, message: 'Mật khẩu tối thiểu 6 ký tự.' };

  var existing = findUserByEmail(email);
  var code = genVerifyCode();
  var expiry = new Date(Date.now() + CODE_TTL_MINUTES * 60 * 1000);
  var salt = Utilities.getUuid();
  var hash = hashPass(password, salt);
  var sh = getSheet(SHEET_USERS);

  if (existing) {
    if (existing.values[5] === true) return { success: false, message: 'Email này đã được đăng ký. Vui lòng đăng nhập.' };
    sh.getRange(existing.row, 2).setValue(name);
    sh.getRange(existing.row, 4).setValue(hash);
    sh.getRange(existing.row, 5).setValue(salt);
    sh.getRange(existing.row, 7).setValue(code);
    sh.getRange(existing.row, 8).setValue(expiry);
  } else {
    var id = 'U-' + genId('', 6);
    var trackingCode = genId('', 8); // Mã tracking cố định, riêng biệt cho từng tài khoản — dùng trong sub_id
    // Cột: ID,Name,Email,PasswordHash,Salt,Verified,VerifyCode,VerifyExpiry,Token,TokenExpiry,Role,TrackingCode,CreatedAt
    sh.appendRow([id, name, email, hash, salt, false, code, expiry, '', '', 'customer', trackingCode, new Date()]);
  }

  sendVerificationEmail(email, name, code);
  return { success: true, email: email, message: 'Đã gửi mã xác nhận đến ' + email + '.' };
}

function verifyEmail(email, code) {
  ensureSheets();
  email = (email || '').trim().toLowerCase();
  var found = findUserByEmail(email);
  if (!found) return { success: false, message: 'Email chưa được đăng ký.' };
  var row = found.values;
  if (row[5] === true) return { success: false, message: 'Email này đã được xác nhận, vui lòng đăng nhập.' };
  if (String(row[6]) !== String(code).trim()) return { success: false, message: 'Mã xác nhận không đúng.' };
  if (new Date(row[7]) < new Date()) return { success: false, message: 'Mã xác nhận đã hết hạn, vui lòng gửi lại mã.' };

  var token = Utilities.getUuid();
  var expiry = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  var sh = getSheet(SHEET_USERS);
  sh.getRange(found.row, 6).setValue(true);
  sh.getRange(found.row, 7).setValue('');
  sh.getRange(found.row, 9).setValue(token);
  sh.getRange(found.row, 10).setValue(expiry);
  return { success: true, token: token, user: { id: row[0], name: row[1], email: row[2], role: row[10] || 'customer', trackingCode: row[11] } };
}

function resendVerification(email) {
  ensureSheets();
  email = (email || '').trim().toLowerCase();
  var found = findUserByEmail(email);
  if (!found) return { success: false, message: 'Email chưa được đăng ký.' };
  if (found.values[5] === true) return { success: false, message: 'Email này đã được xác nhận, vui lòng đăng nhập.' };

  var code = genVerifyCode();
  var expiry = new Date(Date.now() + CODE_TTL_MINUTES * 60 * 1000);
  var sh = getSheet(SHEET_USERS);
  sh.getRange(found.row, 7).setValue(code);
  sh.getRange(found.row, 8).setValue(expiry);
  sendVerificationEmail(email, found.values[1], code);
  return { success: true, message: 'Đã gửi lại mã xác nhận.' };
}

function loginUser(email, password) {
  ensureSheets();
  email = (email || '').trim().toLowerCase();
  var found = findUserByEmail(email);
  if (!found) return { success: false, message: 'Email chưa được đăng ký.' };
  var row = found.values;
  if (hashPass(password, row[4]) !== row[3]) return { success: false, message: 'Mật khẩu không đúng.' };
  if (row[5] !== true) return { success: false, needVerify: true, email: row[2], message: 'Vui lòng xác nhận email trước khi đăng nhập.' };

  var token = Utilities.getUuid();
  var expiry = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  var sh = getSheet(SHEET_USERS);
  sh.getRange(found.row, 9).setValue(token);
  sh.getRange(found.row, 10).setValue(expiry);
  return { success: true, token: token, user: { id: row[0], name: row[1], email: row[2], role: row[10] || 'customer', trackingCode: row[11] } };
}

function logoutUser(token) {
  var sh = getSheet(SHEET_USERS);
  var data = sh.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (data[i][8] === token) { sh.getRange(i + 1, 9).setValue(''); break; }
  }
  return { success: true };
}

/* ---------- Đổi mật khẩu (khi đã đăng nhập) ---------- */
function changePassword(token, oldPassword, newPassword) {
  var user = getUserByToken(token);
  if (!user) return { success: false, message: 'Phiên đăng nhập đã hết hạn.' };
  if (!newPassword || newPassword.length < 6) return { success: false, message: 'Mật khẩu mới tối thiểu 6 ký tự.' };

  var sh = getSheet(SHEET_USERS);
  var row = sh.getRange(user.row, 1, 1, sh.getLastColumn()).getValues()[0];
  if (hashPass(oldPassword || '', row[4]) !== row[3]) return { success: false, message: 'Mật khẩu hiện tại không đúng.' };

  var salt = Utilities.getUuid();
  var hash = hashPass(newPassword, salt);
  sh.getRange(user.row, 4).setValue(hash);
  sh.getRange(user.row, 5).setValue(salt);
  return { success: true };
}

/* ---------- Quên mật khẩu (chưa đăng nhập) ---------- */
function sendPasswordResetEmail(email, name, code) {
  var subject = 'Mã đặt lại mật khẩu HoànVí';
  var body = 'Chào ' + name + ',\n\n' +
    'Mã đặt lại mật khẩu HoànVí của bạn là: ' + code + '\n\n' +
    'Mã có hiệu lực trong ' + CODE_TTL_MINUTES + ' phút. Nếu bạn không yêu cầu đặt lại mật khẩu, vui lòng bỏ qua email này.';
  MailApp.sendEmail(email, subject, body);
}

function requestPasswordReset(email) {
  ensureSheets();
  email = (email || '').trim().toLowerCase();
  var found = findUserByEmail(email);
  if (!found) return { success: false, message: 'Email chưa được đăng ký.' };

  var code = genVerifyCode();
  var expiry = new Date(Date.now() + CODE_TTL_MINUTES * 60 * 1000);
  var sh = getSheet(SHEET_USERS);
  sh.getRange(found.row, 7).setValue(code);
  sh.getRange(found.row, 8).setValue(expiry);
  sendPasswordResetEmail(email, found.values[1], code);
  return { success: true, message: 'Đã gửi mã đặt lại mật khẩu đến ' + email + '.' };
}

function resetPassword(email, code, newPassword) {
  ensureSheets();
  email = (email || '').trim().toLowerCase();
  var found = findUserByEmail(email);
  if (!found) return { success: false, message: 'Email chưa được đăng ký.' };
  var row = found.values;
  if (String(row[6]) !== String(code).trim()) return { success: false, message: 'Mã xác nhận không đúng.' };
  if (new Date(row[7]) < new Date()) return { success: false, message: 'Mã xác nhận đã hết hạn, vui lòng gửi lại mã.' };
  if (!newPassword || newPassword.length < 6) return { success: false, message: 'Mật khẩu mới tối thiểu 6 ký tự.' };

  var salt = Utilities.getUuid();
  var hash = hashPass(newPassword, salt);
  var token = Utilities.getUuid();
  var expiry = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  var sh = getSheet(SHEET_USERS);
  sh.getRange(found.row, 4).setValue(hash);
  sh.getRange(found.row, 5).setValue(salt);
  sh.getRange(found.row, 7).setValue('');
  if (row[5] !== true) sh.getRange(found.row, 6).setValue(true); // xác nhận luôn email nếu chưa verify
  sh.getRange(found.row, 9).setValue(token);
  sh.getRange(found.row, 10).setValue(expiry);
  return { success: true, token: token, user: { id: row[0], name: row[1], email: row[2], role: row[10] || 'customer', trackingCode: row[11] } };
}
