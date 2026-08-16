/* =========================================================
   HOÀNVÍ — HTTP API bridge for WordPress
   WordPress gọi server-to-server tới Apps Script bằng POST JSON.
   Không dùng google.script.run ở WordPress.
   ========================================================= */

function apiJson_(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload || {success:false,message:'Empty response'}))
    .setMimeType(ContentService.MimeType.JSON);
}

function apiParseBody_(e) {
  try {
    if (e && e.postData && e.postData.contents) return JSON.parse(e.postData.contents);
  } catch (err) {}
  return (e && e.parameter) ? e.parameter : {};
}

function apiDispatch_(p) {
  var action = String(p.action || '').trim();
  switch (action) {
    case 'registerUser': return registerUser(p.name, p.email, p.password);
    case 'loginUser': return loginUser(p.email, p.password);
    case 'verifyEmail': return verifyEmail(p.email, p.code);
    case 'resendVerification': return resendVerification(p.email);
    case 'requestPasswordReset': return requestPasswordReset(p.email);
    case 'resetPassword': return resetPassword(p.email, p.code, p.newPassword);
    case 'changePassword': return changePassword(p.token, p.oldPassword, p.newPassword);
    case 'logoutUser': return logoutUser(p.token);
    case 'getDashboard': return getDashboard(p.token);
    case 'createTrackingLink': return createTrackingLink(p.token, p.productUrl);
    case 'getLinkProductMetadata': return getLinkProductMetadata(p.token, p.linkId);
    case 'requestWithdrawal': return requestWithdrawal(p.token, p.amount, p.bank, p.account, p.holder);
    case 'adminGetLinks': return adminGetLinks(p.token);
    case 'adminGetWithdrawals': return adminGetWithdrawals(p.token);
    case 'adminUpdateLinkCommission': return adminUpdateLinkCommission(p.token, p.linkId, p.grossCommission);
    case 'adminCancelLink': return adminCancelLink(p.token, p.linkId);
    case 'adminCompleteWithdrawal': return adminCompleteWithdrawal(p.token, p.withdrawId);
    case 'adminBackfillProductMetadata': return adminBackfillProductMetadata(p.token);
    case 'health': return {success:true,service:'hoanvi-api',time:new Date().toISOString()};
    default: return {success:false,message:'API action không được hỗ trợ.'};
  }
}

function doPost(e) {
  ensureSheets();
  try {
    var p = apiParseBody_(e);
    return apiJson_(apiDispatch_(p));
  } catch (err) {
    return apiJson_({success:false,message:err.message || 'API error'});
  }
}

/*
 * GET health endpoint. Không trả dữ liệu người dùng qua GET.
 */
function apiHealth() { return apiJson_({success:true,service:'hoanvi-api',time:new Date().toISOString()}); }
