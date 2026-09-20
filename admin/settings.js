(()=>{
const U=window.location.origin,K='sb_publishable_PnyJg3CYoApOX69rBw2RLQ_t_jAef27',API=U+'/functions/v1/admin-console-api';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
const css=`
.s-wrap{display:grid;gap:16px}.s-card{background:#fff;border:1px solid #e2e6eb;border-radius:13px;overflow:hidden}.s-head{padding:15px 17px;border-bottom:1px solid #edf0f2;display:flex;justify-content:space-between;align-items:center;gap:12px}.s-head h2{margin:0;color:#071a30;font-size:14px}.s-head small{display:block;color:#94a3b8;font-size:10px;margin-top:4px}.s-body{padding:17px}.s-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.s-field label{display:block;font-size:10px;font-weight:700;color:#64748b;margin-bottom:5px}.s-field input,.s-field select,.s-field textarea{width:100%;padding:9px;border:1px solid #dfe4e9;border-radius:8px;background:#fff;font-size:11px;outline:none;box-sizing:border-box}.s-actions{display:flex;gap:8px;margin-top:13px;flex-wrap:wrap}.s-btn{border:1px solid #dbe1e7;background:#fff;color:#071a30;border-radius:9px;padding:9px 13px;font-weight:700;cursor:pointer}.s-btn.primary{background:#071a30;color:#fff}.s-btn.danger{color:#991b1b;border-color:#fecaca}.s-table{overflow-x:auto}.s-table table{width:100%;border-collapse:collapse}.s-table th,.s-table td{padding:9px 8px;border-bottom:1px solid #edf0f2;text-align:left;font-size:10px;vertical-align:middle}.s-table th{font-size:8px;color:#64748b;text-transform:uppercase;background:#fafbfc}.s-badge{display:inline-block;padding:3px 7px;border-radius:99px;font-size:8px;font-weight:700}.s-on{background:#dcfce7;color:#166534}.s-off{background:#f1f5f9;color:#64748b}.s-msg{font-size:10px;min-height:16px;margin-top:8px;color:#166534}.s-msg.err{color:#991b1b}.s-toggle{display:flex;align-items:center;justify-content:space-between;padding:10px 12px;border:1px solid #edf0f2;border-radius:9px}.s-toggle label{font-size:10px;font-weight:700;color:#334155}.s-toggle input{width:17px;height:17px}.s-note{font-size:10px;color:#94a3b8;margin-top:8px}@media(max-width:760px){.s-grid{grid-template-columns:1fr}.s-head{align-items:flex-start;flex-direction:column}}`;
const style=()=>{if($('s-style'))return;const st=document.createElement('style');st.id='s-style';st.textContent=css;document.head.appendChild(st)};
const $=id=>document.getElementById(id);
async function token(){const c=window.supabase.createClient(U,K);const {data}=await c.auth.getSession();if(!data.session)throw Error('Session expired. Please sign in again.');return data.session.access_token}
async function req(action,method='GET',body=null){const t=await token();const r=await fetch(API+'?action='+encodeURIComponent(action),{method,headers:{apikey:K,Authorization:'Bearer '+t,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});const j=await r.json().catch(()=>({}));if(!r.ok)throw Error(j.error||'Request failed');return j}
function msg(id,text,err=false){const e=$(id);if(!e)return;e.textContent=text||'';e.classList.toggle('err',!!err)}
function card(title,sub,body){return '<section class="s-card"><div class="s-head"><div><h2>'+esc(title)+'</h2><small>'+esc(sub)+'</small></div></div><div class="s-body">'+body+'</div></section>'}
async function whatsapp(){
 const r=await req('settings');const w=r.settings?.whatsapp||{};
 $('sContent').innerHTML=card('WhatsApp','Public form notification recipient',`
 <div class="s-grid"><div class="s-field"><label>Recipient Name</label><input id="waName" value="${esc(w.recipient_name||'HIKJ Security')}"></div><div class="s-field"><label>WhatsApp Phone Number</label><input id="waPhone" value="${esc(w.phone_number||'')}" placeholder="628xxxxxxxxxx"></div></div>
 <div class="s-actions"><button class="s-btn primary" id="waSave">Save Changes</button></div><div class="s-msg" id="waMsg"></div>
 <div class="s-note">Use international format without spaces. This number is used by public visitor, key and package forms.</div>`);
 $('waSave').onclick=async()=>{try{const p=String($('waPhone').value||'').replace(/[^0-9+]/g,'').replace(/^\+/,'');if(!/^62[0-9]{8,15}$/.test(p))throw Error('Use a valid Indonesian WhatsApp number, e.g. 6281234567890.');await req('save_whatsapp','POST',{recipient_name:$('waName').value.trim(),phone_number:p});msg('waMsg','WhatsApp recipient updated.')}catch(e){msg('waMsg',e.message,true)}}
}
async function admins(){
 const r=await req('admin_users');const rows=r.data||[];
 $('sContent').innerHTML=card('Admin Users','Manage access to the Security Admin Console',`
 <div class="s-actions"><button class="s-btn primary" id="addAdmin">Add Admin</button></div>
 <div class="s-table"><table><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Last Login</th><th>Created</th><th>Actions</th></tr></thead><tbody>${rows.length?rows.map(x=>`<tr><td><b>${esc(x.full_name||'—')}</b></td><td>${esc(x.email||'—')}</td><td>${esc(x.role)}</td><td><span class="s-badge ${x.active?'s-on':'s-off'}">${x.active?'ACTIVE':'INACTIVE'}</span></td><td>${esc(x.last_sign_in_at?new Date(x.last_sign_in_at).toLocaleString('en-GB'):'—')}</td><td>${esc(new Date(x.created_at).toLocaleDateString('en-GB'))}</td><td><button class="s-btn" data-admin-edit="${x.user_id}">Edit</button></td></tr>`).join(''):'<tr><td colspan="7">No admin users found.</td></tr>'}</tbody></table></div>`);
 $('addAdmin').onclick=()=>adminDialog();
 document.querySelectorAll('[data-admin-edit]').forEach(b=>b.onclick=()=>adminDialog(rows.find(x=>x.user_id===b.dataset.adminEdit)));
}
function adminDialog(row=null){
 const d=document.createElement('dialog');d.style.cssText='border:0;border-radius:14px;padding:0;width:min(520px,calc(100% - 24px));box-shadow:0 25px 80px #0005';d.innerHTML=`<form method="dialog" class="s-body"><h2 style="margin:0 0 14px;color:#071a30;font-size:16px">${row?'Edit Admin':'Add Admin'}</h2><div class="s-grid"><div class="s-field"><label>Full Name</label><input id="adName" required value="${esc(row?.full_name||'')}"></div><div class="s-field"><label>Email</label><input id="adEmail" type="email" required value="${esc(row?.email||'')}" ${row?'readonly':''}></div><div class="s-field"><label>Role</label><select id="adRole"><option>VIEWER</option><option>ADMIN</option><option>MANAGER</option><option>SUPERADMIN</option></select></div><div class="s-field"><label>${row?'New Password (optional)':'Temporary Password'}</label><input id="adPass" type="password" ${row?'':'required'} minlength="8"></div></div><div class="s-actions"><button type="button" class="s-btn" id="adCancel">Cancel</button><button type="button" class="s-btn primary" id="adSave">Save</button></div><div class="s-msg" id="adMsg"></div></form>`;document.body.appendChild(d);$('adRole').value=row?.role||'VIEWER';d.showModal();$('adCancel').onclick=()=>d.close();$('adSave').onclick=async()=>{try{const body={user_id:row?.user_id,full_name:$('adName').value.trim(),email:$('adEmail').value.trim(),role:$('adRole').value,password:$('adPass').value};if(!body.full_name||!body.email)throw Error('Name and email are required.');if(!row&&!body.password)throw Error('Temporary password is required.');await req(row?'update_admin':'create_admin','POST',body);d.close();await admins()}catch(e){msg('adMsg',e.message,true)}}}
async function keys(){
 const r=await req('key_assets');const rows=r.data||[];
 $('sContent').innerHTML=card('Key Assets','Master inventory for physical hotel keys',`<div class="s-actions"><button class="s-btn primary" id="addKey">Add Key Asset</button></div><div class="s-table"><table><thead><tr><th>Key Number</th><th>Description</th><th>Location / Department</th><th>Quantity</th><th>Status</th><th>Actions</th></tr></thead><tbody>${rows.length?rows.map(x=>`<tr><td><b>${esc(x.key_number)}</b></td><td>${esc(x.key_description||'—')}</td><td>${esc(x.location_department||'—')}</td><td>${esc(x.quantity)}</td><td><span class="s-badge ${x.active?'s-on':'s-off'}">${x.active?'ACTIVE':'INACTIVE'}</span></td><td><button class="s-btn" data-key-edit="${x.id}">Edit</button></td></tr>`).join(''):'<tr><td colspan="6">No key assets configured.</td></tr>'}</tbody></table></div>`);
 $('addKey').onclick=()=>keyDialog();document.querySelectorAll('[data-key-edit]').forEach(b=>b.onclick=()=>keyDialog(rows.find(x=>x.id===b.dataset.keyEdit)));
}
function keyDialog(row=null){
 const d=document.createElement('dialog');
 d.style.cssText='border:0;border-radius:14px;padding:0;width:min(520px,calc(100% - 24px));box-shadow:0 25px 80px #0005';
 d.innerHTML=`<form method="dialog" class="s-body"><h2 style="margin:0 0 14px;color:#071a30;font-size:16px">${row?'Edit Key Asset':'Add Key Asset'}</h2><div class="s-grid"><div class="s-field"><label>Key Number</label><input class="kaNum" required value="${esc(row?.key_number||'')}" ${row?'readonly':''}></div><div class="s-field"><label>Quantity</label><input class="kaQty" type="number" min="1" required value="${esc(row?.quantity||1)}"></div><div class="s-field"><label>Description</label><input class="kaDesc" value="${esc(row?.key_description||'')}"></div><div class="s-field"><label>Location / Department</label><input class="kaLoc" value="${esc(row?.location_department||'')}"></div></div><div class="s-toggle" style="margin-top:12px"><label>Active</label><input class="kaActive" type="checkbox" ${row?.active!==false?'checked':''}></div><div class="s-actions"><button type="button" class="s-btn kaCancel">Cancel</button><button type="button" class="s-btn primary kaSave">Save</button></div><div class="s-msg kaMsg"></div></form>`;
 document.body.appendChild(d);
 const num=d.querySelector('.kaNum'),qty=d.querySelector('.kaQty'),desc=d.querySelector('.kaDesc'),loc=d.querySelector('.kaLoc'),active=d.querySelector('.kaActive'),cancel=d.querySelector('.kaCancel'),save=d.querySelector('.kaSave'),message=d.querySelector('.kaMsg');
 const cleanup=()=>d.remove();
 d.addEventListener('close',cleanup,{once:true});
 d.showModal();
 cancel.onclick=()=>d.close();
 save.onclick=async()=>{
   save.disabled=true;cancel.disabled=true;save.textContent='Saving...';
   try{
     const body={id:row?.id,key_number:num.value.trim(),quantity:Number(qty.value),key_description:desc.value.trim(),location_department:loc.value.trim(),active:active.checked};
     if(!body.key_number)throw Error('Key Number is required.');
     if(!Number.isInteger(body.quantity)||body.quantity<1)throw Error('Quantity must be at least 1.');
     await req(row?'update_key_asset':'create_key_asset','POST',body);
     d.close();
     await keys();
   }catch(e){
     message.textContent=e.message||'Request failed';message.classList.add('err');
     save.disabled=false;cancel.disabled=false;save.textContent='Save';
   }
 }
}
async function operations(){
 const r=await req('settings');const o=r.settings?.operations||{};const fields=[['visitor_entry_enabled','Visitor Entry Registration'],['visitor_exit_enabled','Visitor Exit Registration'],['key_borrowing_enabled','Key Borrowing'],['key_return_enabled','Key Return'],['package_registration_enabled','Package Registration'],['package_distribution_enabled','Package Distribution']];
 $('sContent').innerHTML=card('System / Operations','Enable or disable operational modules',`<div style="display:grid;gap:8px">${fields.map(([k,l])=>`<div class="s-toggle"><label>${l}</label><input type="checkbox" data-op="${k}" ${o[k]!==false?'checked':''}></div>`).join('')}</div><div class="s-actions"><button class="s-btn primary" id="opSave">Save Changes</button></div><div class="s-msg" id="opMsg"></div>`);$('opSave').onclick=async()=>{try{const value={...o};fields.forEach(([k])=>value[k]=document.querySelector('[data-op="'+k+'"]').checked);await req('save_operations','POST',{value});msg('opMsg','Operational settings updated.')}catch(e){msg('opMsg',e.message,true)}}}
async function audit(){const r=await req('audit_logs');const rows=r.data||[];$('sContent').innerHTML=card('Audit Log','Administrative changes and security-sensitive actions',`<div class="s-table"><table><thead><tr><th>Date / Time</th><th>User</th><th>Action</th><th>Module</th><th>Target</th><th>Description</th></tr></thead><tbody>${rows.length?rows.map(x=>`<tr><td>${esc(new Date(x.created_at).toLocaleString('en-GB'))}</td><td>${esc(x.user_name||'—')}</td><td>${esc(x.action)}</td><td>${esc(x.module)}</td><td>${esc(x.target||'—')}</td><td>${esc(x.description||'—')}</td></tr>`).join(''):'<tr><td colspan="6">No audit entries found.</td></tr>'}</tbody></table></div>`)}
async function render(tab='whatsapp'){
 style();$('aPage').innerHTML='<div class="a-head"><div><div class="a-kicker">HIKJ SECURITY</div><h1>Settings</h1><p>System configuration, access control and key inventory</p></div></div><div class="a-tabs">'+['whatsapp','admins','keys','operations','audit'].map((x,i)=>`<button class="${x===tab?'active':''}" data-stab="${x}">${x==='whatsapp'?'WhatsApp':x==='admins'?'Admin Users':x==='keys'?'Key Assets':x==='operations'?'System / Operations':'Audit Log'}</button>`).join('')+'</div><div id="sContent" class="s-wrap"></div>';
 document.querySelectorAll('[data-stab]').forEach(b=>b.onclick=()=>render(b.dataset.stab));
 try{if(tab==='whatsapp')await whatsapp();else if(tab==='admins')await admins();else if(tab==='keys')await keys();else if(tab==='operations')await operations();else await audit()}catch(e){$('sContent').innerHTML='<div class="a-error">'+esc(e.message)+'</div>'}
}
window.HIKJSettingsRender=render;
})();