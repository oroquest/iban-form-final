// /index.js — ensure no inline script, only external file (complies with CSP 'self')
(function(){
  const qs = new URLSearchParams(location.search);
  const id    = qs.get('id')||'';
  const token = qs.get('token')||'';
  const em    = qs.get('em')||'';
  const lang  = qs.get('lang')||'de';

  const $ = (id)=>document.getElementById(id);
  const msg = (t)=>{ const el=$('msg'); if(el){ el.textContent = t; } };

  if($('id')) $('id').value = id;
  if($('token')) $('token').value = token;
  if($('em')) $('em').value = em;
  if($('lang')) $('lang').value = lang;

  function renderKV(obj){
    const host = document.getElementById('ro-list');
    if(!host) return;
    host.innerHTML = '';
    const pairs = Object.entries(obj||{});
    if(!pairs.length){ host.innerHTML = '<p>Keine Daten vorhanden.</p>'; return; }
    for(const [k,v] of pairs){
      const row = document.createElement('div');
      row.className = 'ro-row';
      const label = document.createElement('label'); label.textContent = k;
      const input = document.createElement('input'); input.value = String(v ?? ''); input.readOnly = true;
      row.appendChild(label); row.appendChild(input); host.appendChild(row);
    }
  }

  async function init(){
    try{
      if(!token || (!em && !qs.get('email'))){ msg('Link ist unvollständig.'); return; }
      const body = { id, token, em, lang };
      const r = await fetch('/.netlify/functions/iban_ro', {
        method:'POST',
        headers:{ 'Content-Type':'application/json' },
        body: JSON.stringify(body),
        cache: 'no-store'
      });
      if(!r.ok){ msg('Link ungültig oder abgelaufen.'); return; }
      const j = await r.json();

      if($('email')) $('email').value = j.email || '';

      const base = {};
      if (j.email) base.email = j.email;
      if (id) base.id = id;

      const view = (j.readonly && Object.keys(j.readonly).length) ? { ...base, ...j.readonly } :
                   (j.props_all && Object.keys(j.props_all).length) ? { ...base, ...j.props_all } :
                   base;

      renderKV(view);
      const form = document.getElementById('ibanForm');
      if(form) form.style.display = 'block';
    }catch(e){ msg('Fehler beim Laden.'); }
  }

  const formEl = document.getElementById('ibanForm');
  if(formEl){
    formEl.addEventListener('submit', async (ev)=>{
      ev.preventDefault();
      const iban  = $('iban').value.trim();
      const iban2 = $('iban_confirm').value.trim();
      if(iban !== iban2){ msg('IBAN stimmt nicht überein.'); return; }

      const payload = new URLSearchParams();
      payload.set('id', id); payload.set('token', token); payload.set('em', em); payload.set('lang', lang);
      payload.set('email', $('email').value); payload.set('iban', iban); payload.set('iban_confirm', iban2);

      const r = await fetch('/.netlify/functions/iban_submit', {
        method:'POST', headers:{ 'Content-Type':'application/x-www-form-urlencoded' }, body: payload.toString()
      });

      if(r.status===302 || r.redirected){ location.href = '/danke.html'; return; }
      if(r.ok){ const j = await r.json().catch(()=>({})); location.href = (j && j.redirect) || '/danke.html'; return; }
      msg('Fehler: '+ await r.text());
    });
  }

  init();
})();