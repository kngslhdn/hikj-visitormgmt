import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = {'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Access-Control-Allow-Methods':'GET,OPTIONS'};
const json=(b:unknown,s=200)=>new Response(JSON.stringify(b),{status:s,headers:{...cors,'Content-Type':'application/json'}});
const sb=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

Deno.serve(async req=>{
  if(req.method==='OPTIONS') return new Response('ok',{headers:cors});
  try{
    const auth=req.headers.get('Authorization')||'';
    if(!auth.startsWith('Bearer ')) return json({error:'Unauthorized'},401);
    const token=auth.slice(7);
    const {data:{user},error:ue}=await sb.auth.getUser(token);
    if(ue||!user) return json({error:'Unauthorized'},401);
    const {data:profile}=await sb.from('admin_profiles').select('full_name,role,active').eq('user_id',user.id).maybeSingle();
    if(!profile?.active) return json({error:'Admin access denied'},403);

    const url=new URL(req.url), action=url.searchParams.get('action')||'summary';
    if(action==='summary'){
      const since=new Date(); since.setHours(0,0,0,0);
      const [v,e,x,b,r,p,inside,keys]=await Promise.all([
        sb.from('visitors').select('id',{count:'exact',head:true}),
        sb.from('visitor_entries').select('id',{count:'exact',head:true}).gte('entry_at',since.toISOString()),
        sb.from('visitor_exits').select('id',{count:'exact',head:true}).gte('exit_at',since.toISOString()),
        sb.from('key_borrowings').select('id',{count:'exact',head:true}).gte('borrowed_at',since.toISOString()),
        sb.from('key_returns').select('id',{count:'exact',head:true}).gte('returned_at',since.toISOString()),
        sb.from('package_registrations').select('id',{count:'exact',head:true}).gte('created_at',since.toISOString()),
        sb.from('currently_inside').select('*',{count:'exact',head:true}),
        sb.from('outstanding_keys').select('*',{count:'exact',head:true})
      ]);
      return json({profile,summary:{total_visitors:v.count||0,today_entry:e.count||0,today_exit:x.count||0,currently_inside:inside.count||0,today_key_borrowing:b.count||0,today_key_return:r.count||0,today_packages:p.count||0,outstanding_keys:keys.count||0}});
    }
    if(action==='activity'){
      const limit=Math.min(Number(url.searchParams.get('limit')||100),500);
      const {data,error}=await sb.from('recent_activity').select('*').order('submitted_at',{ascending:false}).limit(limit);
      if(error) throw error; return json({data});
    }
    if(action==='inside'){
      const {data,error}=await sb.from('currently_inside').select('*').order('entry_at',{ascending:false});
      if(error) throw error; return json({data});
    }
    if(action==='keys'){
      const {data,error}=await sb.from('outstanding_keys').select('*').order('borrowed_at',{ascending:false});
      if(error) throw error; return json({data});
    }
    if(action==='report'){
      const from=url.searchParams.get('from'), to=url.searchParams.get('to'), type=url.searchParams.get('type');
      let q=sb.from('recent_activity').select('*').order('submitted_at',{ascending:false});
      if(from) q=q.gte('submitted_at',from); if(to) q=q.lte('submitted_at',to); if(type) q=q.eq('submission_type',type);
      const {data,error}=await q.limit(5000); if(error) throw error; return json({data});
    }
    return json({error:'Unknown action'},400);
  }catch(e){console.error(e);return json({error:e instanceof Error?e.message:'Dashboard request failed'},500)}
});
