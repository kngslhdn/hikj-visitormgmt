(()=>{
const U='https://hmqgmusellcetakoalva.supabase.co',K='sb_publishable_J6P-baCAZOoVxj2rHBZMkA_Ux4U5_mQ',API=U+'/functions/v1/admin-console-api';
let session=null,lastPage=null,rows=[];
const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>\"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#039;'}[c]));
const fmt=v=>v?new Date(v).toLocaleString('en-GB',{dateStyle:'short',timeStyle:'short'}):'—';
const badge=(cls,text)=>`<span class="a-badge ${cls}">${esc(text)}</span>`;
async function api(params={}){
 if(!session?.access_token) return {data:[]};
 const q=new URLSearchParams({action:'visitors',limit:'2000',...params});
 const r=await fetch(API+'?'+q,{headers:{apikey:K,Authorization:'Bearer '+session.access_token}});
 const b=await r.json().catch(()=>({}));
 if(!r.ok)throw Error(b.error||'Unable to load visitor records');
 return b;
}
function injectCss(){
 if($('vm-enhance-style'))return;
 const st=document.createElement('style');st.id='vm-enhance-style';st.textContent=`
 .vm-clickable{cursor:pointer}.vm-clickable:hover{background:#f8fafc!important}.vm-clickable td:first-child b{text-decoration:underline;text-decoration-color:#cbd5e1;text-underline-offset:3px}
 #vmDetail{width:min(720px,calc(100vw - 32px));max-width:720px;border:0;border-radius:16px;padding:0;box-shadow:0 24px 80px #0005;color:#111827}
 #vmDetail::backdrop{background:#071a30aa}
 .vm-modal-head{display:flex;justify-content:space-between;align-items:flex-start;padding:20px 22px;border-bottom:1px solid #e5e7eb;background:#fff}.vm-modal-head h2{margin:0;color:#071a30;font-size:20px}.vm-modal-head p{margin:5px 0 0;color:#64748b;font-size:11px}.vm-close{border:1px solid #dbe1e7;background:#fff;border-radius:8px;padding:7px 10px;cursor:pointer;font-weight:700}.vm-detail-grid{display:grid;grid-template-columns:1fr 1fr;gap:0;background:#fff}.vm-detail-item{padding:13px 18px;border-bottom:1px solid #edf0f2}.vm-detail-item:nth-child(odd){border-right:1px solid #edf0f2}.vm-detail-item label{display:block;font-size:9px;text-transform:uppercase;letter-spacing:.7px;color:#94a3b8;font-weight:700;margin-bottom:5px}.vm-detail-item strong{display:block;color:#1e293b;font-size:12px;line-height:1.45;word-break:break-word}.vm-modal-foot{padding:13px 18px;background:#fafbfc;color:#94a3b8;font-size:10px;border-top:1px solid #e5e7eb}@media(max-width:600px){.vm-detail-grid{grid-template-columns:1fr}.vm-detail-item:nth-child(odd){border-right:0}}
 `;document.head.appendChild(st);
}
function ensureModal(){
 if($('vmDetail'))return;
 const d=document.createElement('dialog');d.id='vmDetail';d.innerHTML=`<div class="vm-modal-head"><div><h2>Visitor Entry Detail</h2><p id="vmDetailSub">Complete Visitor Registration record</p></div><button type="button" class="vm-close" id="vmDetailClose">Close</button></div><div id="vmDetailGrid" class="vm-detail-grid"></div><div class="vm-modal-foot">Click Close or press Esc to return to Visitor Monitoring.</div>`;document.body.appendChild(d);$('vmDetailClose').onclick=()=>d.close();d.addEventListener('click',e=>{if(e.target===d)d.close()});
}
function detailField(label,value){return `<div class="vm-detail-item"><label>${esc(label)}</label><strong>${esc(value||'—')}</strong></div>`}
function showDetail(r){
 ensureModal();const v=r.visitor||{},x=r.exit||null;
 $('vmDetailSub').textContent=`${r.exit?'Visitor Exit':'Visitor Entry'} · Submission ${r.submission_id||'—'}`;
 $('vmDetailGrid').innerHTML=[
  detailField('Submission ID',r.submission_id),detailField('Visitor ID',r.visitor_id),
  detailField('Visitor Name',v.full_name),detailField('Phone / Mobile',v.phone),
  detailField('Company',v.company_name),detailField('Category',v.category),
  detailField('Work Location',r.work_location),detailField('Purpose',r.purpose),
  detailField('Pass / Vest Number',r.pass_vest_number),detailField('Security Officer',r.security_officer_name),
  detailField('Entry Date / Time',fmt(r.entry_at)),detailField('Status',r.exit?'EXITED':'INSIDE'),
  detailField('Exit Date / Time',fmt(x?.exit_at)),detailField('Exit Security Officer',x?.security_officer_name)
 ].join('');
 const d=$('vmDetail');if(!d.open)d.showModal();
}
function activeTab(){return document.querySelector('[data-vtab].active')?.dataset.vtab||'Visitor Entry'}
function setStatusForTab(){
 const s=$('vfStatus');if(!s)return;const tab=activeTab();s.value=tab==='Visitor Exit'?'Exited':'Inside';s.disabled=true;
}
function render(data){
 const tab=activeTab();setStatusForTab();rows=tab==='Visitor Exit'?data.filter(x=>x.exit):data.filter(x=>!x.exit);
 const tbody=$('vrows');if(!tbody)return;
 tbody.innerHTML=rows.length?rows.map((x,i)=>{const v=x.visitor||{};return `<tr class="vm-clickable" data-vm-row="${i}" title="Click to view complete visitor registration details"><td><b>${esc(v.full_name||'—')}</b><small>${esc(v.phone||'—')}</small></td><td>${esc(v.company_name||'—')}</td><td>${esc(v.category||'—')}</td><td>${esc(x.work_location||'—')}</td><td>${esc(x.pass_vest_number||'—')}</td><td>${fmt(x.entry_at)}</td><td>${fmt(x.exit?.exit_at)}</td><td>${badge(x.exit?'exit':'entry',x.exit?'EXITED':'INSIDE')}</td></tr>`}).join(''):'<tr><td colspan="8" class="a-empty">No visitors currently inside.</td></tr>';
 tbody.querySelectorAll('[data-vm-row]').forEach(tr=>tr.addEventListener('click',()=>showDetail(rows[Number(tr.dataset.vmRow))]));
 const note=$('vnote');if(note)note.textContent=rows.length+' '+(tab==='Visitor Exit'?'exited visitor':'visitor currently inside')+(rows.length===1?'':'s')+' found.';
}
async function load(){
 if(!$('vrows')||!document.querySelector('[data-vtab]'))return;
 try{
  const r=await api({q:$('vfQ')?.value||'',from:$('vfFrom')?.value||'',to:$('vfTo')?.value?$('vfTo').value+'T23:59:59':''});
  render(r.data||[]);
 }catch(e){const tbody=$('vrows');if(tbody)tbody.innerHTML=`<tr><td colspan="8" class="a-empty">${esc(e.message)}</td></tr>`}
}
function enhance(){
 const h=document.querySelector('#aPage h1');if(!h||h.textContent.trim()!=='Visitor Monitoring')return;
 injectCss();ensureModal();
 if(lastPage===h)return;
 lastPage=h;
 setStatusForTab();
 document.querySelectorAll('[data-vtab]').forEach(b=>b.addEventListener('click',()=>setTimeout(load,50)));
 $('vfApply')?.addEventListener('click',()=>setTimeout(load,50));
 $('vfClear')?.addEventListener('click',()=>setTimeout(load,50));
 $('vr')?.addEventListener('click',()=>setTimeout(load,50));
 load();
}
window.addEventListener('hikj-admin-ready',e=>{session=e.detail?.session||session;setTimeout(enhance,100)});
(async()=>{try{const {data}=await window.supabase.createClient(U,K).auth.getSession();session=data?.session||null;enhance();const mo=new MutationObserver(()=>setTimeout(enhance,20));const target=$('aPage');if(target)mo.observe(target,{childList:true,subtree:true})}catch(e){console.error('Visitor monitoring enhancement:',e)}})();
})();
