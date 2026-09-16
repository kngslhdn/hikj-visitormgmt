/* HIKJ Package Distribution - Security workflow */
(() => {
  const FUNCTION_URL = 'https://hmqgmusellcetakoalva.supabase.co/functions/v1/package-distribution';
  const SUPABASE_URL = 'https://hmqgmusellcetakoalva.supabase.co';
  let client = null;
  let selected = null;
  let authSession = null;
  let searchTimer = null;

  function loadSupabase() {
    return new Promise((resolve, reject) => {
      if (window.supabase?.createClient) return resolve();
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
      s.onload = () => resolve();
      s.onerror = () => reject(new Error('Unable to load authentication library.'));
      document.head.appendChild(s);
    });
  }

  function getPublishableKey() {
    return window.HIKJ_SUPABASE_PUBLISHABLE_KEY || '';
  }

  const esc = v => String(v ?? '').replace(/[&<>\"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  const fmt = v => v ? new Date(v).toLocaleString('en-GB', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' }) : '—';

  function card() {
    const root = document.querySelector('#choices');
    if (!root || document.querySelector('[data-distribution-card]')) return;
    root.insertAdjacentHTML('beforeend', `<button type="button" class="choice" data-distribution-card aria-pressed="false">
      <span class="choice-icon"><svg viewBox="0 0 48 48"><path d="M9 15l15-7 15 7-15 7zM9 15v18l15 8 15-8V15M24 22v19"/><path d="M31 30h9M35 26l5 4-5 4"/></svg></span>
      <strong>Package Distribution</strong><span class="arrow">→</span>
    </button>`);
    root.addEventListener('click', ev => {
      const btn = ev.target.closest('[data-distribution-card]');
      if (btn) {
        ev.stopImmediatePropagation();
        openDistribution();
      }
    }, true);
  }

  async function initClient() {
    await loadSupabase();
    const key = getPublishableKey();
    if (!key) throw new Error('Supabase publishable key is not available.');
    client = window.supabase.createClient(SUPABASE_URL, key);
    const { data } = await client.auth.getSession();
    authSession = data?.session || null;
    client.auth.onAuthStateChange((_event, session) => { authSession = session; });
  }

  async function callApi(path, options = {}) {
    if (!authSession?.access_token) throw new Error('Please sign in as an authorized Security Admin first.');
    const headers = { 'apikey': getPublishableKey(), 'Authorization': `Bearer ${authSession.access_token}`, 'Content-Type': 'application/json' };
    const r = await fetch(`${FUNCTION_URL}${path}`, { ...options, headers: { ...headers, ...(options.headers || {}) } });
    const body = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(body.error || 'Unable to complete package distribution. Please try again.');
    return body;
  }

  function openDistribution() {
    const panel = document.querySelector('#panel');
    if (!panel) return;
    document.querySelectorAll('.choice[data-form]').forEach(x => x.setAttribute('aria-pressed','false'));
    document.querySelector('[data-distribution-card]')?.setAttribute('aria-pressed','true');
    panel.classList.add('visible');
    panel.innerHTML = `<div class="panel-header"><h2>Package Distribution</h2><p>Search a registered package and complete the hand-over process.</p></div>
      <div class="pd-wrap">
        <div id="pdAuth"></div>
        <div id="pdMain" class="hidden"></div>
        <div id="pdNotice" class="pd-notice"></div>
      </div>`;
    renderAuth();
  }

  function renderAuth() {
    const auth = document.querySelector('#pdAuth');
    if (!auth) return;
    if (!authSession) {
      auth.innerHTML = `<div class="pd-auth"><h3>Security Authorization</h3><p>Sign in with an authorized HIKJ Security Admin account to distribute packages.</p>
        <input id="pdEmail" type="email" placeholder="Security Admin Email" autocomplete="username">
        <input id="pdPassword" type="password" placeholder="Password" autocomplete="current-password">
        <button class="submit" id="pdLogin">SIGN IN TO DISTRIBUTE</button></div>`;
      document.querySelector('#pdLogin').onclick = async () => {
        const notice = document.querySelector('#pdNotice');
        try {
          notice.textContent = 'Signing in…';
          const { data, error } = await client.auth.signInWithPassword({ email: document.querySelector('#pdEmail').value.trim(), password: document.querySelector('#pdPassword').value });
          if (error) throw error;
          authSession = data.session;
          renderAuth();
        } catch (e) { notice.textContent = e.message || 'Unable to sign in.'; }
      };
      return;
    }
    const main = document.querySelector('#pdMain');
    main.classList.remove('hidden');
    main.innerHTML = `<div class="pd-user">Authorized: <b>${esc(authSession.user?.email)}</b><button id="pdSignOut" class="pd-link">Sign Out</button></div>
      <div class="pd-search"><input id="pdSearch" placeholder="Search package number, recipient, courier, company..." autocomplete="off"><button class="submit" id="pdSearchBtn">SEARCH</button></div>
      <div id="pdResults" class="pd-results"><div class="pd-empty">Enter a keyword or press SEARCH to find registered packages.</div></div>
      <div id="pdSelected"></div>`;
    document.querySelector('#pdSignOut').onclick = async () => { await client.auth.signOut(); authSession = null; renderAuth(); };
    const search = document.querySelector('#pdSearch');
    document.querySelector('#pdSearchBtn').onclick = searchPackages;
    search.addEventListener('input', () => { clearTimeout(searchTimer); searchTimer = setTimeout(searchPackages, 300); });
    search.addEventListener('keydown', e => { if (e.key === 'Enter') searchPackages(); });
    searchPackages();
  }

  async function searchPackages() {
    const results = document.querySelector('#pdResults');
    if (!results) return;
    results.innerHTML = '<div class="pd-empty">Searching…</div>';
    try {
      const q = encodeURIComponent(document.querySelector('#pdSearch')?.value.trim() || '');
      const data = await callApi(`?q=${q}&limit=50`);
      if (!data.data?.length) { results.innerHTML = '<div class="pd-empty">No package available for distribution.</div>'; return; }
      results.innerHTML = data.data.map((p, i) => `<button class="pd-result" data-pd-index="${i}">
        <div><b>${esc(p.submission_id)}</b><span>${esc(p.recipient_name || '—')} · ${esc(p.company_name || '—')}</span></div>
        <div><span>${esc(p.item_type || '—')} · Qty ${esc(p.item_count ?? '—')}</span><span>${esc(p.courier_name || '—')} · ${fmt(p.created_at)}</span></div>
        <em>READY FOR DISTRIBUTION</em>
      </button>`).join('');
      results._items = data.data;
      results.querySelectorAll('.pd-result').forEach(btn => btn.onclick = () => selectPackage(results._items[Number(btn.dataset.pdIndex)]));
    } catch (e) { results.innerHTML = `<div class="pd-empty pd-error">${esc(e.message)}</div>`; }
  }

  function selectPackage(pkg) {
    selected = pkg;
    const target = document.querySelector('#pdSelected');
    target.innerHTML = `<div class="pd-selected"><div class="pd-selected-head"><b>Selected Package</b><span>READY FOR DISTRIBUTION</span></div>
      <div class="pd-detail"><div><small>Package Number</small><b>${esc(pkg.submission_id)}</b></div><div><small>Recipient</small><b>${esc(pkg.recipient_name || '—')}</b></div><div><small>Company</small><b>${esc(pkg.company_name || '—')}</b></div><div><small>Item</small><b>${esc(pkg.item_type || '—')} · Qty ${esc(pkg.item_count ?? '—')}</b></div><div><small>Courier</small><b>${esc(pkg.courier_name || '—')}</b></div><div><small>Registered</small><b>${fmt(pkg.created_at)}</b></div></div>
      <button class="submit" id="pdDistribute">DISTRIBUTE PACKAGE</button></div>`;
    target.querySelector('#pdDistribute').onclick = openDistributionForm;
    target.scrollIntoView({ behavior:'smooth', block:'nearest' });
  }

  function openDistributionForm() {
    const target = document.querySelector('#pdSelected');
    target.innerHTML = `<div class="pd-selected"><div class="pd-selected-head"><b>Package Hand-Over</b><span>DISTRIBUTION</span></div>
      <div class="pd-detail"><div><small>Package Number</small><b>${esc(selected.submission_id)}</b></div><div><small>Registered Recipient</small><b>${esc(selected.recipient_name || '—')}</b></div></div>
      <label>Package Owner / Recipient Name</label><input id="pdRecipient" value="${esc(selected.recipient_name || '')}" readonly title="Read-only for registered recipient">
      <label>Security Hand Over *</label><input id="pdSecurity" placeholder="Enter Security Hand Over" required>
      <label>Distribution Date &amp; Time</label><input value="System timestamp on submission" readonly>
      <button class="submit" id="pdSubmit">SUBMIT DISTRIBUTION</button></div>`;
    target.querySelector('#pdSubmit').onclick = submitDistribution;
  }

  async function submitDistribution() {
    const security = document.querySelector('#pdSecurity')?.value.trim();
    const notice = document.querySelector('#pdNotice');
    if (!security) { notice.textContent = 'Please enter Security Hand Over.'; return; }
    const btn = document.querySelector('#pdSubmit');
    btn.disabled = true; notice.textContent = 'Processing distribution…';
    try {
      const data = await callApi('', { method:'POST', body: JSON.stringify({ package_registration_id: selected.id, recipient_name: document.querySelector('#pdRecipient').value.trim(), security_hand_over: security }) });
      notice.textContent = '';
      document.querySelector('#pdSelected').innerHTML = `<div class="pd-success"><h3>Package successfully distributed.</h3><p><b>Package Number:</b> ${esc(data.distribution.package_number)}</p><p><b>Recipient:</b> ${esc(data.distribution.recipient_name)}</p><p><b>Security Hand Over:</b> ${esc(data.distribution.security_hand_over)}</p><p><b>Distribution Date &amp; Time:</b> ${fmt(data.distribution.distributed_at)}</p><button class="submit" id="pdBack">SEARCH ANOTHER PACKAGE</button></div>`;
      document.querySelector('#pdBack').onclick = () => { selected = null; renderAuth(); };
    } catch (e) {
      notice.textContent = e.message || 'Unable to complete package distribution. Please try again.';
      btn.disabled = false;
    }
  }

  const style = document.createElement('style');
  style.textContent = `.pd-wrap{padding:0 23px 23px}.pd-wrap input{box-sizing:border-box;margin:7px 0 12px}.pd-auth{padding:10px 0}.pd-auth h3{margin:0 0 5px}.pd-auth p{opacity:.75;font-size:.8rem}.pd-auth input{display:block}.pd-user{font-size:.72rem;opacity:.8;margin-bottom:14px}.pd-link{float:right;background:none;border:0;color:var(--gold2);cursor:pointer}.pd-search{display:grid;grid-template-columns:1fr 130px;gap:9px;align-items:end}.pd-results{margin-top:15px;display:grid;gap:8px;max-height:430px;overflow:auto}.pd-result{display:grid;grid-template-columns:1.3fr 1fr auto;gap:12px;text-align:left;color:#fff;background:rgba(4,25,45,.65);border:1px solid var(--line);border-radius:12px;padding:12px;cursor:pointer}.pd-result:hover{border-color:var(--gold2);background:rgba(20,55,87,.75)}.pd-result div{display:grid;gap:4px}.pd-result span{font-size:.72rem;opacity:.72}.pd-result em{align-self:center;color:var(--gold2);font-size:.58rem;font-style:normal;font-weight:700;white-space:nowrap}.pd-empty{text-align:center;padding:22px;opacity:.7;font-size:.78rem}.pd-error{color:var(--danger)}.pd-selected{margin-top:16px;padding:15px;border:1px solid var(--line);border-radius:14px;background:rgba(3,20,36,.5)}.pd-selected-head{display:flex;justify-content:space-between;gap:10px;margin-bottom:12px}.pd-selected-head span{font-size:.58rem;color:var(--gold2);font-weight:700}.pd-detail{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:15px}.pd-detail div{display:grid;gap:3px}.pd-detail small{font-size:.62rem;opacity:.55}.pd-detail b{font-size:.76rem}.pd-selected label{display:block;margin:12px 0 4px;font-size:.76rem}.pd-success{padding:10px}.pd-success h3{margin-top:0;color:#c7f9d8}@media(max-width:700px){.pd-result{grid-template-columns:1fr}.pd-search{grid-template-columns:1fr}.pd-detail{grid-template-columns:1fr 1fr}}@media(max-width:520px){.pd-wrap{padding:0 18px 18px}.pd-detail{grid-template-columns:1fr}}`;
  document.head.appendChild(style);

  async function boot() {
    card();
    try { await initClient(); } catch (e) { console.warn('Package Distribution auth unavailable:', e); }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
