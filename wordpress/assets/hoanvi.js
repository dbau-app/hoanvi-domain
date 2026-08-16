(function(){
  'use strict';
  window.HoanViWP = {
    call: function(action, payload){
      var root=document.getElementById('hoanvi-app-root');
      var data={action:action};
      Object.keys(payload||{}).forEach(function(k){data[k]=payload[k];});
      return fetch(root.dataset.ajaxUrl,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded; charset=UTF-8'},body:new URLSearchParams({action:'hoanvi_api',nonce:root.dataset.nonce,payload:JSON.stringify(data)})}).then(function(r){return r.json();});
    }
  };
  var root=document.getElementById('hoanvi-app-root');
  if(root) root.querySelector('.hoanvi-loading').textContent='HoànVí WordPress bridge đã sẵn sàng.';
})();