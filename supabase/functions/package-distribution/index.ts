import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const ALLOWED_ORIGINS = new Set([
  'https://kngslhdn.github.io',
  'http://localhost:3000',
  'http://127.0.0.1:5500'
]);

const headers = (req: Request) => {
  const origin = req.headers.get('Origin') || '';
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS.has(origin) ? origin : 'https://kngslhdn.github.io',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Vary': 'Origin',
    'Content-Type': 'application/json'
  };
};

const json = (req: Request, body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: headers(req) });

const sb = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

async function requireAdmin(req: Request) {
  const auth = req.headers.get('Authorization') || '';
  if (!auth.startsWith('Bearer ')) return null;
  const token = auth.slice(7);
  const { data: { user }, error } = await sb.auth.getUser(token);
  if (error || !user) return null;

  const { data: profile, error: pe } = await sb
    .from('admin_profiles')
    .select('full_name,role,active')
    .eq('user_id', user.id)
    .maybeSingle();

  if (pe || !profile?.active) return null;
  return { user, profile };
}

const clean = (v: unknown) => String(v ?? '').trim();
const like = (v: string) => `%${v.replace(/[%_]/g, c => `\\${c}`)}%`;

async function searchPackages(req: Request, url: URL) {
  const auth = await requireAdmin(req);
  if (!auth) return json(req, { error: 'Unauthorized' }, 401);

  const q = clean(url.searchParams.get('q')).toLowerCase();
  const limit = Math.max(1, Math.min(Number(url.searchParams.get('limit') || 50), 100));

  // Search only package registrations that do not have a distribution row.
  const { data: distributed, error: de } = await sb
    .from('package_distributions')
    .select('package_registration_id');
  if (de) throw de;
  const distributedIds = new Set((distributed || []).map(x => x.package_registration_id));

  let query = sb
    .from('package_registrations')
    .select('id,submission_id,courier_name,phone,company_name,item_type,item_count,recipient_type,recipient_name,security_officer_name,created_at')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (q) {
    query = query.or([
      `submission_id.ilike.${like(q)}`,
      `recipient_name.ilike.${like(q)}`,
      `courier_name.ilike.${like(q)}`,
      `company_name.ilike.${like(q)}`,
      `item_type.ilike.${like(q)}`,
      `recipient_type.ilike.${like(q)}`
    ].join(','));
  }

  const { data, error } = await query;
  if (error) throw error;

  const rows = (data || [])
    .filter(row => !distributedIds.has(row.id))
    .map(row => ({ ...row, status: 'READY FOR DISTRIBUTION' }));

  return json(req, { data: rows, profile: auth.profile });
}

async function distribute(req: Request) {
  const auth = await requireAdmin(req);
  if (!auth) return json(req, { error: 'Unauthorized' }, 401);

  const body = await req.json().catch(() => ({}));
  const packageRegistrationId = clean(body.package_registration_id);
  const recipientName = clean(body.recipient_name);
  const securityHandOver = clean(body.security_hand_over);

  if (!packageRegistrationId) return json(req, { error: 'Package not found.' }, 404);
  if (!securityHandOver) return json(req, { error: 'Please enter Security Hand Over.' }, 400);

  const { data: pkg, error: pe } = await sb
    .from('package_registrations')
    .select('id,submission_id,recipient_name,company_name,courier_name,item_type,item_count,created_at')
    .eq('id', packageRegistrationId)
    .maybeSingle();
  if (pe) throw pe;
  if (!pkg) return json(req, { error: 'Package not found.' }, 404);

  const { data: existing, error: xe } = await sb
    .from('package_distributions')
    .select('id,distributed_at,status')
    .eq('package_registration_id', pkg.id)
    .maybeSingle();
  if (xe) throw xe;
  if (existing) return json(req, { error: 'Package has already been distributed.' }, 409);

  const finalRecipient = recipientName || clean(pkg.recipient_name);
  if (!finalRecipient) return json(req, { error: 'Package not found.' }, 404);

  // Unique(package_registration_id) is the final race-condition guard.
  const distributedAt = new Date().toISOString();
  const { data: row, error } = await sb
    .from('package_distributions')
    .insert({
      package_registration_id: pkg.id,
      package_number: pkg.submission_id,
      registered_recipient_name: pkg.recipient_name,
      recipient_name: finalRecipient,
      security_hand_over: securityHandOver,
      distributed_at: distributedAt,
      status: 'DISTRIBUTED'
    })
    .select('id,package_registration_id,package_number,registered_recipient_name,recipient_name,security_hand_over,distributed_at,status,created_at')
    .single();

  if (error) {
    if (error.code === '23505') return json(req, { error: 'Package has already been distributed.' }, 409);
    throw error;
  }

  return json(req, {
    ok: true,
    message: 'Package successfully distributed.',
    distribution: {
      ...row,
      company_name: pkg.company_name,
      courier_name: pkg.courier_name,
      item_type: pkg.item_type,
      item_count: pkg.item_count,
      registered_at: pkg.created_at
    }
  });
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: headers(req) });
  try {
    const url = new URL(req.url);
    if (req.method === 'GET') return await searchPackages(req, url);
    if (req.method === 'POST') return await distribute(req);
    return json(req, { error: 'Method not allowed' }, 405);
  } catch (e) {
    console.error(e);
    return json(req, { error: 'Unable to complete package distribution. Please try again.' }, 500);
  }
});
