import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = {'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type, idempotency-key','Access-Control-Allow-Methods':'POST, OPTIONS'};
const supabase=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,'Content-Type':'application/json'}});
const clean=(v:unknown)=>String(v??'').trim().replace(/[<>]/g,'');
const phone=(v:unknown)=>clean(v).replace(/[^0-9+]/g,'').replace(/^0+/,'');
const types:Record<string,string>={entry:'visitor_entry',masuk:'visitor_entry',exit:'visitor_exit',keluar:'visitor_exit',borrowing:'key_borrowing',pinjamKunci:'key_borrowing',return:'key_return',kembaliKunci:'key_return',package:'package_registration',paket:'package_registration'};
const val=(b:any,...keys:string[])=>keys.map(k=>b[k]).find(v=>v!==undefined&&v!==null&&String(v).trim()!=='')??'';

async function visitorIdentity(name:string,mobile:string,company:string,category:string|null){
 const normalized=phone(mobile);
 if(normalized){const {data}=await supabase.from('visitors').select('id').eq('phone_normalized',normalized).maybeSingle();if(data)return data.id;}
 const {data,error}=await supabase.from('visitors').insert({full_name:name,phone:mobile||null,phone_normalized:normalized||null,company_name:company||null,category:category||null}).select('id').single();
 if(error)throw error;return data.id;
}

async function uploadPackagePhoto(dataUrl:string,submissionId:string){
 if(!dataUrl||!dataUrl.startsWith('data:image/'))return null;
 const match=dataUrl.match(/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/);if(!match)return null;
 const bytes=Uint8Array.from(atob(match[2]),c=>c.charCodeAt(0));if(bytes.length>5*1024*1024)throw Error('Package photo exceeds 5 MB');
 const ext=match[1].split('/')[1].replace('jpeg','jpg');const path=`${new Date().toISOString().slice(0,10)}/${submissionId}.${ext}`;
 const {error}=await supabase.storage.from('package-photos').upload(path,bytes,{contentType:match[1],upsert:false});if(error)throw error;return path;
}

Deno.serve(async req=>{
 if(req.method==='OPTIONS')return new Response('ok',{headers:cors});
 if(req.method!=='POST')return json({error:'Method not allowed'},405);
 try{
  const body=await req.json();
  const rawType=clean(body.type||body.form_type);const type=types[rawType]||rawType;
  if(!['visitor_entry','visitor_exit','key_borrowing','key_return','package_registration'].includes(type))return json({error:'Invalid submission type'},400);
  const idem=clean(req.headers.get('idempotency-key')||body.idempotency_key);
  if(idem){const {data}=await supabase.from('submissions').select('submission_id').eq('idempotency_key',idem).maybeSingle();if(data)return json({ok:true,duplicate:true,submission_id:data.submission_id});}

  const name=clean(val(body,'name','visitor_name','nama','returnName','borrowerName','namaPengantar'));
  const mobile=clean(val(body,'phone','mobile_phone','telepon'));
  const company=clean(val(body,'company_name','company','perusahaan'));
  let visitorId:string|null=null;
  if(type==='visitor_entry'||type==='visitor_exit'){
   const pass=clean(val(body,'pass_vest_number','pass'));const officer=clean(val(body,'security_officer_name','security'));
   if(!name||!pass||!officer)return json({error:'Required visitor fields are missing'},400);
   visitorId=await visitorIdentity(name,mobile,company,clean(body.category)||null);
  }

  const submissionId=`HIKJ-${new Date().toISOString().replace(/[-:TZ.]/g,'').slice(0,14)}-${crypto.randomUUID().slice(0,6).toUpperCase()}`;
  const {data:submission,error:se}=await supabase.from('submissions').insert({submission_id:submissionId,submission_type:type,visitor_id:visitorId,status:'submitted',idempotency_key:idem||null,metadata:{source_form:rawType}}).select('id').single();
  if(se)throw se;

  if(type==='visitor_entry'){
   const {error}=await supabase.from('visitor_entries').insert({submission_id:submission.id,visitor_id:visitorId,work_location:clean(val(body,'work_location','lokasi')),purpose:clean(val(body,'purpose','tujuan')),security_officer_name:clean(val(body,'security_officer_name','security')),pass_vest_number:clean(val(body,'pass_vest_number','pass')),entry_at:body.entry_at||body.datetime||new Date().toISOString()});if(error)throw error;
  }else if(type==='visitor_exit'){
   const pass=clean(val(body,'pass_vest_number','pass'));const {data:entry}=await supabase.from('visitor_entries').select('id').eq('pass_vest_number',pass).is('exit_id',null).order('entry_at',{ascending:false}).limit(1).maybeSingle();
   const {data:ex,error}=await supabase.from('visitor_exits').insert({submission_id:submission.id,visitor_id:visitorId,entry_id:entry?.id||null,visitor_name:name,company_name:company||null,pass_vest_number:pass,security_officer_name:clean(val(body,'security_officer_name','security')),exit_at:body.exit_at||body.datetime||new Date().toISOString()}).select('id').single();if(error)throw error;if(entry?.id)await supabase.from('visitor_entries').update({exit_id:ex.id}).eq('id',entry.id);
  }else if(type==='key_borrowing'){
   const {error}=await supabase.from('key_borrowings').insert({submission_id:submission.id,borrower_name:clean(val(body,'borrower_name','borrowerName')),department:clean(body.department),key_number:clean(body.key_number||body.keyNumber),key_description:clean(body.key_description||body.description),quantity:Number(body.quantity||body.qty||1),security_officer_name:clean(val(body,'security_officer_name','security')),borrowed_at:body.borrowed_at||body.datetime||new Date().toISOString()});if(error)throw error;
  }else if(type==='key_return'){
   const key=clean(body.key_number||body.keyNumber);const {data:borrowing}=await supabase.from('key_borrowings').select('id').eq('key_number',key).is('return_id',null).order('borrowed_at',{ascending:false}).limit(1).maybeSingle();const {data:ret,error}=await supabase.from('key_returns').insert({submission_id:submission.id,borrowing_id:borrowing?.id||null,return_name:clean(val(body,'return_name','returnName')),department:clean(body.department),key_number:key,key_description:clean(body.key_description||body.description),quantity:Number(body.quantity||body.qty||1),security_officer_name:clean(val(body,'security_officer_name','security')),returned_at:body.returned_at||body.datetime||new Date().toISOString()}).select('id').single();if(error)throw error;if(borrowing?.id)await supabase.from('key_borrowings').update({return_id:ret.id}).eq('id',borrowing.id);
  }else{
   const path=await uploadPackagePhoto(clean(body.foto||body.photo_data_url));const {error}=await supabase.from('package_registrations').insert({submission_id:submission.id,courier_name:clean(val(body,'courier_name','namaPengantar')),phone:mobile||null,phone_normalized:phone(mobile)||null,company_name:company,item_type:clean(val(body,'item_type','jenisBarang')).toUpperCase(),item_count:Number(body.item_count||body.number_of_items||body.jumlah||1),recipient_type:clean(val(body,'recipient_type','tujuan')).toUpperCase(),recipient_name:clean(val(body,'recipient_name','namaTujuan')),security_officer_name:clean(val(body,'security_officer_name','security')),photo_storage_path:path});if(error)throw error;
  }
  await supabase.from('submissions').update({status:'completed'}).eq('id',submission.id);
  return json({ok:true,submission_id:submissionId});
 }catch(e){console.error(e);return json({error:e instanceof Error?e.message:'Submission failed'},500)}
});
