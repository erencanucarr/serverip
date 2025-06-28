(function(){
  const states=['loading','noip','display','error'];
  function showState(s){states.forEach(st=>{const el=document.getElementById(`state-${st}`);if(el){el.style.display=st===s?'flex':'none';}});}  
  function renderIP(resp){if(resp&&resp.ip){const badge=document.getElementById('ip-badge');badge.textContent=resp.ip; if(resp.color){badge.style.backgroundColor=resp.color;} if(resp.mnem){document.getElementById('ip-mnemonic').textContent=resp.mnem;} showState('display');}else{showState('noip');}}
  function requestIP(){showState('loading'); chrome.tabs.query({active:true,currentWindow:true},tabs=>{if(!tabs||!tabs.length){showState('error');return;} const url=tabs[0].url||''; chrome.runtime.sendMessage({action:'getIP',url:url},resp=>{if(chrome.runtime.lastError){showState('error');return;} renderIP(resp);});});}
  document.addEventListener('DOMContentLoaded',()=>{document.getElementById('btn-retry').addEventListener('click',requestIP); requestIP();});})();
