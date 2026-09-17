import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = {'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type, idempotency-key','Access-Control-Allow-Methods':'POST, OPTIONS'};
const supabase=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,'Content-Type':'application/json'}});
const clean=(v:unknown)=>String(v??'').trim().replace(/[<>]/g,'');
const phone=(v:unknown)=>clean(v).replace(/[^0-9+]/g,'').replace(/^0+/,'');
const normText=(v:unknown)=>clean(v).toLowerCase().replace(/\s+/g,' ');
const types:Record<string,string>={entry:'visitor_entry',masuk:'visitor_entry',exit:'visitor_exit',keluar:'visitor_exit',borrowing:'key_borrowing',pinjamKunci:'key_borrowing',return:'key_return',kembaliKunci:'key_return',package:'package_registration',paket:'package_registration'};
const val=(b:any,...keys:string[])=>keys.map(k=>b[k]).find(v=>v!==undefined&&v!==null&&String(v).trim()!=='')??'';

function timestamp(v:unknown){
 const s=clean(v); if(!s)return new Date().toISOString();
 if(/^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}$/.test(s)){const [date,time]=s.split(' ');const [dd,mm,yyyy]=date.split('/');const d=new Date(Number(yyyy),Number(mm)-1,Number(dd),Number(time.slice(0,2)),Number(time.slice(3,5)));if(!Number.isNaN(d.getTime()))return d.toISOString();}
 const d=new Date(s); return Number.isNaN(d.getTime())?new Date().toISOString():d.toISOString();
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

async function uploadPackagePhoto(dataUrl:string){
 if(!dataUrl||!dataUrl.startsWith('data:image/'))return null;const match=dataUrl.match(/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/);if(!match)return null;const bytes=Uint8Array.from(atob(match[2]),c=>c.charCodeAt(0));if(bytes.length>5*1024*1024)throw Error('Package photo exceeds 5 MB');const ext=match[1].split('/')[1].replace('jpeg','jpg');const path=`${new Date().toISOString().slice(0,10)}/${crypto.randomUUID()}.${ext}`;const {error}=await supabase.storage.from('package-photos').upload(path,bytes,{contentType:match[1],upsert:false});if(error)throw error;return path;
}

Deno.serve(async req=>{
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers:cors});if(req.method!=='POST')return json({error:'Method not allowed'},405);
 try{
  const body=await req.json();const rawType=clean(body.type||body.form_type),type=types[rawType]||rawType;if(!['visitor_entry','visitor_exit','key_borrowing','key_return','package_registration'].includes(type))return json({error:'Invalid submission type'},400);
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
   const {data:borrowings,error:be}=await supabase.from('key_borrowings').select('id,key_number,key_description,quantity,borrower_name,department').is('return_id',null).order('borrowed_at',{ascending:false}).limit(5000);
   if(be)throw be;
   returnBorrowing=(borrowings||[]).find(b=>normText(b.key_number)===normText(key))||null;
   if(!returnBorrowing)return json({ok:false,error:`Key ${key} is not currently borrowed. Return rejected: Key Number does not match any outstanding Key Borrowing.`},409);
  }

  const submissionId=`HIKJ-${new Date().toISOString().replace(/[-:TZ.]/g,'').slice(0,14)}-${crypto.randomUUID().slice(0,6).toUpperCase()}`;const {data:submission,error:se}=await supabase.from('submissions').insert({submission_id:submissionId,submission_type:type,visitor_id:visitorId,status:'submitted',idempotency_key:idem||null,metadata:{source_form:rawType}}).select('id').single();if(se)throw se;
  let keyReturnResult:any=null;
  if(type==='visitor_entry'){
   const category=clean(val(body,'category','kategori'));const {error}=await supabase.from('visitor_entries').insert({submission_id:submission.id,visitor_id:visitorId,visitor_name:name,visitor_phone:mobile||null,visitor_company_name:company||null,visitor_category:category,visitor_name_snapshot:name,phone_snapshot:mobile||null,company_name_snapshot:company||null,category_snapshot:category,work_location:clean(val(body,'work_location','lokasi')),purpose:clean(val(body,'purpose','tujuan')),security_officer_name:clean(val(body,'security_officer_name','security')),pass_vest_number:clean(val(body,'pass_vest_number','pass')),entry_at:timestamp(body.entry_at||body.datetime)});if(error)throw error;
  }else if(type==='visitor_exit'){
   const pass=clean(val(body,'pass_vest_number','pass'));const entry=matchedExitEntry;const exitName=clean(entry?.visitor_name||entry?.visitor_name_snapshot||'');
   const {data:ex,error}=await supabase.from('visitor_exits').insert({submission_id:submission.id,visitor_id:visitorId,entry_id:entry.id,visitor_name:exitName,pass_vest_number:pass,security_officer_name:clean(val(body,'security_officer_name','security')),exit_at:new Date().toISOString()}).select('id').single();if(error)throw error;if(entry.id)await supabase.from('visitor_entries').update({exit_id:ex.id}).eq('id',entry.id);
  }else if(type==='key_borrowing'){
   const key=clean(body.key_number||body.keyNumber);const quantity=Number(body.quantity||body.qty||1);if(!key)return json({error:'Please enter Key Number.'},400);if(!Number.isInteger(quantity)||quantity<1)return json({error:'Quantity of Keys must be a whole number greater than 0.'},400);const {data:outstanding,error:oe}=await supabase.from('key_borrowings').select('id,borrower_name,quantity').eq('key_number',key).is('return_id',null).order('borrowed_at',{ascending:false}).limit(1).maybeSingle();if(oe)throw oe;if(outstanding)return json({ok:false,error:`Key ${key} is currently borrowed by ${outstanding.borrower_name}. Please return the key before borrowing it again.`},409);const {error}=await supabase.from('key_borrowings').insert({submission_id:submission.id,borrower_name:clean(val(body,'borrower_name','borrowerName')),department:clean(body.department),key_number:key,key_description:clean(body.key_description||body.description),quantity,security_officer_name:clean(val(body,'security_officer_name','security')),borrowed_at:timestamp(body.borrowed_at||body.datetime)});if(error)throw error;
  }else if(type==='key_return'){
   const key=clean(body.key_number||body.keyNumber);const quantity=Number(body.quantity||body.qty||1);const borrowing=returnBorrowing;const borrowedQuantity=Number(borrowing.quantity);const discrepancyQty=quantity!==borrowedQuantity;
   const {data:ret,error}=await supabase.from('key_returns').insert({submission_id:submission.id,borrowing_id:borrowing.id,return_name:clean(val(body,'return_name','returnName')),department:clean(body.department)||borrowing.department,key_number:borrowing.key_number,quantity,borrowed_quantity:borrowedQuantity,discrepancy_qty:discrepancyQty,security_officer_name:clean(val(body,'security_officer_name','security')),returned_at:timestamp(body.returned_at||body.datetime)}).select('id').single();if(error)throw error;if(borrowing.id)await supabase.from('key_borrowings').update({return_id:ret.id}).eq('id',borrowing.id);
   keyReturnResult={discrepancy_qty:discrepancyQty,borrowed_quantity:borrowedQuantity,returned_quantity:quantity,key_number:borrowing.key_number};
  }else{
   const path=await uploadPackagePhoto(clean(body.foto||body.photo_data_url));const {error}=await supabase.from('package_registrations').insert({submission_id:submission.id,courier_name:clean(val(body,'courier_name','namaPengantar')),phone:mobile||null,phone_normalized:phone(mobile)||null,company_name:company,item_type:clean(val(body,'item_type','jenisBarang')).toUpperCase(),item_count:Number(body.item_count||body.number_of_items||body.jumlah||1),recipient_type:clean(val(body,'recipient_type','tujuan')).toUpperCase(),recipient_name:clean(val(body,'recipient_name','namaTujuan')),security_officer_name:clean(val(body,'security_officer_name','security')),photo_storage_path:path});if(error)throw error;
  }
  await supabase.from('submissions').update({status:'completed'}).eq('id',submission.id);return json({ok:true,submission_id:submissionId,...(keyReturnResult?{key_return:keyReturnResult}:{})});
 }catch(e){console.error(e);return json({error:e instanceof Error?e.message:'Submission failed'},500)}
});
