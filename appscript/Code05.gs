function createTrackingLink(token, productUrl) {
  var user = getUserByToken(token);
  if (!user) return { success:false, message:'Phiên đăng nhập đã hết hạn.' };
  if (!productUrl || !productUrl.trim()) return { success:false, message:'Vui lòng dán link sản phẩm.' };
  var url=normalizeUrlInput(productUrl); if(!looksLikeUrl(url)) return {success:false,message:'Link không hợp lệ.'};
  var clean;
  try{clean=cleanShopeeLink(url);}catch(e){return{success:false,message:'Không thể xử lý link này, vui lòng thử lại.'};}
  if(!clean)return{success:false,message:'Link này không dẫn tới Shopee — hệ thống chỉ hỗ trợ link Shopee.'};

  var id=genId('LK-',6),subId=buildSubId(user.trackingCode),affiliateUrl=toAffiliateLink(clean,subId),now=new Date(),map=getLinkColumnMap(),row=[];
  row[map.ID-1]=id;row[map.UserId-1]=user.id;row[map.OriginalUrl-1]=url;row[map.CleanUrl-1]=clean;row[map.AffiliateUrl-1]=affiliateUrl;row[map.SubId-1]=subId;row[map.Status-1]='Chưa có hoa hồng';row[map.GrossCommission-1]=0;row[map.NetCommission-1]=0;row[map.UserCommission-1]=0;row[map.AdminCommission-1]=0;row[map.CreatedAt-1]=now;row[map.UpdatedAt-1]=now;row[map.ProductName-1]='';row[map.ProductImage-1]='';
  var width=getSheet(SHEET_LINKS).getLastColumn();while(row.length<width)row.push('');getSheet(SHEET_LINKS).appendRow(row);

  // Không gọi Shopee metadata ở request chính. Người dùng nhận affiliate link ngay.
  return{success:true,linkId:id,shortLink:affiliateUrl,cleanLink:clean,productName:'',productImage:''};
}

function getLinkProductMetadata(token,linkId){
  var user=getUserByToken(token);if(!user)return{success:false,message:'Phiên đăng nhập đã hết hạn.'};
  var sh=getSheet(SHEET_LINKS),data=sh.getDataRange().getValues(),map=getLinkColumnMap();
  for(var i=1;i<data.length;i++){
    if(String(data[i][map.ID-1])===String(linkId)&&String(data[i][map.UserId-1])===String(user.id)){
      var name=data[i][map.ProductName-1]||'',image=data[i][map.ProductImage-1]||'';
      if(!name||!image){var meta=fetchShopeeProductMetadata(data[i][map.CleanUrl-1]);if(meta.name)name=meta.name;if(meta.image)image=meta.image;sh.getRange(i+1,map.ProductName).setValue(name);sh.getRange(i+1,map.ProductImage).setValue(image);}
      return{success:true,productName:name,productImage:image};
    }
  }
  return{success:false,message:'Không tìm thấy link.'};
}

function getLinksForUser(userId){
  var data=getSheet(SHEET_LINKS).getDataRange().getValues(),map=getLinkColumnMap(),out=[];
  for(var i=1;i<data.length;i++)if(String(data[i][map.UserId-1])===String(userId))out.push({id:data[i][map.ID-1],original:data[i][map.OriginalUrl-1],clean:data[i][map.CleanUrl-1],affiliate:data[i][map.AffiliateUrl-1],subId:data[i][map.SubId-1],status:data[i][map.Status-1],gross:data[i][map.GrossCommission-1],net:data[i][map.NetCommission-1],userShare:data[i][map.UserCommission-1],adminShare:data[i][map.AdminCommission-1],created:formatDate(data[i][map.CreatedAt-1]),productName:data[i][map.ProductName-1]||'',productImage:data[i][map.ProductImage-1]||''});
  return out.reverse();
}
