import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, idempotency-key',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const clean = (v: unknown) => String(v ?? '').trim().replace(/[<>]/g, '');
const normalizePhone = (v: unknown) => clean(v).replace(/[^0-9+]/g, '').replace(/^0+/, '');
const submissionType = (v: string) => ({ entry:'visitor_entry', exit:'visitor_exit', borrowing:'key_borrowing', return:'key_return', package:'package_registration' } as Record<string,string>)[v];

async function visitorIdentity(name: string, phone: string, company: string, category: string | null) {
  const normalized = normalizePhone(phone);
  if (normalized) {
    const { data } = await supabase.from('visitors').select('*').eq('phone_normalized', normalized).maybeSingle();
    if (data) return { id: data.id, normalized };
  }
  const { data, error } = await supabase.from('visitors').insert({
    full_name: name, phone: phone || null, phone_normalized: normalized || null,
    company_name: company || null, category: category || null,
  }).select('id').single();
  if (error) throw error;
  return { id: data.id, normalized };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  try {
    const body = await req.json();
    const type = submissionType(clean(body.type));
    if (!type) return json({ error: 'Invalid submission type' }, 400);
    const idem = clean(req.headers.get('idempotency-key') || body.idempotency_key);
    if (idem) {
      const { data } = await supabase.from('submissions').select('submission_id').eq('idempotency_key', idem).maybeSingle();
      if (data) return json({ ok: true, duplicate: true, submission_id: data.submission_id });
    }

    let visitorId: string | null = null;
    let visitor: any = null;
    if (['visitor_entry','visitor_exit'].includes(type)) {
      const name = clean(body.name || body.visitor_name);
      const phone = clean(body.phone || body.mobile_phone);
      const company = clean(body.company_name || body.company);
      if (!name || !body.pass_vest_number || !body.security_officer_name) return json({ error: 'Required visitor fields are missing' }, 400);
      visitor = await visitorIdentity(name, phone, company, clean(body.category) || null);
      visitorId = visitor.id;
    }

    const submissionId = `HIKJ-${new Date().toISOString().replace(/[-:TZ.]/g,'').slice(0,14)}-${crypto.randomUUID().slice(0,6).toUpperCase()}`;
    const { data: submission, error: se } = await supabase.from('submissions').insert({
      submission_id: submissionId, submission_type: type, visitor_id: visitorId,
      status: 'submitted', idempotency_key: idem || null, metadata: { source_form: body.type },
    }).select('id,submission_id').single();
    if (se) throw se;

    if (type === 'visitor_entry') {
      const { error } = await supabase.from('visitor_entries').insert({ submission_id: submission.id, visitor_id: visitorId, work_location: clean(body.work_location), purpose: clean(body.purpose), security_officer_name: clean(body.security_officer_name), pass_vest_number: clean(body.pass_vest_number), entry_at: body.entry_at || new Date().toISOString() });
      if (error) throw error;
    } else if (type === 'visitor_exit') {
      const pass = clean(body.pass_vest_number);
      const { data: entry } = await supabase.from('visitor_entries').select('id').eq('pass_vest_number', pass).is('exit_id', null).order('entry_at', { ascending: false }).limit(1).maybeSingle();
      const { data: ex, error } = await supabase.from('visitor_exits').insert({ submission_id: submission.id, visitor_id: visitorId, entry_id: entry?.id || null, visitor_name: clean(body.name || body.visitor_name), company_name: clean(body.company_name || body.company), pass_vest_number: pass, security_officer_name: clean(body.security_officer_name), exit_at: body.exit_at || new Date().toISOString() }).select('id').single();
      if (error) throw error;
      if (entry?.id) await supabase.from('visitor_entries').update({ exit_id: ex.id }).eq('id', entry.id);
    } else if (type === 'key_borrowing') {
      const { error } = await supabase.from('key_borrowings').insert({ submission_id: submission.id, borrower_name: clean(body.borrower_name), department: clean(body.department), key_number: clean(body.key_number), key_description: clean(body.key_description), quantity: Number(body.quantity || body.quantity_of_keys || 1), security_officer_name: clean(body.security_officer_name), borrowed_at: body.borrowed_at || new Date().toISOString() });
      if (error) throw error;
    } else if (type === 'key_return') {
      const key = clean(body.key_number);
      const { data: borrowing } = await supabase.from('key_borrowings').select('id').eq('key_number', key).is('return_id', null).order('borrowed_at', { ascending: false }).limit(1).maybeSingle();
      const { data: ret, error } = await supabase.from('key_returns').insert({ submission_id: submission.id, borrowing_id: borrowing?.id || null, return_name: clean(body.return_name), department: clean(body.department), key_number: key, key_description: clean(body.key_description), quantity: Number(body.quantity || body.quantity_of_keys || 1), security_officer_name: clean(body.security_officer_name), returned_at: body.returned_at || new Date().toISOString() }).select('id').single();
      if (error) throw error;
      if (borrowing?.id) await supabase.from('key_borrowings').update({ return_id: ret.id }).eq('id', borrowing.id);
    } else if (type === 'package_registration') {
      const { error } = await supabase.from('package_registrations').insert({ submission_id: submission.id, courier_name: clean(body.courier_name), phone: clean(body.phone), phone_normalized: normalizePhone(body.phone), company_name: clean(body.company_name), item_type: clean(body.item_type).toUpperCase(), item_count: Number(body.item_count || body.number_of_items || 1), recipient_type: clean(body.recipient_type).toUpperCase(), recipient_name: clean(body.recipient_name), security_officer_name: clean(body.security_officer_name), photo_storage_path: body.photo_storage_path || null });
      if (error) throw error;
    }

    await supabase.from('submissions').update({ status: 'completed' }).eq('id', submission.id);
    return json({ ok: true, submission_id: submissionId });
  } catch (e) {
    console.error(e);
    return json({ error: e instanceof Error ? e.message : 'Submission failed' }, 500);
  }
});
