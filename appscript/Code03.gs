/* ---------- Shopee: làm sạch link + gắn affiliate theo đúng chuẩn an_redir ---------- */

function isShopeeHost(url) {
  var m = String(url || '').match(/^https?:\/\/([^\/]+)/i);
  var host = m ? m[1].toLowerCase().split(':')[0] : '';
  return /(^|\.)shopee\.vn$/.test(host) || /(^|\.)shopee\.co\.vn$/.test(host) || /(^|\.)s\.shopee\.vn$/.test(host) || /(^|\.)shope\.ee$/.test(host) || /(^|\.)shp\.ee$/.test(host) || /(^|\.)shpee\.vn$/.test(host);
}
function looksLikeUrl(url) { return /^https?:\/\/[^\s]+\.[^\s]+/i.test(url); }
function normalizeUrlInput(url) { url=(url||'').trim(); if(!/^https?:\/\//i.test(url)) url='https://'+url; return url; }
function extractOriginLink(url) { var m=String(url||'').match(/[?&]origin_link=([^&]+)/i); if(!m)return null; try{return decodeURIComponent(m[1]);}catch(e){return m[1];} }
function extractShopItem(url) {
  url=String(url||'');
  var m1=url.match(/-i\.(\d+)\.(\d+)/i); if(m1)return{shopId:m1[1],itemId:m1[2]};
  var m2=url.match(/\/product\/(\d+)\/(\d+)/i); if(m2)return{shopId:m2[1],itemId:m2[2]};
  var mShop=url.match(/[?&]shopid=(\d+)/i),mItem=url.match(/[?&]itemid=(\d+)/i); if(mShop&&mItem)return{shopId:mShop[1],itemId:mItem[1]};
  return null;
}
function absoluteUrl(base,loc){
  if(!loc)return''; loc=String(loc).trim().replace(/^[\'"]|[\'"]$/g,'');
  if(/^https?:\/\//i.test(loc))return loc;
  var m=String(base).match(/^(https?:\/\/[^\/]+)/i); if(!m)return loc;
  if(loc.indexOf('//')===0)return m[1].split(':')[0]+':'+loc;
  if(loc.charAt(0)==='/')return m[1]+loc;
  return m[1]+'/'+loc;
}
function extractHtmlUrl(html,baseUrl,names){
  html=String(html||'');
  for(var i=0;i<names.length;i++){
    var n=names[i].replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
    var re1=new RegExp('<meta[^>]+(?:property|name)=[\'\"]'+n+'[\'\"][^>]+content=[\'\"]([^\'\"]+)','i');
    var re2=new RegExp('<meta[^>]+content=[\'\"]([^\'\"]+)[\'\"][^>]+(?:property|name)=[\'\"]'+n+'[\'\"]','i');
    var m=html.match(re1)||html.match(re2); if(m&&m[1])return absoluteUrl(baseUrl,decodeHtmlEntities(m[1]));
  }
  return '';
}

/* Short-link Shopee có thể trả HTML/JS thay vì 301/302. */
function resolveShopeeHtmlDestination(url){
  try{
    var res=UrlFetchApp.fetch(url,{method:'get',followRedirects:true,muteHttpExceptions:true,headers:{'User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131 Safari/537.36','Accept':'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8','Accept-Language':'vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7'}});
    var html=res.getContentText()||'';
    var canonical=extractHtmlUrl(html,url,['og:url','twitter:url']);
    if(canonical&&canonical!==url)return canonical;
    var linkCanonical=html.match(/<link[^>]+rel=[\'\"]canonical[\'\"][^>]+href=[\'\"]([^\'\"]+)/i)||html.match(/<link[^>]+href=[\'\"]([^\'\"]+)[\'\"][^>]+rel=[\'\"]canonical[\'\"]/i);
    if(linkCanonical&&linkCanonical[1])return absoluteUrl(url,decodeHtmlEntities(linkCanonical[1]));
    var product=extractShopItem(html); if(product)return'https://shopee.vn/product/'+product.shopId+'/'+product.itemId;
    var patterns=[/(?:redirect|target|url|redirectUrl|canonicalUrl)\s*[:=]\s*[\'\"](https?:\/\/[^\'\"\\]+)/i,/https?:\\?\/\\?\/shopee\.vn\/[^\'\"\s\\]+/i];
    for(var i=0;i<patterns.length;i++){var m=html.match(patterns[i]);if(m){var c=(m[1]||m[0]).replace(/\\\//g,'/');if(isShopeeHost(c)||/shopee\.vn/i.test(c))return c;}}
  }catch(e){}
  return '';
}
function resolveRedirect(url,maxHops){
  var current=url;
  for(var i=0;i<(maxHops||5);i++){
    var res; try{res=UrlFetchApp.fetch(current,{followRedirects:false,muteHttpExceptions:true,headers:{'User-Agent':'Mozilla/5.0 Chrome/131 Safari/537.36','Accept':'*/*'}});}catch(e){break;}
    var code=res.getResponseCode();
    if(code>=300&&code<400){var h=res.getAllHeaders(),loc=h['Location']||h['location'];if(Array.isArray(loc))loc=loc[0];if(!loc)break;current=absoluteUrl(current,loc);continue;}
    break;
  }
  return current;
}
function cleanShopeeLink(rawUrl){
  var url=normalizeUrlInput(rawUrl); if(!looksLikeUrl(url))return null;
  var cache=CacheService.getScriptCache(),cacheKey='shopee_clean_'+Utilities.base64EncodeWebSafe(url).slice(0,180),cached=cache.get(cacheKey); if(cached)return cached;
  for(var iter=0;iter<5;iter++){
    var origin=extractOriginLink(url); if(origin){url=normalizeUrlInput(origin);continue;}
    var item=extractShopItem(url); if(item){var canonical='https://shopee.vn/product/'+item.shopId+'/'+item.itemId;cache.put(cacheKey,canonical,21600);return canonical;}
    var resolved=resolveRedirect(url,4); if(resolved!==url){url=resolved;continue;}
    var htmlDestination=resolveShopeeHtmlDestination(url); if(htmlDestination&&htmlDestination!==url){url=htmlDestination;continue;}
    break;
  }
  if(!isShopeeHost(url))return null;
  var clean=url.split('#')[0].split('?')[0]; cache.put(cacheKey,clean,21600); return clean;
}
function buildSubId(userTrackingCode){return[userTrackingCode,'0','0','0','0'].join('-');}
function toAffiliateLink(cleanUrl,subId){return'https://s.shopee.vn/an_redir?origin_link='+encodeURIComponent(cleanUrl)+'&affiliate_id='+SHOPEE_AFFILIATE_ID+'&sub_id='+subId;}
