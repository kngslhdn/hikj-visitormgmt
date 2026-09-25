/* HIKJ Package Distribution - Security workflow */
(() => {
  const CONFIG = window.SECUREOPS_CONFIG || {};
  const SUPABASE_URL = CONFIG.SUPABASE_URL || '';
  const FUNCTION_URL = (CONFIG.SUPABASE_FUNCTIONS_URL || (SUPABASE_URL ? SUPABASE_URL+'/functions/v1' : '')) + '/package-distribution';
  let client = null;
  let selected = null;
  let authSession = null;
  let searchTimer = null;
  const PD_LANG=/^id(?:-|$)/i.test(navigator.languages?.[0]||navigator.language||'en')?'id':'en';
  const PDT=(en,id)=>PD_LANG==='id'?id:en;
  const PD_VALUE=v=>({LETTER:PDT('LETTER','SURAT'),PACKAGE:PDT('PACKAGE','PAKET'),STAFF:PDT('STAFF','STAF'),GUEST:PDT('GUEST','TAMU')}[String(v||'')]||v||'—');

  function loadSupabase() {
    return new Promise((resolve, reject) => {
      if (window.supabase?.createClient) return resolve();
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
      s.onload = () => resolve();
      s.onerror = () => reject(new Error(PDT('Unable to load authentication library','Gagal memuat library autentikasi')));
      document.head.appendChild(s);
    });
  }

  function getPublishableKey() {
    return CONFIG.SUPABASE_PUBLISHABLE_KEY || '';
  }

  const esc = v => String(v ?? '').replace(/[&<>\"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  const fmt = v => v ? new Date(v).toLocaleString('en-GB', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' }) : '—';

  function card() {
    const root = document.querySelector('#choices');
    if (!root || document.querySelector('[data-distribution-card]')) return;
    root.insertAdjacentHTML('beforeend', `<button type="button" class="choice" data-distribution-card aria-pressed="false">
      <span class="choice-icon"><svg viewBox="0 0 48 48"><path d="M9 15l15-7 15 7-15 7zM9 15v18l15 8 15-8V15M24 22v19"/><path d="M31 30h9M35 26l5 4-5 4"/></svg></span>
      <strong>${PDT('Package Distribution','Distribusi Paket')}</strong>
    </button>`);
    root.addEventListener('click', ev => {
      const btn = ev.target.closest('[data-distribution-card]');
      if (btn) { ev.stopImmediatePropagation(); openDistribution(); }
    }, true);
  }

  function tuneCards() {
    document.querySelectorAll('.choice .arrow').forEach(el => el.remove());
    const style = document.createElement('style');
    style.id = 'hikj-card-layout-v3';
    style.textContent = `
      .choices{grid-template-columns:repeat(6,170px);gap:8px;width:max-content;max-width:100%}
      .choice,.choice:last-child{width:170px;height:166px;min-height:166px;padding:24px 14px 16px;justify-self:center;justify-content:flex-start}
      .choice-icon{margin:0 auto 11px;flex:0 0 58px}
      .choice strong{min-height:42px;width:100%;line-height:1.3;display:flex;align-items:center;justify-content:center}
      @media(max-width:900px){
        .choices{grid-template-columns:repeat(3,170px);width:526px;max-width:100%}
        .choice,.choice:last-child{width:170px;height:166px;min-height:166px}
      }
      @media(max-width:520px){
        .choices{grid-template-columns:1fr;width:100%;gap:11px}
        .choice,.choice:last-child{width:100%;height:92px;min-height:92px;padding:12px 16px;flex-direction:row;align-items:center;justify-content:flex-start}
        .choice-icon{width:54px;height:54px;min-width:54px;flex:0 0 54px;margin:0 16px 0 0}
        .choice-icon svg{width:29px;height:29px}
        .choice strong{width:auto;min-height:0;flex:1;justify-content:flex-start;font-size:.96rem;line-height:1.25}
      }
    `;
    document.head.appendChild(style);
  }

  async function initClient() {
    await loadSupabase();
    const key = getPublishableKey();
    if (!key) throw new Error(PDT('Supabase publishable key is not available','Supabase publishable key tidak tersedia'));
    client = window.supabase.createClient(SUPABASE_URL, key);
    const { data } = await client.auth.getSession();
    authSession = data?.session || null;
    client.auth.onAuthStateChange((_event, session) => { authSession = session; });
  }

  async function callApi(path, options = {}) {
    if (!authSession?.access_token) throw new Error(PDT('Please sign in as an authorized Security Admin first','Silakan masuk sebagai Admin Security yang berwenang terlebih dahulu'));
    const headers = { 'apikey': getPublishableKey(), 'Authorization': `Bearer ${authSession.access_token}`, 'Content-Type': 'application/json' };
    const r = await fetch(`${FUNCTION_URL}${path}`, { ...options, headers: { ...headers, ...(options.headers || {}) } });
    const body = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(body.error || PDT('Unable to complete package distribution. Please try again','Distribusi paket gagal. Silakan coba lagi'));
    return body;
  }

  function openDistribution() {
    const panel = document.querySelector('#panel');
    if (!panel) return;
    document.querySelectorAll('.choice[data-form]').forEach(x => x.setAttribute('aria-pressed','false'));
    document.querySelector('[data-distribution-card]')?.setAttribute('aria-pressed','true');
    panel.classList.add('visible');
    panel.innerHTML = `<div class="panel-header"><h2>${PDT('Package Distribution','Distribusi Paket')}</h2><p>${PDT('Search a registered package and complete the hand-over process','Cari paket yang telah terdaftar dan selesaikan proses serah terima')}</p></div>
      <div class="pd-wrap"><div id="pdAuth"></div><div id="pdMain" class="hidden"></div><div id="pdNotice" class="pd-notice"></div></div>`;
    renderAuth();
  }

  function renderAuth() {
    const auth = document.querySelector('#pdAuth');
    const main = document.querySelector('#pdMain');
    const notice = document.querySelector('#pdNotice');
    if (!auth || !main) return;
    if (!authSession) {
      auth.innerHTML = '';
      auth.innerHTML = `<div class="pd-auth"><h3>${PDT('Security Authorization','Otorisasi Keamanan')}</h3><p>${PDT('Sign in with an authorized HIKJ Security Admin account to distribute packages','Masuk dengan akun Admin Security HIKJ yang berwenang untuk mendistribusikan paket')}</p>
        <input id="pdEmail" type="email" placeholder="${PDT('Security Admin Email','Email Admin Security')}" autocomplete="username">
        <input id="pdPassword" type="password" placeholder="Password" autocomplete="current-password">
        <button class="submit" id="pdLogin">${PDT('SIGN IN TO DISTRIBUTE','MASUK UNTUK DISTRIBUSI')}</button></div>`;
      document.querySelector('#pdLogin').onclick = async () => {
        const notice = document.querySelector('#pdNotice');
        try {
          notice.textContent = PDT('Signing in…','Memproses login…');
          const { data, error } = await client.auth.signInWithPassword({ email: document.querySelector('#pdEmail').value.trim(), password: document.querySelector('#pdPassword').value });
          if (error) throw error;
          authSession = data.session;
          renderAuth();
        } catch (e) { notice.textContent = e.message || PDT('Unable to sign in','Gagal masuk.'); }
      };
      return;
    }
    auth.innerHTML = '';
    if (notice) notice.textContent = '';
    main.classList.remove('hidden');
    main.innerHTML = `<div class="pd-user">${PDT('Authorized:','Terotorisasi:')} <b>${esc(authSession.user?.email)}</b><button id="pdSignOut" class="pd-link">${PDT('Sign Out','Keluar')}</button></div>
      <div class="pd-search"><input id="pdSearch" placeholder="${PDT('Search package ID, recipient, courier, company','Cari ID paket, penerima, kurir, perusahaan')}" autocomplete="off"><button class="submit" id="pdSearchBtn">${PDT('SEARCH','CARI')}</button></div>
      <div id="pdResults" class="pd-results"><div class="pd-empty">${PDT(PDT('Enter a keyword or press SEARCH to find registered packages','Masukkan kata kunci atau tekan CARI untuk mencari paket terdaftar'),'Masukkan kata kunci atau tekan CARI untuk mencari paket terdaftar')}</div></div><div id="pdSelected"></div>`;
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
    results.innerHTML = `<div class="pd-empty">${PDT('Searching…','Mencari…')}</div>`;
    try {
      const q = encodeURIComponent(document.querySelector('#pdSearch')?.value.trim() || '');
      const response = await callApi(`?q=${q}&limit=50`);
      const items = Array.isArray(response?.data) ? response.data : (Array.isArray(response?.packages) ? response.packages : []);
      if (!items.length) { results.innerHTML = `<div class="pd-empty">${PDT('No package available for distribution','Tidak ada paket yang tersedia untuk didistribusikan')}</div>`; return; }
      results.innerHTML = items.map((p, i) => `<button class="pd-result" data-pd-index="${i}">
        <div><b>${esc(p.submission_id || p.package_number)}</b><span>${esc(p.recipient_name || '—')} · ${esc(p.company_name || '—')}</span></div>
        <div><span>${esc(PD_VALUE(p.item_type))} · Qty ${esc(p.item_count ?? '—')}</span><span>${esc(p.courier_name || '—')} · ${fmt(p.created_at)}</span></div>
        <em>${PDT('READY FOR DISTRIBUTION','SIAP DIDISTRIBUSIKAN')}</em></button>`).join('');
      results._items = items;
      results.querySelectorAll('.pd-result').forEach(btn => btn.onclick = () => selectPackage(results._items[Number(btn.dataset.pdIndex)]));
    } catch (e) { results.innerHTML = `<div class="pd-empty pd-error">${esc(e.message)}</div>`; }
  }

  function selectPackage(pkg) {
    selected = pkg;
    const target = document.querySelector('#pdSelected');
    target.innerHTML = `<div class="pd-selected"><div class="pd-selected-head"><b>${PDT('Selected Package','Paket Terpilih')}</b><span>${PDT('READY FOR DISTRIBUTION','SIAP DIDISTRIBUSIKAN')}</span></div>
      <div class="pd-detail"><div><small>${PDT('Package ID','ID Paket')}</small><b>${esc(pkg.submission_id || pkg.package_number)}</b></div><div><small>${PDT('Recipient','Penerima')}</small><b>${esc(pkg.recipient_name || '—')}</b></div><div><small>${PDT('Company','Perusahaan')}</small><b>${esc(pkg.company_name || '—')}</b></div><div><small>${PDT('Item','Barang')}</small><b>${esc(PD_VALUE(pkg.item_type))} · Qty ${esc(pkg.item_count ?? '—')}</b></div><div><small>${PDT('Courier','Kurir')}</small><b>${esc(pkg.courier_name || '—')}</b></div><div><small>${PDT('Registered','Terdaftar')}</small><b>${fmt(pkg.created_at)}</b></div></div>
      <button class="submit" id="pdDistribute">${PDT('DISTRIBUTE PACKAGE','DISTRIBUSIKAN PAKET')}</button></div>`;
    target.querySelector('#pdDistribute').onclick = openDistributionForm;
    target.scrollIntoView({ behavior:'smooth', block:'nearest' });
  }

  function openDistributionForm() {
    const target = document.querySelector('#pdSelected');
    target.innerHTML = `<div class="pd-selected"><div class="pd-selected-head"><b>${PDT('Package Hand-Over','Serah Terima Paket')}</b><span>${PDT('DISTRIBUTION','DISTRIBUSI')}</span></div>
      <div class="pd-detail"><div><small>${PDT('Package ID','ID Paket')}</small><b>${esc(selected.submission_id || selected.package_number)}</b></div><div><small>${PDT('Registered Recipient','Penerima Terdaftar')}</small><b>${esc(selected.recipient_name || '—')}</b></div></div>
      <label>${PDT('Package Owner / Recipient Name','Nama Pemilik / Penerima Paket')}</label><input id="pdRecipient" value="${esc(selected.recipient_name || '')}" placeholder="${PDT('Recipient / Representative Name','Nama Penerima / Perwakilan')}" autocomplete="off">
      <small class="pd-hint">${PDT('Defaulted to the registered recipient. Edit if the package is received by a representative or delegate','Secara default menggunakan penerima terdaftar. Ubah jika paket diterima oleh perwakilan atau delegasi')}</small>
      <label>${PDT('Note','Catatan')}</label><textarea id="pdNote" placeholder="${PDT('Department, pigeon hole, or other note','Departemen, pigeon hole, atau catatan lainnya')}" rows="2"></textarea>
      <small class="pd-hint">${PDT('Add the department, pigeon hole location, or other information to help identify the recipient','Tambahkan departemen, lokasi pigeon hole, atau informasi lain untuk membantu mengidentifikasi penerima')}</small>
      <label>${PDT('Security Hand Over *','Serah Terima Security *')}</label><input id="pdSecurity" placeholder="${PDT('Enter Security Hand Over','Masukkan Nama Petugas Security')}" required>
      <label>${PDT('Distribution Date &amp; Time','Tanggal &amp; Waktu Distribusi')}</label><input value="${fmt(new Date())}" readonly>
      <button class="submit" id="pdSubmit">${PDT('SUBMIT DISTRIBUTION','KIRIM DISTRIBUSI')}</button></div>`;
    target.querySelector('#pdSubmit').onclick = submitDistribution;
  }

  async function submitDistribution() {
    const security = document.querySelector('#pdSecurity')?.value.trim();
    const recipient = document.querySelector('#pdRecipient')?.value.trim();
    const note = document.querySelector('#pdNote')?.value.trim() || '';
    const notice = document.querySelector('#pdNotice');
    if (!recipient) { notice.textContent = PDT('Please enter Recipient / Representative Name','Silakan masukkan Nama Penerima / Perwakilan'); return; }
    if (!security) { notice.textContent = PDT('Please enter Security Hand Over','Silakan masukkan Nama Petugas Security'); return; }
    const btn = document.querySelector('#pdSubmit');
    btn.disabled = true; notice.textContent = PDT('Processing distribution…','Memproses distribusi…');
    try {
      const data = await callApi('', { method:'POST', body: JSON.stringify({ package_registration_id: selected.id, recipient_name: recipient, security_hand_over: security, note }) });
      notice.textContent = '';
      document.querySelector('#pdSelected').innerHTML = `<div class="pd-success"><h3>${PDT('Package successfully distributed','Paket berhasil didistribusikan')}</h3><p><b>${PDT('Distribution ID:','ID Distribusi:')}</b> ${esc(data.distribution.distribution_number||'—')}</p><p><b>${PDT('Package ID:','ID Paket:')}</b> ${esc(data.distribution.package_number)}</p><p><b>${PDT('Recipient:','Penerima:')}</b> ${esc(data.distribution.recipient_name)}</p><p><b>${PDT('Note:','Catatan:')}</b> ${esc(data.distribution.note || '—')}</p><p><b>${PDT('Security Hand Over:','Serah Terima Security:')}</b> ${esc(data.distribution.security_hand_over)}</p><p><b>${PDT('Distribution Date &amp; Time:','Tanggal &amp; Waktu Distribusi:')}</b> ${fmt(data.distribution.distributed_at)}</p><button class="submit" id="pdBack">${PDT('SEARCH ANOTHER PACKAGE','CARI PAKET LAIN')}</button></div>`;
      document.querySelector('#pdBack').onclick = () => { selected = null; renderAuth(); };
    } catch (e) {
      notice.textContent = e.message || PDT('Unable to complete package distribution. Please try again','Distribusi paket gagal. Silakan coba lagi');
      btn.disabled = false;
    }
  }

  const style = document.createElement('style');
  style.textContent = `.pd-wrap{padding:0 23px 23px}.pd-wrap input,.pd-wrap textarea{box-sizing:border-box;margin:7px 0 12px}.pd-wrap textarea{width:100%;resize:vertical;min-height:58px;border:0;border-bottom:1px solid var(--line);background:transparent;color:#fff;font:inherit;outline:none;padding:7px 5px}.pd-wrap textarea:focus{border-bottom-color:var(--gold2)}.pd-auth{padding:10px 0}.pd-auth h3{margin:0 0 5px;font-size:.94rem}.pd-auth p{opacity:.75;font-size:.8rem}.pd-auth input{display:block}.pd-user{font-size:.72rem;opacity:.8;margin-bottom:14px}.pd-link{float:right;background:none;border:0;color:var(--gold2);cursor:pointer}.pd-search{display:grid;grid-template-columns:1fr 130px;gap:9px;align-items:end}.pd-results{margin-top:15px;display:grid;gap:8px;max-height:430px;overflow:auto}.pd-result{display:grid;grid-template-columns:1.3fr 1fr auto;gap:12px;text-align:left;color:#fff;background:rgba(4,25,45,.65);border:1px solid var(--line);border-radius:12px;padding:12px;cursor:pointer}.pd-result:hover{border-color:var(--gold2);background:rgba(20,55,87,.75)}.pd-result div{display:grid;gap:4px}.pd-result span{font-size:.72rem;opacity:.72}.pd-result em{align-self:center;color:var(--gold2);font-size:.58rem;font-style:normal;font-weight:700;white-space:nowrap}.pd-empty{text-align:center;padding:22px;opacity:.7;font-size:.78rem}.pd-error{color:var(--danger)}.pd-selected{margin-top:16px;padding:15px;border:1px solid var(--line);border-radius:14px;background:rgba(3,20,36,.5)}.pd-selected-head{display:flex;justify-content:space-between;gap:10px;margin-bottom:12px}.pd-selected-head span{font-size:.58rem;color:var(--gold2);font-weight:700}.pd-detail{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:15px}.pd-detail div{display:grid;gap:3px}.pd-detail small{font-size:.62rem;opacity:.55}.pd-detail b{font-size:.76rem}.pd-selected label{display:block;margin:12px 0 4px;font-size:.76rem}.pd-hint{display:block;font-size:.64rem;opacity:.62;line-height:1.45;margin:-5px 0 8px}.pd-success{padding:10px}.pd-success h3{margin-top:0;color:#c7f9d8}@media(max-width:700px){.pd-result{grid-template-columns:1fr}.pd-search{grid-template-columns:1fr}.pd-detail{grid-template-columns:1fr 1fr}}@media(max-width:520px){.pd-wrap{padding:0 18px 18px}.pd-detail{grid-template-columns:1fr}}`;
  document.head.appendChild(style);

  async function boot() { card(); tuneCards(); try { await initClient(); } catch (e) { console.warn('Package Distribution auth unavailable:', e); } }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
