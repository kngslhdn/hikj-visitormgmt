/* HIKJ Admin Console loader */
(() => {
  const load=()=>{
    if(document.querySelector('script[data-hikj-admin-v2]')) return;
    const s=document.createElement('script');
    s.src='admin-console-v2.js';
    s.dataset.hikjAdminV2='1';
    s.defer=true;
    document.body.appendChild(s);
  };
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',load,{once:true});
  else load();
})();
