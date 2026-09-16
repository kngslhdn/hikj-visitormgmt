/* HIKJ Admin - Package Distribution history */
(() => {
  const SUPABASE_URL = 'https://hmqgmusellcetakoalva.supabase.co';
  const ADMIN_API = `${SUPABASE_URL}/functions/v1/admin-api`;
  let client = null;
  let session = null;
  let rows = [];

  const esc = v => String(v ?? '').replace(/[&<>\"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  const fmt = v => v ? new Date(v).toLocaleString('en-GB', {day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}) : '—';

  async function bootAuth() {
    if (!window.supabase?.createClient) {
      await new Promise((resolve, reject) => { const s=document.createElement('script'); s.src='https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2'; s.onload=resolve; s.onerror=reject; document.head.appendChild(s); });
    }
    const key = window.HIKJ_SUPABASE_PUBLISHABLE_KEY || '';
    if (!key) return;
    client = window.supabase.createClient(SUPABASE_URL, key);
    const { data } = await client.auth.getSession();
    session = data?.session || null;
    client.auth.onAuthStateChange((_e, s) => { session=s; });
  }

  async function api(params={}) {
    if (!session?.access_token) throw new Error('Admin session not available. Please sign in again.');
    const qs = new URLSearchParams(params).toString();
    const r = await fetch(`${ADMIN_API}?action=distribution_history${qs ? '&'+qs : ''}`, { headers:{ 'apikey':window.HIKJ_SUPABASE_PUBLISHABLE_KEY, 'Authorization':`Bearer ${session.access_token}` } });
    const b = await r.json().catch(()=>({}));
    if(!r.ok) throw new Error(b.error||'Unable to load distribution history.');
    return b.data || [];
  }

  function addNavAndSection() {
    const aside = document.querySelector('aside');
    const main = document.querySelector('main');
    if (!aside || !main || document.querySelector('[data-section="distribution"]')) return;
    aside.insertAdjacentHTML('beforeend', '<button class="btn nav" data-section="distribution">Package Distribution</button>');
    main.insertAdjacentHTML('beforeend', `<section id="distribution" class="section">
      <div class="head"><div><h1>Package Distribution</h1><p>Distribution history and hand-over audit trail.</p></div><button class="btn refresh" id="refreshDistribution">↻ Refresh</button></div>
      <div class="card">
        <div class="filters"><input id="distributionSearch" placeholder="Package number, recipient, courier, company, security"><input id="distributionFrom" type="date"><input id="distributionTo" type="date"><select id="distributionSecurity"><option value="">All Security Hand Over</option></select><button class="btn primary" id="distributionSearchBtn">Search</button></div>
        <div class="table-wrap"><table><thead><tr><th>Package Number</th><th>Recipient</th><th>Company</th><th>Security Hand Over</th><th>Registered At</th><th>Distributed At</th><th>Status</th></tr></thead><tbody id="distributionTable"></tbody></table></div>
        <div class="footer-note" id="distributionNote">Distribution records are immutable historical records.</div>
      </div>
    </section>`);
    const nav = aside.querySelector('[data-section="distribution"]');
    nav.onclick = () => showSection();
    document.querySelector('#refreshDistribution').onclick = load;
    document.querySelector('#distributionSearchBtn').onclick = load;
  }

  function showSection() {
    document.querySelectorAll('.section').forEach(s=>s.classList.remove('active'));
    document.querySelectorAll('.nav').forEach(n=>n.classList.remove('active'));
    document.querySelector('#distribution')?.classList.add('active');
    document.querySelector('[data-section="distribution"]')?.classList.add('active');
    load();
  }

  function render(data) {
    rows=data;
    const tbody=document.querySelector('#distributionTable');
    const note=document.querySelector('#distributionNote');
    if(!tbody) return;
    tbody.innerHTML=data.length ? data.map(x=>`<tr><td><b>${esc(x.package_number)}</b></td><td>${esc(x.recipient_name)}</td><td>${esc(x.company_name)}</td><td>${esc(x.security_hand_over)}</td><td>${fmt(x.registered_at)}</td><td>${fmt(x.distributed_at)}</td><td><span class="badge status">${esc(x.status)}</span></td></tr>`).join('') : '<tr><td colspan="7" class="empty">No distribution records found.</td></tr>';
    if(note) note.textContent=`${data.length} distribution record${data.length===1?'':'s'} loaded.`;
  }

  async function load() {
    const note=document.querySelector('#distributionNote');
    if(note) note.textContent='Loading distribution history…';
    try {
      const data=await api({q:document.querySelector('#distributionSearch')?.value.trim()||'',from:document.querySelector('#distributionFrom')?.value||'',to:document.querySelector('#distributionTo')?.value ? `${document.querySelector('#distributionTo').value}T23:59:59` : '',limit:'2000'});
      render(data);
    } catch(e) { if(note) note.textContent=e.message; }
  }

  function injectConfig() {
    if (window.HIKJ_SUPABASE_PUBLISHABLE_KEY) return;
    const scripts=[...document.scripts];
    const text=scripts.map(s=>s.textContent||'').join('\n');
    const m=text.match(/const SUPABASE_PUBLISHABLE_KEY\s*=\s*([^;]+);/);
    if(m) { try { window.HIKJ_SUPABASE_PUBLISHABLE_KEY=JSON.parse(m[1]); } catch {} }
  }

  async function boot() {
    injectConfig();
    addNavAndSection();
    try { await bootAuth(); } catch(e) { console.warn(e); }
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',boot); else boot();
})();
