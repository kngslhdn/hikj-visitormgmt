import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = {'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type, idempotency-key','Access-Control-Allow-Methods':'POST, OPTIONS'};
const supabase=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,'Content-Type':'application/json'}});
const clean=(v:unknown)=>String(v??'').trim().replace(/[<>]/g,'');
const phone=(v:unknown)=>clean(v).replace(/[^0-9+]/g,'').replace(/^0+/,'');
const normText=(v:unknown)=>clean(v).toLowerCase().replace(/\s+/g,' ');
const types:Record<string,string>={entry:'visitor_entry',masuk:'visitor_entry',exit:'visitor_exit',keluar:'visitor_exit',borrowing:'key_borrowing',pinjamKunci:'key_borrowing',return:'key_return',kembaliKunci:'key_return',package:'package_registration',paket:'package_registration',key_asset_lookup:'key_asset_lookup'};
const val=(b:any,...keys:string[])=>keys.map(k=>b[k]).find(v=>v!==undefined&&v!==null&&String(v).trim()!=='')??'';

// SecureOps P1 hardening: lightweight per-edge rate limiting for the public submission endpoint.
// This is defense-in-depth; for globally coordinated limits, place the endpoint behind a
// durable rate limiter such as Upstash/Cloudflare as traffic grows.
const RATE_LIMIT_WINDOW_MS=60_000;
const RATE_LIMIT_MAX=60;
const rateBuckets=new Map<string,{count:number,resetAt:number}>();
function clientKey(req:Request){
 const forwarded=req.headers.get('x-forwarded-for')||req.headers.get('cf-connecting-ip')||'';
 return (forwarded.split(',')[0]||'unknown').trim().slice(0,100);
}
function rateLimit(req:Request){
 const now=Date.now(),key=clientKey(req);let bucket=rateBuckets.get(key);
 if(!bucket||now>=bucket.resetAt){bucket={count:0,resetAt:now+RATE_LIMIT_WINDOW_MS};rateBuckets.set(key,bucket);}
 bucket.count++;
 if(bucket.count>RATE_LIMIT_MAX)return {allowed:false,retryAfter:Math.max(1,Math.ceil((bucket.resetAt-now)/1000))};
 if(rateBuckets.size>5000){for(const [k,b] of rateBuckets)if(now>=b.resetAt)rateBuckets.delete(k);}
 return {allowed:true,retryAfter:0};
}

function timestamp(_v:unknown){
 return new Date().toISOString();
}

async function visitorIdentity(name:string,mobile:string,company:string,category:string|null){
 const normalized=phone(mobile),nameKey=normText(name),companyKey=normText(company),categoryKey=normText(category);
 if(normalized){const {data,error}=await supabase.from('visitors').select('id,full_name,company_name,category').eq('phone_normalized',normalized).limit(50);if(error)throw error;const match=(data||[]).find(v=>normText(v.full_name)===nameKey&&normText(v.company_name)===companyKey&&normText(v.category)===categoryKey);if(match)return match.id;}
 else{const {data,error}=await supabase.from('visitors').select('id,full_name,company_name,category').limit(200);if(error)throw error;const match=(data||[]).find(v=>normText(v.full_name)===nameKey&&normText(v.company_name)===companyKey&&normText(v.category)===categoryKey);if(match)return match.id;}
 const {data,error}=await supabase.from('visitors').insert({full_name:name,phone:mobile||null,phone_normalized:normalized||null,company_name:company||null,category:category||null}).select('id').single();if(error)throw error;return data.id;
}

async function findExitEntry(pass:string){
 const passKey=normText(pass);
 const {data,error}=await supabase.from('visitor_entries').select('id,visitor_id,visitor_name,visitor_name_snapshot,pass_vest_number,entry_at').is('exit_id',null).order('entry_at',{ascending:false}).limit(5000);
 if(error)throw error;
 return (data||[]).find(e=>passKey&&normText(e.pass_vest_number)===passKey)||null;
}

async function publicSettings(){
 const {data,error}=await supabase.from('app_settings').select('setting_key,setting_value,active').in('setting_key',['whatsapp','whatsapp_recipients','operations']);
 if(error)throw error;
 const out=Object.fromEntries((data||[]).map((x:any)=>[x.setting_key,x.setting_value]));
 // The existing production schema uses whatsapp_recipients; normalize it to the public whatsapp shape.
 if(!out.whatsapp){
   const legacy=Array.isArray(out.whatsapp_recipients)?out.whatsapp_recipients[0]:out.whatsapp_recipients;
   if(legacy)out.whatsapp={recipient_name:legacy.name||'HIKJ Security',phone_number:legacy.phone||''};
 }
 return out;
}

async function uploadPackagePhoto(dataUrl:string){
 if(!dataUrl||!dataUrl.startsWith('data:image/'))return null;const match=dataUrl.match(/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/);if(!match)return null;const bytes=Uint8Array.from(atob(match[2]),c=>c.charCodeAt(0));if(bytes.length>5*1024*1024)throw Error('Package photo exceeds 5 MB');const ext=match[1].split('/')[1].replace('jpeg','jpg');const path=`${new Date().toISOString().slice(0,10)}/${crypto.randomUUID()}.${ext}`;const {error}=await supabase.storage.from('package-photos').upload(path,bytes,{contentType:match[1],upsert:false});if(error)throw error;return path;
}

Deno.serve(async req=>{
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers:cors});if(req.method!=='POST')return json({error:'Method not allowed'},405);const limit=rateLimit(req);if(!limit.allowed)return new Response(JSON.stringify({error:'Too many requests. Please wait and try again.'}),{status:429,headers:{...cors,'Content-Type':'application/json','Retry-After':String(limit.retryAfter)}});
 try{
  const contentLength=Number(req.headers.get('content-length')||0);if(contentLength>8*1024*1024)return json({error:'Request payload is too large.'},413);
  const body=await req.json();const rawType=clean(body.type||body.form_type),type=types[rawType]||rawType;if(!['visitor_entry','visitor_exit','key_borrowing','key_return','package_registration','key_asset_lookup'].includes(type))return json({error:'Invalid submission type'},400);const settings=await publicSettings();const ops=settings.operations||{};const enabledByType:Record<string,string>={visitor_entry:'visitor_entry_enabled',visitor_exit:'visitor_exit_enabled',key_borrowing:'key_borrowing_enabled',key_return:'key_return_enabled',package_registration:'package_registration_enabled'};if(enabledByType[type]&&ops[enabledByType[type]]===false)return json({error:'This service is currently disabled by Security Administration.'},403);
  if(type==='key_asset_lookup'){
   const key=clean(body.key_number||body.keyNumber);
   if(!key)return json({error:'Please enter Key Number.'},400);
   const {data,error}=await supabase.from('key_assets').select('key_number,key_description,quantity,active').eq('key_number',key).maybeSingle();
   if(error)throw error;
   if(!data)return json({ok:false,error:`Key Number ${key} was not found in Key Assets.`},404);
   if(!data.active)return json({ok:false,error:`Key Number ${key} is inactive.`},409);
   return json({ok:true,key_asset:{key_number:data.key_number,description:data.key_description||'',quantity:Number(data.quantity||0)}});
  }
  const idem=clean(req.headers.get('idempotency-key')||body.idempotency_key);if(idem){const {data}=await supabase.from('submissions').select('submission_id').eq('idempotency_key',idem).maybeSingle();if(data)return json({ok:true,duplicate:true,submission_id:data.submission_id});}
  const name=clean(val(body,'name','visitor_name','nama','returnName','borrowerName','namaPengantar')),mobile=clean(val(body,'phone','mobile_phone','telepon')),company=clean(val(body,'company_name','company','perusahaan'));let visitorId:string|null=null;let matchedExitEntry:any=null;
  if(type==='visitor_entry'){
   const pass=clean(val(body,'pass_vest_number','pass')),officer=clean(val(body,'security_officer_name','security')),category=clean(val(body,'category','kategori'));if(!name||!pass||!officer||!category)return json({error:'Required visitor fields are missing'},400);
   visitorId=await visitorIdentity(name,mobile,company,category);
  }else if(type==='visitor_exit'){
   const pass=clean(val(body,'pass_vest_number','pass')),officer=clean(val(body,'security_officer_name','security'));
   if(!pass||!officer)return json({error:'Pass / Vest Number and Security Officer Name are required.'},400);
   matchedExitEntry=await findExitEntry(pass);
   if(!matchedExitEntry)return json({ok:false,error:'Visitor not found: Pass / Vest Number does not match any visitor currently inside the hotel.'},404);
   visitorId=matchedExitEntry.visitor_id;
  }

  let returnBorrowing:any=null;
  if(type==='key_return'){
   const key=clean(body.key_number||body.keyNumber);const quantity=Number(body.quantity||body.qty||1);
   if(!key)return json({error:'Please enter Key Number.'},400);
   if(!Number.isInteger(quantity)||quantity<1)return json({error:'Quantity of Keys must be a whole number greater than 0.'},400);
   const {data,error}=await supabase.from('key_control_transactions').select('*').eq('key_number',key).gt('outstanding_quantity',0).limit(1).maybeSingle();
   if(error)throw error;
   returnBorrowing=data||null;
   if(!returnBorrowing)return json({ok:false,error:`Key ${key} is not currently outstanding. Return rejected.`},409);
   if(quantity>Number(returnBorrowing.outstanding_quantity))return json({ok:false,error:`Return quantity (${quantity}) exceeds outstanding quantity (${returnBorrowing.outstanding_quantity}) for Key ${key}.`,outstanding_quantity:returnBorrowing.outstanding_quantity},409);
  }

  if(type==='key_borrowing'){
   const key=clean(body.key_number||body.keyNumber);
   if(!key)return json({error:'Please enter Key Number.'},400);
   const {data:keyAsset,error:keyAssetError}=await supabase.from('key_assets').select('key_number,key_description,quantity,active').eq('key_number',key).maybeSingle();
   if(keyAssetError)throw keyAssetError;
   if(!keyAsset)return json({ok:false,error:`Key Number ${key} was not found in Key Assets.`},404);
   if(!keyAsset.active)return json({ok:false,error:`Key Number ${key} is inactive.`},409);
   const quantity=Number(keyAsset.quantity);
   if(!Number.isInteger(quantity)||quantity<1)return json({ok:false,error:`Key Number ${key} has an invalid quantity configured in Key Assets.`},409);
   const {data,error}=await supabase.from('key_control_transactions').select('*').eq('key_number',key).gt('outstanding_quantity',0).limit(1).maybeSingle();
   if(error)throw error;
   if(data)return json({ok:false,error:`Key ${key} is currently outstanding to ${data.borrower_name} with ${data.outstanding_quantity} key(s) outstanding. Please return the outstanding key(s) before a new borrowing.`},409);
  }

  const {data:submission,error:se}=await supabase.from('submissions').insert({submission_id:null,submission_type:type,visitor_id:visitorId,status:'submitted',idempotency_key:idem||null,metadata:{source_form:rawType}}).select('id,submission_id').single();if(se)throw se;
  let keyReturnResult:any=null;
  if(type==='visitor_entry'){
   const category=clean(val(body,'category','kategori'));const {error}=await supabase.from('visitor_entries').insert({submission_id:submission.id,visitor_id:visitorId,visitor_name:name,visitor_phone:mobile||null,visitor_company_name:company||null,visitor_category:category,visitor_name_snapshot:name,phone_snapshot:mobile||null,company_name_snapshot:company||null,category_snapshot:category,work_location:clean(val(body,'work_location','lokasi')),purpose:clean(val(body,'purpose','tujuan')),security_officer_name:clean(val(body,'security_officer_name','security')),pass_vest_number:clean(val(body,'pass_vest_number','pass')),entry_at:timestamp(body.entry_at||body.datetime)});if(error)throw error;
  }else if(type==='visitor_exit'){
   const pass=clean(val(body,'pass_vest_number','pass'));const entry=matchedExitEntry;const exitName=clean(entry?.visitor_name||entry?.visitor_name_snapshot||'');
   const {data:ex,error}=await supabase.from('visitor_exits').insert({submission_id:submission.id,visitor_id:visitorId,entry_id:entry.id,visitor_name:exitName,pass_vest_number:pass,security_officer_name:clean(val(body,'security_officer_name','security')),exit_at:new Date().toISOString()}).select('id').single();if(error)throw error;if(entry.id)await supabase.from('visitor_entries').update({exit_id:ex.id}).eq('id',entry.id);
  }else if(type==='key_borrowing'){
   const key=clean(body.key_number||body.keyNumber);
   if(!key)return json({error:'Please enter Key Number.'},400);
   const {data:keyAsset,error:keyAssetError}=await supabase.from('key_assets').select('key_number,key_description,quantity,active').eq('key_number',key).maybeSingle();
   if(keyAssetError)throw keyAssetError;
   if(!keyAsset)return json({ok:false,error:`Key Number ${key} was not found in Key Assets.`},404);
   if(!keyAsset.active)return json({ok:false,error:`Key Number ${key} is inactive.`},409);
   const quantity=Number(keyAsset.quantity);
   if(!Number.isInteger(quantity)||quantity<1)return json({ok:false,error:`Key Number ${key} has an invalid quantity configured in Key Assets.`},409);
   const {data,error}=await supabase.from('key_control_transactions').select('key_number,borrower_name,outstanding_quantity').eq('key_number',key).gt('outstanding_quantity',0).limit(1).maybeSingle();
   if(error)throw error;
   if(data)return json({ok:false,error:`Key ${key} is currently outstanding to ${data.borrower_name} with ${data.outstanding_quantity} key(s) outstanding. Please return the outstanding key(s) before a new borrowing.`},409);
   const borrowerName=clean(val(body,'borrower_name','borrowerName'));
   const department=clean(body.department);
   const description=clean(keyAsset.key_description||'');
   const officer=clean(val(body,'security_officer_name','security'));
   if(!borrowerName||!officer)return json({error:'Borrower Name and Issued By Security Officer are required.'},400);
   const borrowedAt=timestamp(body.borrowed_at||body.datetime);
   const expectedReturnAt=new Date(new Date(borrowedAt).getTime()+24*60*60*1000).toISOString();
   const borrowingPayload={submission_id:submission.id,borrower_name:borrowerName,department,key_number:key,key_description:description,quantity,security_officer_name:officer,borrowed_at:borrowedAt,expected_return_at:expectedReturnAt} as Record<string,unknown>;
   const {error:ie}=await supabase.from('key_borrowings').insert(borrowingPayload);
   if(ie)throw ie;
  }else if(type==='key_return'){
   const quantity=Number(body.quantity||body.qty||1),borrowing=returnBorrowing,returnedBy=clean(val(body,'return_name','returnName','returned_by','returnedBy')),officer=clean(val(body,'security_officer_name','security')),department=clean(body.department)||borrowing.department;
   if(!returnedBy||!officer)return json({error:'Returned By and Received By Security are required.'},400);
   const originalBorrowed=Number(borrowing.borrowed_quantity),previouslyReturned=Number(borrowing.returned_quantity),newTotal=previouslyReturned+quantity;
   const discrepancy=false;
   const {error}=await supabase.from('key_returns').insert({submission_id:submission.id,borrowing_id:borrowing.borrowing_id,return_name:returnedBy,returned_by:returnedBy,department,key_number:borrowing.key_number,quantity,borrowed_quantity:originalBorrowed,discrepancy_qty:discrepancy,security_officer_name:officer,returned_at:timestamp(body.returned_at||body.datetime)});
   if(error)throw error;
   keyReturnResult={key_number:borrowing.key_number,original_borrowed_quantity:originalBorrowed,previously_returned_quantity:previouslyReturned,returned_now:quantity,total_returned:newTotal,outstanding_quantity:originalBorrowed-newTotal,discrepancy,new_status:newTotal===originalBorrowed?'CLOSED':'PARTIALLY RETURNED'};

  }else{
   const path=await uploadPackagePhoto(clean(body.foto||body.photo_data_url));const {error}=await supabase.from('package_registrations').insert({submission_id:submission.id,courier_name:clean(val(body,'courier_name','namaPengantar')),phone:mobile||null,phone_normalized:phone(mobile)||null,company_name:company,item_type:clean(val(body,'item_type','jenisBarang')).toUpperCase(),item_count:Number(body.item_count||body.number_of_items||body.jumlah||1),recipient_type:clean(val(body,'recipient_type','tujuan')).toUpperCase(),recipient_name:clean(val(body,'recipient_name','namaTujuan')),security_officer_name:clean(val(body,'security_officer_name','security')),photo_storage_path:path});if(error)throw error;
  }
  await supabase.from('submissions').update({status:'completed'}).eq('id',submission.id);return json({ok:true,submission_id:submission.submission_id,whatsapp_number:settings.whatsapp?.phone_number||null,...(keyReturnResult?{key_return:keyReturnResult}:{})});
 }catch(e){console.error(e);return json({error:'Submission failed'},500)}
});
