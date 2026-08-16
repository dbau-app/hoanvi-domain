/* =========================================================
   HOÀNVÍ — Backend (Google Apps Script + Google Sheets)
   Mở file này từ trong chính Google Sheet dữ liệu của bạn
   (Tiện ích mở rộng > Apps Script) để SpreadsheetApp.getActiveSpreadsheet()
   tự động trỏ đúng vào Sheet đó.

   PHÂN QUYỀN: quyền admin gắn theo tài khoản trong sheet Users
   (cột Role = admin / customer). Tài khoản admin đầu tiên phải
   được gán thủ công (xem hướng dẫn triển khai).

   LINK AFFILIATE: dùng đúng định dạng chính thức của Shopee
   (an_redir) — xem hàm toAffiliateLink() bên dưới.
   ========================================================= */

var SHEET_USERS = 'Users';
var SHEET_LINKS = 'Links';
var SHEET_WD = 'Withdrawals';
var SHEET_TX = 'Transactions';

// Mã Affiliate ID Shopee của bạn (số thuần, không có tiền tố "an_")
var SHOPEE_AFFILIATE_ID = '17355030107';
var USER_SHARE_RATE = 0.85;             // 85% hoa hồng thực nhận trả về thành viên, 15% admin giữ
var PLATFORM_FEE_RATE = 0.01;           // 1% phí sàn trừ trên hoa hồng Shopee duyệt
var PERSONAL_INCOME_TAX_RATE = 0.10;    // 10% thuế TNCN trừ sau phí sàn
var MIN_WITHDRAW = 50000;
var CODE_TTL_MINUTES = 10;

/* ---------- Web app entry point ---------- */
function doGet(e) {
  ensureSheets();
  return HtmlService.createTemplateFromFile('Index')
    .evaluate()
    .setTitle('HoànVí')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

/* ---------- Sheet setup ---------- */
function ensureSheets() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var specs = {
    Users: ['ID', 'Name', 'Email', 'PasswordHash', 'Salt', 'Verified', 'VerifyCode', 'VerifyExpiry', 'Token', 'TokenExpiry', 'Role', 'TrackingCode', 'CreatedAt'],
    // ProductName + ProductImage được thêm ở cuối để KHÔNG làm lệch
    // các cột commission hiện có của sheet Links.
    Links: ['ID', 'UserId', 'OriginalUrl', 'CleanUrl', 'AffiliateUrl', 'SubId', 'Status', 'GrossCommission', 'NetCommission', 'UserCommission', 'AdminCommission', 'CreatedAt', 'UpdatedAt', 'ProductName', 'ProductImage'],
    Withdrawals: ['ID', 'UserId', 'Amount', 'Bank', 'Account', 'Holder', 'Status', 'CreatedAt'],
    Transactions: ['ID', 'UserId', 'Type', 'Amount', 'Sign', 'Date', 'RelatedId']
  };
  Object.keys(specs).forEach(function (name) {
    var sh = ss.getSheetByName(name);
    if (!sh) {
      sh = ss.insertSheet(name);
      sh.appendRow(specs[name]);
      sh.setFrozenRows(1);
      return;
    }

    // Migration an toàn: nếu sheet đã tồn tại từ phiên bản cũ,
    // tự động thêm các header mới ở CUỐI sheet.
    var lastCol = sh.getLastColumn();
    var headers = lastCol > 0
      ? sh.getRange(1, 1, 1, lastCol).getValues()[0].map(function(v){ return String(v).trim(); })
      : [];

    specs[name].forEach(function(header) {
      if (headers.indexOf(header) === -1) {
        sh.getRange(1, sh.getLastColumn() + 1).setValue(header);
        headers.push(header);
      }
    });

    if (sh.getFrozenRows() < 1) sh.setFrozenRows(1);
  });
}

function getSheet(name) {
  return SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
}

/* ---------- Helpers ---------- */
function genId(prefix, len) {
  var chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  var s = '';
  for (var i = 0; i < (len || 6); i++) s += chars[Math.floor(Math.random() * chars.length)];
  return (prefix || '') + s;
}

function genVerifyCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function hashPass(password, salt) {
  var raw = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, password + salt);
  return raw.map(function (b) {
    var v = (b < 0 ? b + 256 : b).toString(16);
    return v.length === 1 ? '0' + v : v;
  }).join('');
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function findUserByEmail(email) {
  var sh = getSheet(SHEET_USERS);
  var data = sh.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][2]).toLowerCase() === String(email).toLowerCase()) return { row: i + 1, values: data[i] };
  }
  return null;
}

function getUserByToken(token) {
  if (!token) return null;
  var sh = getSheet(SHEET_USERS);
  var data = sh.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (data[i][8] && data[i][8] === token) {
      if (new Date(data[i][9]) < new Date()) return null;
      return {
        row: i + 1, id: data[i][0], name: data[i][1], email: data[i][2],
        role: data[i][10] || 'customer', trackingCode: data[i][11]
      };
    }
  }
  return null;
}

function requireAdmin(token) {
  var u = getUserByToken(token);
  if (!u || u.role !== 'admin') return null;
  return u;
}

function formatDate(d) {
  if (!(d instanceof Date)) d = new Date(d);
  return Utilities.formatDate(d, Session.getScriptTimeZone() || 'Asia/Ho_Chi_Minh', 'dd/MM/yyyy HH:mm');
}

function sendVerificationEmail(email, name, code) {
  var subject = 'Mã xác nhận HoànVí của bạn';
  var body = 'Chào ' + name + ',\n\n' +
    'Mã xác nhận tài khoản HoànVí của bạn là: ' + code + '\n\n' +
    'Mã có hiệu lực trong ' + CODE_TTL_MINUTES + ' phút. Nếu bạn không yêu cầu đăng ký, vui lòng bỏ qua email này.';
  MailApp.sendEmail(email, subject, body);
}
