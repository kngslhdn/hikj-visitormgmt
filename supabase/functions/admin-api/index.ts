import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const ALLOWED_ORIGINS=new Set(['https://kngslhdn.github.io','http://localhost:3000','http://127.0.0.1:5500']);
const headers=(req:Request)=>{const origin=req.headers.get('Origin')||'';return {'Access-Control-Allow-Origin':ALLOWED_ORIGINS.has(origin)?origin:'https://kngslhdn.github.io','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Access-Control-Allow-Methods':'GET,OPTIONS','Vary':'Origin','Content-Type':'application/json'}};
const json=(req:Request,b:unknown,s=200)=>new Response(JSON.stringify(b),{status:s,headers:headers(req)});
const sb=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
const limitOf=(v:string|null,d=100,m=5000)=>Math.max(1,Math.min(Number(v||d)||d,m));
const like=(v:string)=>`%${v.replace(/[\\%_]/g,'\\$&')}%`;

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

Deno.serve(async req=>{
  if(req.method==='OPTIONS') return new Response(null,{status:204,headers:headers(req)});
  if(req.method!=='GET') return json(req,{error:'Method not allowed'},405);
  try{
    const auth=await admin(req); if(auth.error) return auth.error;
    const url=new URL(req.url),action=url.searchParams.get('action')||'summary';

    if(action==='summary'){
      const since=new Date(); since.setHours(0,0,0,0);
      const [v,e,x,b,r,p,inside,keys,sub,distAll,distToday]=await Promise.all([
        sb.from('visitors').select('id',{count:'exact',head:true}),
        sb.from('visitor_entries').select('id',{count:'exact',head:true}).gte('entry_at',since.toISOString()),
        sb.from('visitor_exits').select('id',{count:'exact',head:true}).gte('exit_at',since.toISOString()),
        sb.from('key_borrowings').select('id',{count:'exact',head:true}).gte('borrowed_at',since.toISOString()),
        sb.from('key_returns').select('id',{count:'exact',head:true}).gte('returned_at',since.toISOString()),
        sb.from('package_registrations').select('id',{count:'exact',head:true}).gte('created_at',since.toISOString()),
        sb.from('currently_inside').select('entry_id',{count:'exact',head:true}),
        sb.from('outstanding_keys').select('borrowing_id',{count:'exact',head:true}),
        sb.from('submissions').select('id',{count:'exact',head:true}),
        sb.from('package_distributions').select('id',{count:'exact',head:true}),
        sb.from('package_distributions').select('id',{count:'exact',head:true}).gte('distributed_at',since.toISOString())
      ]);
      const errs=[v,e,x,b,r,p,inside,keys,sub,distAll,distToday].filter(x=>x.error); if(errs.length) throw errs[0].error;
      const totalPackages=await sb.from('package_registrations').select('id',{count:'exact',head:true});
      if(totalPackages.error) throw totalPackages.error;
      const readyPackages=Math.max((totalPackages.count||0)-(distAll.count||0),0);
      return json(req,{profile:auth.profile,summary:{total_visitors:v.count||0,today_entry:e.count||0,today_exit:x.count||0,currently_inside:inside.count||0,today_key_borrowing:b.count||0,today_key_return:r.count||0,today_packages:p.count||0,outstanding_keys:keys.count||0,total_submissions:sub.count||0,total_packages:totalPackages.count||0,distributed_packages:distAll.count||0,distributed_packages_today:distToday.count||0,ready_packages:readyPackages}});
    }

    if(action==='activity'){
      const n=limitOf(url.searchParams.get('limit'),100,500);
      const {data,error}=await sb.from('recent_activity').select('*').order('submitted_at',{ascending:false}).limit(n);
      if(error) throw error; return json(req,{data:data||[]});
    }
    if(action==='inside'){
      const n=limitOf(url.searchParams.get('limit'),500,1000);
      const {data,error}=await sb.from('currently_inside').select('*').order('entry_at',{ascending:false}).limit(n);
      if(error) throw error; return json(req,{data:data||[]});
    }
    if(action==='keys'){
      const n=limitOf(url.searchParams.get('limit'),500,1000);
      const {data,error}=await sb.from('outstanding_keys').select('*').order('borrowed_at',{ascending:false}).limit(n);
      if(error) throw error; return json(req,{data:data||[]});
    }
    if(action==='packages'){
      const n=limitOf(url.searchParams.get('limit'),200,1000),search=(url.searchParams.get('q')||'').trim().toLowerCase();
      const {data:packages,error}=await sb.from('package_registrations').select('id,submission_id,courier_name,phone,company_name,item_type,item_count,recipient_type,recipient_name,security_officer_name,photo_storage_path,created_at').order('created_at',{ascending:false}).limit(n);
      if(error) throw error;
      const rows=packages||[];
      const ids=rows.map(x=>x.id);
      let distributions:any[]=[];
      if(ids.length){
        const {data,error:de}=await sb.from('package_distributions').select('package_registration_id,recipient_name,security_hand_over,distributed_at,status').in('package_registration_id',ids);
        if(de) throw de; distributions=data||[];
      }
      const dmap=new Map(distributions.map(x=>[x.package_registration_id,x]));
      const filtered:any[] = rows.filter((row:any)=>{
        if(!search)return true;
        return [row.submission_id,row.courier_name,row.phone,row.company_name,row.item_type,row.recipient_type,row.recipient_name,row.security_officer_name].some(x=>String(x||'').toLowerCase().includes(search));
      });
      for(const row of filtered as any[]){
        if(row.photo_storage_path){const s=await sb.storage.from('package-photos').createSignedUrl(row.photo_storage_path,600);if(!s.error) row.photo_url=s.data.signedUrl;}
        const d=dmap.get(row.id);
        row.distribution_status=d?.status||'READY FOR DISTRIBUTION';
        row.distributed_to=d?.recipient_name||null;
        row.distribution_security_hand_over=d?.security_hand_over||null;
        row.distributed_at=d?.distributed_at||null;
      }
      return json(req,{data:filtered});
    }
    if(action==='distribution_history'){
      const n=limitOf(url.searchParams.get('limit'),200,5000),search=(url.searchParams.get('q')||'').trim();
      const from=url.searchParams.get('from'),to=url.searchParams.get('to'),status=url.searchParams.get('status');
      let q=sb.from('package_distribution_history').select('*').order('distributed_at',{ascending:false}).limit(n);
      if(from) q=q.gte('distributed_at',from);
      if(to) q=q.lt('distributed_at',to);
      if(status) q=q.eq('status',status);
      if(search){const p=like(search);q=q.or(`package_number.ilike.${p},recipient_name.ilike.${p},registered_recipient_name.ilike.${p},company_name.ilike.${p},courier_name.ilike.${p},security_hand_over.ilike.${p}`)}
      const {data,error}=await q;if(error)throw error;
      return json(req,{data:data||[]});
    }
    if(action==='visitors'){
      const n=limitOf(url.searchParams.get('limit'),500,2000),search=(url.searchParams.get('q')||'').trim().toLowerCase();
      const from=url.searchParams.get('from'),to=url.searchParams.get('to');
      let q=sb.from('visitor_entries').select('id,visitor_id,work_location,purpose,security_officer_name,pass_vest_number,entry_at,exit_id,visitors(full_name,phone,company_name,category)').order('entry_at',{ascending:false}).limit(n);
      if(from) q=q.gte('entry_at',from); if(to) q=q.lt('entry_at',to);
      const {data:entries,error}=await q; if(error) throw error;
      const {data:exits,error:xe}=await sb.from('visitor_exits').select('id,entry_id,exit_at,security_officer_name').limit(n); if(xe) throw xe;
      const exitMap=new Map((exits||[]).map(x=>[x.entry_id,x]));
      const data=(entries||[]).map(e=>{const v=Array.isArray(e.visitors)?e.visitors[0]:e.visitors;const x=exitMap.get(e.id)||null;return {...e,visitor:v,exit:x}}).filter(e=>{if(!search)return true;const v=e.visitor||{};return [v.full_name,v.phone,v.company_name,e.pass_vest_number,e.work_location].some(x=>String(x||'').toLowerCase().includes(search));});
      return json(req,{data});
    }
    if(action==='report'){
      const n=limitOf(url.searchParams.get('limit'),5000,5000),from=url.searchParams.get('from'),to=url.searchParams.get('to'),type=url.searchParams.get('type');
      let q=sb.from('recent_activity').select('*').order('submitted_at',{ascending:false}).limit(n);
      if(from) q=q.gte('submitted_at',from); if(to) q=q.lt('submitted_at',to); if(type) q=q.eq('submission_type',type);
      const {data,error}=await q; if(error) throw error; return json(req,{data:data||[]});
    }
    return json(req,{error:'Unknown action'},400);
  }catch(e){console.error(e);return json(req,{error:e instanceof Error?e.message:'Dashboard request failed'},500)}
});