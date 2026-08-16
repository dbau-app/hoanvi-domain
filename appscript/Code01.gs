/* =========================================================
   HOÀNVÍ — Backend (Google Apps Script + Google Sheets)
   Google Sheets = database. Apps Script = public Web App/API + mail + Shopee.

   IMPORTANT DEPLOYMENT
   - Execute as: Me
   - Who has access: Anyone
   - Do NOT require users to sign in with Google.

   This removes the Google multi-account dependency for the public HoànVí login.
   Users authenticate with HoànVí email/password stored in the Users sheet.
   ========================================================= */

var SHEET_USERS = 'Users';
var SHEET_LINKS = 'Links';
var SHEET_WD = 'Withdrawals';
var SHEET_TX = 'Transactions';

var SHOPEE_AFFILIATE_ID = '17355030107';
var USER_SHARE_RATE = 0.85;
var PLATFORM_FEE_RATE = 0.01;
var PERSONAL_INCOME_TAX_RATE = 0.10;
var MIN_WITHDRAW = 50000;
var CODE_TTL_MINUTES = 10;

// Session HoànVí không tự hết hạn.
// Không lưu password dạng plain text trên trình duyệt.
var PERSISTENT_LOGIN = true;

/* ---------- Web app ---------- */
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
    Users: ['ID','Name','Email','PasswordHash','Salt','Verified','VerifyCode','VerifyExpiry','Token','TokenExpiry','Role','TrackingCode','CreatedAt'],
    Links: ['ID','UserId','OriginalUrl','CleanUrl','AffiliateUrl','SubId','Status','GrossCommission','NetCommission','UserCommission','AdminCommission','CreatedAt','UpdatedAt','ProductName','ProductImage'],
    Withdrawals: ['ID','UserId','Amount','Bank','Account','Holder','Status','CreatedAt'],
    Transactions: ['ID','UserId','Type','Amount','Sign','Date','RelatedId']
  };

  Object.keys(specs).forEach(function(name) {
    var sh = ss.getSheetByName(name);
    if (!sh) {
      sh = ss.insertSheet(name);
      sh.appendRow(specs[name]);
      sh.setFrozenRows(1);
      return;
    }
    var lastCol = sh.getLastColumn();
    var headers = lastCol > 0 ? sh.getRange(1,1,1,lastCol).getValues()[0].map(function(v){return String(v).trim();}) : [];
    specs[name].forEach(function(header) {
      if (headers.indexOf(header) === -1) {
        sh.getRange(1, sh.getLastColumn()+1).setValue(header);
        headers.push(header);
      }
    });
    if (sh.getFrozenRows() < 1) sh.setFrozenRows(1);
  });
}

function getSheet(name) { return SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name); }

/* ---------- Helpers ---------- */
function genId(prefix, len) {
  var chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789', s = '';
  for (var i=0; i<(len||6); i++) s += chars[Math.floor(Math.random()*chars.length)];
  return (prefix||'') + s;
}
function genVerifyCode() { return String(Math.floor(100000 + Math.random()*900000)); }
function hashPass(password, salt) {
  var raw = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, password + salt);
  return raw.map(function(b){ var v=(b<0?b+256:b).toString(16); return v.length===1?'0'+v:v; }).join('');
}
function isValidEmail(email) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email); }
function findUserByEmail(email) {
  var data=getSheet(SHEET_USERS).getDataRange().getValues();
  for(var i=1;i<data.length;i++) if(String(data[i][2]).toLowerCase()===String(email).toLowerCase()) return {row:i+1,values:data[i]};
  return null;
}

/*
 * IMPORTANT:
 * TokenExpiry is retained in the sheet for compatibility with old data,
 * but is NO LONGER checked. A HoànVí token remains valid until logout,
 * password reset/change, or another explicit token revocation.
 */
function getUserByToken(token) {
  if (!token) return null;
  var data=getSheet(SHEET_USERS).getDataRange().getValues();
  for(var i=1;i<data.length;i++) {
    if(data[i][8] && data[i][8]===token) {
      return {row:i+1,id:data[i][0],name:data[i][1],email:data[i][2],role:data[i][10]||'customer',trackingCode:data[i][11]};
    }
  }
  return null;
}
function requireAdmin(token) { var u=getUserByToken(token); return u && u.role==='admin' ? u : null; }
function formatDate(d) {
  if(!(d instanceof Date)) d=new Date(d);
  return Utilities.formatDate(d, Session.getScriptTimeZone() || 'Asia/Ho_Chi_Minh','dd/MM/yyyy HH:mm');
}
function sendVerificationEmail(email,name,code) {
  MailApp.sendEmail(email,'Mã xác nhận HoànVí của bạn','Chào '+name+',\n\nMã xác nhận tài khoản HoànVí của bạn là: '+code+'\n\nMã có hiệu lực trong '+CODE_TTL_MINUTES+' phút.');
}
