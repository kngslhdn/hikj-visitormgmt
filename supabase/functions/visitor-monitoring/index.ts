import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const ALLOWED_ORIGINS = new Set(['https://kngslhdn.github.io','http://localhost:3000','http://127.0.0.1:5500']);
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const sb = createClient(SUPABASE_URL, SERVICE_ROLE);

const headers = (req: Request) => {
  const origin = req.headers.get('Origin') || '';
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS.has(origin) ? origin : 'https://kngslhdn.github.io',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'GET,OPTIONS',
    'Vary': 'Origin',
    'Content-Type': 'application/json'
  };
};
const json = (req: Request, body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: headers(req) });
const clean = (v: string | null) => (v || '').trim().toLowerCase();
const endOfDay = (v: string | null) => v ? (v.includes('T') ? v : `${v}T23:59:59`) : null;

async function authorize(req: Request) {
  const auth = req.headers.get('Authorization') || '';
  if (!auth.startsWith('Bearer ')) return false;
  const token = auth.slice(7);
  const { data: { user }, error } = await sb.auth.getUser(token);
  if (error || !user) return false;
  const { data: profile } = await sb.from('admin_profiles').select('role,active').eq('user_id', user.id).maybeSingle();
  return !!profile?.active && ['ADMIN','MANAGER','SUPERADMIN'].includes(String(profile.role || '').toUpperCase());
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: headers(req) });
  if (req.method !== 'GET') return json(req, { error: 'Method not allowed' }, 405);
  if (!(await authorize(req))) return json(req, { error: 'Unauthorized' }, 401);

  try {
    const url = new URL(req.url);
    const q = clean(url.searchParams.get('q'));
    const from = url.searchParams.get('from');
    const to = endOfDay(url.searchParams.get('to'));
    const limit = Math.min(Math.max(Number(url.searchParams.get('limit') || 5000), 1), 5000);

    const [entriesResult, exitsResult] = await Promise.all([
      sb.from('visitor_entries').select('id,submission_id,visitor_id,visitor_name_snapshot,phone_snapshot,company_name_snapshot,category_snapshot,visitor_name,visitor_phone,visitor_company_name,visitor_category,work_location,purpose,security_officer_name,pass_vest_number,entry_at,exit_id,visitors(full_name,phone,company_name,category)').order('entry_at', { ascending: false }).limit(5000),
      sb.from('visitor_exits').select('id,submission_id,visitor_id,entry_id,visitor_name,company_name,pass_vest_number,security_officer_name,exit_at').order('exit_at', { ascending: false }).limit(5000)
    ]);
    if (entriesResult.error) throw entriesResult.error;
    if (exitsResult.error) throw exitsResult.error;

    const exits = exitsResult.data || [];
    const exitByEntry = new Map(exits.map(x => [x.entry_id, x]));
    const matchedExitIds = new Set<string>();
    const rows: any[] = [];

    for (const e of entriesResult.data || []) {
      if (from && new Date(e.entry_at).getTime() < new Date(from).getTime()) continue;
      if (to && new Date(e.entry_at).getTime() >= new Date(to).getTime()) continue;
      const x = exitByEntry.get(e.id) || (e.exit_id ? exits.find(v => v.id === e.exit_id) : null) || null;
      if (x) matchedExitIds.add(x.id);
      const identity = Array.isArray(e.visitors) ? e.visitors[0] : e.visitors;
      const visitor = {
        full_name: e.visitor_name_snapshot || e.visitor_name || identity?.full_name || x?.visitor_name || '',
        phone: e.phone_snapshot || e.visitor_phone || identity?.phone || '',
        company_name: e.company_name_snapshot || e.visitor_company_name || identity?.company_name || x?.company_name || '',
        category: e.category_snapshot || e.visitor_category || identity?.category || ''
      };
      const haystack = [visitor.full_name, visitor.phone, visitor.company_name, visitor.category, e.work_location, e.purpose, e.pass_vest_number, e.security_officer_name].join(' ').toLowerCase();
      if (q && !haystack.includes(q)) continue;
      if (x) {
        if (from && new Date(x.exit_at).getTime() < new Date(from).getTime()) continue;
        if (to && new Date(x.exit_at).getTime() >= new Date(to).getTime()) continue;
      }
      rows.push({
        id: e.id,
        submission_id: e.submission_id,
        visitor_id: e.visitor_id,
        visitor,
        work_location: e.work_location,
        purpose: e.purpose,
        pass_vest_number: e.pass_vest_number || x?.pass_vest_number,
        security_officer_name: e.security_officer_name,
        entry_at: e.entry_at,
        exit: x ? {
          id: x.id,
          submission_id: x.submission_id,
          visitor_id: x.visitor_id,
          entry_id: x.entry_id,
          visitor_name: x.visitor_name,
          pass_vest_number: x.pass_vest_number,
          security_officer_name: x.security_officer_name,
          exit_at: x.exit_at
        } : null
      });
    }

    for (const x of exits) {
      if (matchedExitIds.has(x.id)) continue;
      if (from && new Date(x.exit_at).getTime() < new Date(from).getTime()) continue;
      if (to && new Date(x.exit_at).getTime() >= new Date(to).getTime()) continue;
      const haystack = [x.visitor_name, x.pass_vest_number, x.security_officer_name].join(' ').toLowerCase();
      if (q && !haystack.includes(q)) continue;
      rows.push({
        id: `exit-${x.id}`,
        submission_id: x.submission_id,
        visitor_id: x.visitor_id,
        visitor: { full_name: x.visitor_name || '', phone: '', company_name: x.company_name || '', category: '' },
        work_location: '',
        purpose: '',
        pass_vest_number: x.pass_vest_number,
        security_officer_name: '',
        entry_at: null,
        exit: { ...x }
      });
    }

    rows.sort((a, b) => new Date(b.entry_at || b.exit?.exit_at || 0).getTime() - new Date(a.entry_at || a.exit?.exit_at || 0).getTime());
    return json(req, { data: rows.slice(0, limit) });
  } catch (e) {
    console.error('visitor-monitoring:', e);
    return json(req, { error: e instanceof Error ? e.message : 'Unable to load visitor records' }, 500);
  }
});
