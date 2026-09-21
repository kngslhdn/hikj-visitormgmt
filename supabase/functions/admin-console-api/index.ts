import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const ALLOWED_ORIGINS=new Set(['https://kngslhdn.github.io','http://192.168.236.132','https://visitor.myhikj.com','http://visitor.myhikj.com','http://localhost:3000','http://127.0.0.1:5500']);
const headers=(req:Request)=>{const origin=req.headers.get('Origin')||'';return {'Access-Control-Allow-Origin':ALLOWED_ORIGINS.has(origin)?origin:'https://kngslhdn.github.io','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Access-Control-Allow-Methods':'GET,POST,OPTIONS','Vary':'Origin','Content-Type':'application/json'}};
const json=(req:Request,b:unknown,s=200)=>new Response(JSON.stringify(b),{status:s,headers:headers(req)});
const sb=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
const limitOf=(v:string|null,d=100,m=5000)=>Math.max(1,Math.min(Number(v||d)||d,m));
const match=(row:any, fields:string[], search:string)=>!search||fields.some(k=>String(row?.[k]??'').toLowerCase().includes(search.toLowerCase()));
const isoEnd=(v:string|null)=>v?v.includes('T')?v:`${v}T23:59:59`:null;

async function admin(req:Request){
  const auth=req.headers.get('Authorization')||'';
  if(!auth.startsWith('Bearer ')) return {error:json(req,{error:'Unauthorized'},401)};
  const token=auth.slice(7);
  const {data:{user},error}=await sb.auth.getUser(token);
  if(error||!user) return {error:json(req,{error:'Unauthorized'},401)};
  const {data:profile,error:pe}=await sb.from('admin_profiles').select('full_name,role,active').eq('user_id',user.id).maybeSingle();
  if(pe) return {error:json(req,{error:'Authorization check failed'},500)};
  const role = String(profile?.role || '').toUpperCase();
  if(!profile?.active || !['ADMIN','MANAGER','SUPERADMIN'].includes(role)) return {error:json(req,{error:'Admin access denied'},403)};
  return {user,profile};
}

async function getReport(req:Request,url:URL){
  const n=limitOf(url.searchParams.get('limit'),5000,5000);
  const from=url.searchParams.get('from'),to=isoEnd(url.searchParams.get('to'));
  const type=url.searchParams.get('type')||'overall';
  const search=(url.searchParams.get('q')||'').trim().toLowerCase();
  const status=(url.searchParams.get('status')||'').trim().toUpperCase();
  const start=from||'1970-01-01T00:00:00Z';
  if(['visitor_summary','key_summary','package_summary'].includes(type)){
    const r=await getOverallRows(start,to);const by=new Map<string,any>();
    for(const x of r){const d=x.event_at.slice(0,10);if(!by.has(d))by.set(d,{date:d,visitor_entry:0,visitor_exit:0,key_borrowing:0,key_return:0,package_registration:0,package_distribution:0});const z=by.get(d);if(z[x.record_type]!==undefined)z[x.record_type]++}
    let rows=[...by.values()].sort((a,b)=>b.date.localeCompare(a.date));
    if(type==='visitor_summary')rows=rows.map(x=>({date:x.date,visitor_entry:x.visitor_entry,visitor_exit:x.visitor_exit}));
    if(type==='key_summary')rows=rows.map(x=>({date:x.date,key_borrowing:x.key_borrowing,key_return:x.key_return}));
    if(type==='package_summary')rows=rows.map(x=>({date:x.date,package_registration:x.package_registration,package_distribution:x.package_distribution}));
    return json(req,{data:rows.slice(0,n),metrics:summaryMetrics(r),analytics:dailyAnalytics(r)});
  }
  let rows=await getOverallRows(start,to);
  if(type&&type!=='overall')rows=rows.filter(x=>x.record_type===type);
  if(search)rows=rows.filter(x=>Object.values(x).some(v=>String(v??'').toLowerCase().includes(search)));
  if(status)rows=rows.filter(x=>String(x.status||'').toUpperCase()===status);
  rows.sort((a,b)=>new Date(b.event_at).getTime()-new Date(a.event_at).getTime());
  return json(req,{data:rows.slice(0,n),metrics:summaryMetrics(rows),analytics:dailyAnalytics(rows)});
}
async function getOverallRows(start:string,to:string|null){
  const [a,b,c,d,e,dist]=await Promise.all([
    sb.from('visitor_entries').select('submission_id,visitor_name_snapshot,company_name_snapshot,visitor_category,entry_at,work_location,pass_vest_number,security_officer_name').gte('entry_at',start).limit(5000),
    sb.from('visitor_exits').select('submission_id,visitor_name,exit_at,security_officer_name,pass_vest_number').gte('exit_at',start).limit(5000),
    sb.from('key_borrowings').select('submission_id,borrower_name,department,key_number,key_description,quantity,security_officer_name,borrowed_at').gte('borrowed_at',start).limit(5000),
    sb.from('key_returns').select('submission_id,return_name,department,key_number,quantity,borrowed_quantity,discrepancy_qty,security_officer_name,returned_at').gte('returned_at',start).limit(5000),
    sb.from('package_registrations').select('submission_id,recipient_name,company_name,courier_name,item_type,item_count,security_officer_name,created_at').gte('created_at',start).limit(5000),
    sb.from('package_distribution_history').select('distribution_number,package_number,registered_recipient_name,recipient_name,company_name,courier_name,security_hand_over,distributed_at,status').gte('distributed_at',start).limit(5000)
  ]);
  const errs=[a,b,c,d,e,dist].filter(x=>x.error);if(errs.length)throw errs[0].error;
  const ids=[...(a.data||[]),...(b.data||[]),...(c.data||[]),...(d.data||[]),...(e.data||[])].map((x:any)=>x.submission_id).filter(Boolean);
  const subMap=new Map<string,string>();
  if(ids.length){const {data:subs,error:se}=await sb.from('submissions').select('id,submission_id').in('id',ids);if(se)throw se;for(const s of subs||[])subMap.set(s.id,s.submission_id)}
  const rows:any[]=[];
  for(const x of a.data||[])if(!to||x.entry_at<to)rows.push({record_type:'visitor_entry',event_at:x.entry_at,reference:subMap.get(x.submission_id)||x.submission_id,person_name:x.visitor_name_snapshot,visitor_name:x.visitor_name_snapshot,company_name:x.company_name_snapshot,status:'COMPLETED',security_officer_name:x.security_officer_name});
  for(const x of b.data||[])if(!to||x.exit_at<to)rows.push({record_type:'visitor_exit',event_at:x.exit_at,reference:subMap.get(x.submission_id)||x.submission_id,person_name:x.visitor_name,visitor_name:x.visitor_name,company_name:null,status:'COMPLETED',security_officer_name:x.security_officer_name});
  for(const x of c.data||[])if(!to||x.borrowed_at<to)rows.push({record_type:'key_borrowing',event_at:x.borrowed_at,reference:subMap.get(x.submission_id)||x.submission_id,person_name:x.borrower_name,department:x.department,key_number:x.key_number,key_description:x.key_description,quantity:x.quantity,status:'BORROWED',security_officer_name:x.security_officer_name});
  for(const x of d.data||[])if(!to||x.returned_at<to)rows.push({record_type:'key_return',event_at:x.returned_at,reference:subMap.get(x.submission_id)||x.submission_id,person_name:x.return_name,department:x.department,key_number:x.key_number,quantity:x.quantity,borrowed_quantity:x.borrowed_quantity,discrepancy_qty:!!x.discrepancy_qty,status:x.discrepancy_qty?'RETURNED · DISCREPANCY QTY':'RETURNED',security_officer_name:x.security_officer_name});
  for(const x of e.data||[])if(!to||x.created_at<to)rows.push({record_type:'package_registration',event_at:x.created_at,reference:subMap.get(x.submission_id)||x.submission_id,person_name:x.recipient_name,recipient_name:x.recipient_name,company_name:x.company_name,department:x.courier_name,status:'REGISTERED',security_officer_name:x.security_officer_name});
  for(const x of dist.data||[])if(!to||x.distributed_at<to)rows.push({record_type:'package_distribution',event_at:x.distributed_at,reference:x.distribution_number,package_number:x.package_number,person_name:x.recipient_name,recipient_name:x.recipient_name,company_name:x.company_name,department:x.security_hand_over,status:x.status,security_officer_name:x.security_hand_over});
  return rows;
}
function summaryMetrics(rows:any[]){const count=(t:string)=>rows.filter(x=>x.record_type===t).length;return {total:rows.length,visitor_entry:count('visitor_entry'),visitor_exit:count('visitor_exit'),key_borrowing:count('key_borrowing'),key_return:count('key_return'),package_registration:count('package_registration'),package_distribution:count('package_distribution')}}
function dailyAnalytics(rows:any[]){const m=new Map<string,number>();for(const x of rows){const d=String(x.event_at).slice(0,10);m.set(d,(m.get(d)||0)+1)}return [...m.entries()].sort((a,b)=>a[0].localeCompare(b[0])).map(([label,total])=>({label:label.slice(5),total}))}


async function superAdmin(req:Request){
  const a=await admin(req);
  if(a.error)return a;
  if(String(a.profile?.role||'').toUpperCase()!=='SUPERADMIN')return {error:json(req,{error:'Super Admin access required'},403)};
  return a;
}
async function audit(a:any,action:string,module:string,target:string,description:string){
  await sb.from('audit_logs').insert({user_id:a.user.id,user_name:a.profile?.full_name||a.user.email,action,module,target:target||null,description:description||null});
}
async function settingsData(){
  const {data,error}=await sb.from('app_settings').select('setting_key,setting_value,active,updated_at').in('setting_key',['whatsapp','operations']);
  if(error)throw error;
  return Object.fromEntries((data||[]).map((x:any)=>[x.setting_key,x.setting_value]));
}
async function settingsAction(req:Request,a:any,action:string){
  if(action==='settings'){return json(req,{settings:await settingsData()})}
  if(action==='save_whatsapp'){
    const b=await req.json(),phone=String(b.phone_number||'').replace(/[^0-9]/g,'');
    if(!/^62[0-9]{8,15}$/.test(phone))return json(req,{error:'Invalid WhatsApp number'},400);
    const {error}=await sb.from('app_settings').update({setting_value:{recipient_name:String(b.recipient_name||'HIKJ Security').trim(),phone_number:phone},updated_by:a.user.id}).eq('setting_key','whatsapp');
    if(error)throw error;await audit(a,'UPDATE','WhatsApp','whatsapp',`Changed recipient number to ${phone}`);return json(req,{ok:true});
  }
  if(action==='save_operations'){
    const b=await req.json(),value=b.value||{};const {error}=await sb.from('app_settings').update({setting_value:value,updated_by:a.user.id}).eq('setting_key','operations');
    if(error)throw error;await audit(a,'UPDATE','System / Operations','operations','Updated operational module settings');return json(req,{ok:true});
  }
  if(action==='admin_users'){
    const {data,error}=await sb.from('admin_profiles').select('user_id,full_name,role,active,created_at,updated_at').order('created_at');
    if(error)throw error;const users=await sb.auth.admin.listUsers({page:1,perPage:1000});if(users.error)throw users.error;const map=new Map((users.data.users||[]).map((u:any)=>[u.id,u]));
    return json(req,{data:(data||[]).map((x:any)=>{const u=map.get(x.user_id);return {...x,email:u?.email||null,last_sign_in_at:u?.last_sign_in_at||null}})});
  }
  if(action==='create_admin'){
    const b=await req.json(),email=String(b.email||'').trim().toLowerCase(),password=String(b.password||''),name=String(b.full_name||'').trim(),role=String(b.role||'VIEWER').toUpperCase();
    if(!email||!name||password.length<8)return json(req,{error:'Name, email and a password of at least 8 characters are required.'},400);
    if(!['VIEWER','ADMIN','MANAGER','SUPERADMIN'].includes(role))return json(req,{error:'Invalid role'},400);
    const created=await sb.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{full_name:name}});
    if(created.error)throw created.error;
    const {error}=await sb.from('admin_profiles').insert({user_id:created.data.user.id,full_name:name,role,active:true});
    if(error){await sb.auth.admin.deleteUser(created.data.user.id);throw error}
    await audit(a,'CREATE','Admin Users',email,`Created ${role} admin account`);return json(req,{ok:true,user_id:created.data.user.id});
  }
  if(action==='update_admin'){
    const b=await req.json(),id=String(b.user_id||''),name=String(b.full_name||'').trim(),role=String(b.role||'VIEWER').toUpperCase(),password=String(b.password||'');
    if(!id||!name||!['VIEWER','ADMIN','MANAGER','SUPERADMIN'].includes(role))return json(req,{error:'Invalid admin update'},400);
    const {error}=await sb.from('admin_profiles').update({full_name:name,role,active:b.active!==false}).eq('user_id',id);if(error)throw error;
    if(password){if(password.length<8)return json(req,{error:'Password must be at least 8 characters.'},400);const u=await sb.auth.admin.updateUserById(id,{password});if(u.error)throw u.error}
    await audit(a,'UPDATE','Admin Users',id,`Updated admin account role to ${role}`);return json(req,{ok:true});
  }
  if(action==='key_assets'){
    const {data,error}=await sb.from('key_assets').select('*').order('key_number');if(error)throw error;return json(req,{data});
  }
  if(action==='create_key_asset'||action==='update_key_asset'){
    const b=await req.json(),key=String(b.key_number||'').trim();const quantity=Number(b.quantity||0);
    if(!key||!Number.isInteger(quantity)||quantity<1)return json(req,{error:'Key number and a positive quantity are required.'},400);
    if(action==='create_key_asset'){const {error}=await sb.from('key_assets').insert({key_number:key,key_description:String(b.key_description||'').trim()||null,location_department:String(b.location_department||'').trim()||null,quantity,active:b.active!==false});if(error)throw error;await audit(a,'CREATE','Key Assets',key,'Created key asset');}
    else{const id=String(b.id||'');const {error}=await sb.from('key_assets').update({key_description:String(b.key_description||'').trim()||null,location_department:String(b.location_department||'').trim()||null,quantity,active:b.active!==false}).eq('id',id);if(error)throw error;await audit(a,'UPDATE','Key Assets',id,'Updated key asset');}
    return json(req,{ok:true});
  }
  if(action==='audit_logs'){
    const {data,error}=await sb.from('audit_logs').select('*').order('created_at',{ascending:false}).limit(500);if(error)throw error;return json(req,{data});
  }
  return null;
}

Deno.serve(async req=>{
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers:headers(req)});if(!['GET','POST'].includes(req.method))return json(req,{error:'Method not allowed'},405);
  try{
    const auth=await admin(req);if(auth.error)return auth.error;const url=new URL(req.url),action=url.searchParams.get('action')||'summary';if(['settings','admin_users','key_assets','audit_logs'].includes(action)){const sa=await superAdmin(req);if(sa.error)return sa.error;const r=await settingsAction(req,sa,action);if(r)return r;return json(req,{error:'Unknown action'},400)}if(req.method==='POST'){const sa=await superAdmin(req);if(sa.error)return sa.error;const r=await settingsAction(req,sa,action);if(r)return r;return json(req,{error:'Unknown action'},400);}
    if(action==='summary'){
      const d=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Jakarta',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
      const since=new Date(d+'T00:00:00+07:00');
      const [v,e,x,b,r,p,inside,keys,keyTransactions,sub,distAll,distToday,totalPackages]=await Promise.all([
        sb.from('visitors').select('id',{count:'exact',head:true}),
        sb.from('visitor_entries').select('id',{count:'exact',head:true}).gte('entry_at',since.toISOString()),
        sb.from('visitor_exits').select('id',{count:'exact',head:true}).gte('exit_at',since.toISOString()),
        sb.from('key_borrowings').select('id',{count:'exact',head:true}).gte('borrowed_at',since.toISOString()),
        sb.from('key_returns').select('id',{count:'exact',head:true}).gte('returned_at',since.toISOString()),
        sb.from('package_registrations').select('id',{count:'exact',head:true}).gte('created_at',since.toISOString()),
        sb.from('currently_inside').select('entry_id,entry_at',{count:'exact'}),
        sb.from('outstanding_keys').select('borrowing_id,outstanding_quantity,status,discrepancy'),
        sb.from('key_control_transactions').select('borrowing_id,outstanding_quantity,returned_quantity,status,expected_return_at,discrepancy'),
        sb.from('submissions').select('id',{count:'exact',head:true}),
        sb.from('package_distributions').select('id',{count:'exact',head:true}),
        sb.from('package_distributions').select('id',{count:'exact',head:true}).gte('distributed_at',since.toISOString()),
        sb.from('package_registrations').select('id',{count:'exact',head:true})
      ]);
      const errs=[v,e,x,b,r,p,inside,keys,keyTransactions,sub,distAll,distToday,totalPackages].filter(x=>x.error);if(errs.length)throw errs[0].error;
      const outstandingRows=keys.data||[];
      const transactionRows=keyTransactions.data||[];
      const insideRows=inside.data||[];
      const overstayCutoff=Date.now()-24*60*60*1000;
      const overstayVisitors=insideRows.filter((row:any)=>row.entry_at&&new Date(row.entry_at).getTime()<=overstayCutoff);
      const overdueRows=transactionRows.filter(row=>row.status==='OUTSTANDING');
      const borrowedRows=transactionRows.filter(row=>row.status==='BORROWED');
      const outstandingQty=overdueRows.reduce((n,row)=>n+Number(row.outstanding_quantity||0),0);
      const discrepancyKeys=transactionRows.filter(row=>!!row.discrepancy).length;
      const partialKeys=transactionRows.filter(row=>Number(row.returned_quantity||0)>0&&Number(row.outstanding_quantity||0)>0).length;
      const ready=Math.max((totalPackages.count||0)-(distAll.count||0),0);
      return json(req,{profile:auth.profile,summary:{total_visitors:v.count||0,today_entry:e.count||0,today_exit:x.count||0,currently_inside:inside.count||0,visitor_overstay:overstayVisitors.length,today_key_borrowing:b.count||0,today_key_return:r.count||0,today_packages:p.count||0,outstanding_keys:outstandingQty,outstanding_key_transactions:overdueRows.length,borrowed_keys:borrowedRows.reduce((n,row)=>n+Number(row.outstanding_quantity||0),0),active_key_transactions:transactionRows.filter(row=>Number(row.outstanding_quantity||0)>0).length,discrepancy_keys:discrepancyKeys,partial_key_transactions:partialKeys,total_submissions:sub.count||0,total_packages:totalPackages.count||0,distributed_packages:distAll.count||0,distributed_packages_today:distToday.count||0,ready_packages:ready}});
    }
    if(action==='activity'){const n=limitOf(url.searchParams.get('limit'),100,500);const {data,error}=await sb.from('recent_activity').select('*').order('submitted_at',{ascending:false}).limit(n);if(error)throw error;return json(req,{data:data||[]})}
    if(action==='inside'){const n=limitOf(url.searchParams.get('limit'),500,1000);const {data,error}=await sb.from('currently_inside').select('*').order('entry_at',{ascending:false}).limit(n);if(error)throw error;return json(req,{data:data||[]})}
    if(action==='keys'){
      const n=limitOf(url.searchParams.get('limit'),500,1000);
      const {data,error}=await sb.from('outstanding_keys').select('*').order('borrowed_at',{ascending:false}).limit(n);
      if(error)throw error;
      const rows=(data||[]).map((x:any)=>({...x,quantity:Number(x.outstanding_quantity||0)}));
      return json(req,{data:rows});
    }
    if(action==='key_history'){
      const n=limitOf(url.searchParams.get('limit'),5000,5000),q=(url.searchParams.get('q')||'').trim().toLowerCase(),from=url.searchParams.get('from'),to=isoEnd(url.searchParams.get('to')),statusParam=(url.searchParams.get('status')||'').trim().toUpperCase(),status=statusParam==='ALL STATUS'?'':statusParam;
      const [br,rr]=await Promise.all([
        sb.from('key_control_transactions').select('*').order('borrowed_at',{ascending:false}).limit(n),
        sb.from('key_return_events').select('*').order('returned_at',{ascending:false}).limit(n)
      ]);
      if(br.error)throw br.error;if(rr.error)throw rr.error;
      const returns=rr.data||[];
      let tx=(br.data||[]).filter((x:any)=>!from||x.borrowed_at>=from).filter((x:any)=>!to||x.borrowed_at<to);
      const byId=new Map<string,any[]>();
      for(const r of returns){if(!byId.has(r.borrowing_id))byId.set(r.borrowing_id,[]);byId.get(r.borrowing_id)!.push(r);}
      if(q)tx=tx.filter((x:any)=>{
        const events=byId.get(x.borrowing_id)||[];
        return [x.borrowing_id,x.submission_id,x.borrower_name,x.department,x.key_number,x.key_description,x.borrowed_quantity,x.returned_quantity,x.outstanding_quantity,x.issued_by_security,x.borrowed_at,x.expected_return_at,x.last_returned_at,x.status,x.discrepancy,
          ...events.flatMap((e:any)=>[e.id,e.return_public_id,e.returned_by,e.received_by_security,e.returned_quantity,e.returned_at,e.discrepancy_qty])].some(v=>String(v??'').toLowerCase().includes(q));
      });
      if(status){
        tx=tx.filter((x:any)=>
          status==='OUTSTANDING'?String(x.status||'').toUpperCase()==='OUTSTANDING':
          status==='DISCREPANCY'?!!x.discrepancy:
          String(x.status||'').toUpperCase()===status
        );
      }
      const rows=tx.map((x:any)=>({
        record_type:'key_transaction',
        transaction_id:x.submission_id,
        submission_id:x.submission_id,
        person_name:x.borrower_name,
        department:x.department,
        key_number:x.key_number,
        key_description:x.key_description,
        borrowed_quantity:x.borrowed_quantity,
        returned_quantity:x.returned_quantity,
        outstanding_quantity:x.outstanding_quantity,
        event_at:x.borrowed_at,
        issued_by_security:x.issued_by_security,
        security_officer_name:x.issued_by_security,
        last_returned_at:x.last_returned_at,
        expected_return_at:x.expected_return_at,
        overdue_minutes:x.status==='OUTSTANDING'?Math.max(0,Math.floor((Date.now()-new Date(x.expected_return_at).getTime())/60000)):0,
        status:x.status,
        discrepancy:!!x.discrepancy,
        return_events:(byId.get(x.borrowing_id)||[]).sort((a:any,b:any)=>new Date(b.returned_at).getTime()-new Date(a.returned_at).getTime())
      }));
      return json(req,{data:rows});
    }

    if(action==='packages'){
      const n=limitOf(url.searchParams.get('limit'),200,1000),search=(url.searchParams.get('q')||'').trim().toLowerCase();const {data:packages,error}=await sb.from('package_registrations').select('id,submission_id,courier_name,phone,company_name,item_type,item_count,recipient_type,recipient_name,security_officer_name,photo_storage_path,created_at').order('created_at',{ascending:false}).limit(n);if(error)throw error;const rows=packages||[];const submissionIds=rows.map((x:any)=>x.submission_id).filter(Boolean);const publicMap=new Map<string,string>();if(submissionIds.length){const {data:subs,error:se}=await sb.from('submissions').select('id,submission_id').in('id',submissionIds);if(se)throw se;for(const s of subs||[])publicMap.set(s.id,s.submission_id)}rows.forEach((r:any)=>{r.public_package_id=publicMap.get(r.submission_id)||r.submission_id});const ids=rows.map(x=>x.id);let ds:any[]=[];if(ids.length){const {data,error:de}=await sb.from('package_distributions').select('package_registration_id,recipient_name,security_hand_over,note,distributed_at,status').in('package_registration_id',ids);if(de)throw de;ds=data||[]}const dm=new Map(ds.map(x=>[x.package_registration_id,x]));const filtered:any[]=rows.filter((r:any)=>!search||[r.public_package_id,r.submission_id,r.courier_name,r.phone,r.company_name,r.item_type,r.item_count,r.recipient_type,r.recipient_name,r.security_officer_name,...(()=>{const d=dm.get(r.id)||{};return [d.status,d.recipient_name,d.security_hand_over,d.note,d.distributed_at]})()].some(x=>String(x??'').toLowerCase().includes(search)));for(const r of filtered as any[]){r.submission_id=r.public_package_id;if(r.photo_storage_path){const ss=await sb.storage.from('package-photos').createSignedUrl(r.photo_storage_path,600);if(!ss.error)r.photo_url=ss.data.signedUrl}const drow=dm.get(r.id);r.distribution_status=drow?.status||'READY FOR DISTRIBUTION';r.distributed_to=drow?.recipient_name||null;r.distribution_security_hand_over=drow?.security_hand_over||null;r.distribution_note=drow?.note||null;r.distributed_at=drow?.distributed_at||null}return json(req,{data:filtered});
    }
    if(action==='distribution_history'){const n=limitOf(url.searchParams.get('limit'),200,5000),search=(url.searchParams.get('q')||'').trim().toLowerCase(),from=url.searchParams.get('from'),to=isoEnd(url.searchParams.get('to')),status=url.searchParams.get('status');let q=sb.from('package_distribution_history').select('*').order('distributed_at',{ascending:false}).limit(n);if(from)q=q.gte('distributed_at',from);if(to)q=q.lt('distributed_at',to);if(status)q=q.eq('status',status);const {data,error}=await q;if(error)throw error;const rows=(data||[]).filter(row=>{if(!search)return true;const haystack=[row.distribution_number,row.package_number,row.recipient_name,row.registered_recipient_name,row.company_name,row.courier_name,row.security_hand_over,row.note].join(' ').toLowerCase();return haystack.includes(search)});return json(req,{data:rows.slice(0,n)})}
    if(action==='visitors'){const n=limitOf(url.searchParams.get('limit'),500,2000),search=(url.searchParams.get('q')||'').trim().toLowerCase(),from=url.searchParams.get('from'),to=isoEnd(url.searchParams.get('to'));let q=sb.from('visitor_entries').select('id,submission_id,visitor_id,work_location,purpose,security_officer_name,pass_vest_number,entry_at,exit_id,visitors(full_name,phone,company_name,category)').order('entry_at',{ascending:false}).limit(n);if(from)q=q.gte('entry_at',from);if(to)q=q.lt('entry_at',to);const {data:entries,error}=await q;if(error)throw error;const {data:exits,error:xe}=await sb.from('visitor_exits').select('id,submission_id,entry_id,exit_at,security_officer_name').limit(n);if(xe)throw xe;const em=new Map((exits||[]).map(x=>[x.entry_id,x]));const submissionIds=[...(entries||[]),...(exits||[])].map((x:any)=>x.submission_id).filter(Boolean);const publicMap=new Map<string,string>();if(submissionIds.length){const {data:subs,error:se}=await sb.from('submissions').select('id,submission_id').in('id',submissionIds);if(se)throw se;for(const s of subs||[])publicMap.set(s.id,s.submission_id)}const data=(entries||[]).map(en=>{const v=Array.isArray(en.visitors)?en.visitors[0]:en.visitors;const ex=em.get(en.id)||null;return {...en,submission_id:publicMap.get(en.submission_id)||en.submission_id,visitor:v,exit:ex?{...ex,submission_id:publicMap.get(ex.submission_id)||ex.submission_id}:null}}).filter(en=>{if(!search)return true;const v=en.visitor||{},x=en.exit||{};return [en.id,en.submission_id,v.full_name,v.phone,v.company_name,v.category,en.work_location,en.purpose,en.security_officer_name,en.pass_vest_number,en.entry_at,x.id,x.submission_id,x.exit_at,x.security_officer_name].some(v=>String(v??'').toLowerCase().includes(search))});return json(req,{data})}
    if(action==='report')return await getReport(req,url);
    return json(req,{error:'Unknown action'},400);
  }catch(e){console.error(e);return json(req,{error:e instanceof Error?e.message:'Admin console request failed'},500)}
});
