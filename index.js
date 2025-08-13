// index.js — call iban_ro (server), render verify-like fields
(function(){
  const $ = id => document.getElementById(id);
  const qs = new URLSearchParams(location.search);
  const id    = qs.get('id')||'';
  const token = qs.get('token')||'';
  const em    = qs.get('em')||'';
  const lang  = (qs.get('lang')||'de').toLowerCase();

  if ($('id')) $('id').value = id;
  if ($('token')) $('token').value = token;
  if ($('em')) $('em').value = em;

  function renderKV(rows){
    const host = document.getElementById('ro-list');
    if(!host) return;
    host.innerHTML = '';
    for(const [label,value] of rows){
      const wrap=document.createElement('div'); wrap.className='ro-item';
      const lab=document.createElement('label'); lab.textContent = label;
      const inp=document.createElement('input'); inp.readOnly=true; inp.className='input'; inp.value = value || '';
      wrap.appendChild(lab); wrap.appendChild(inp); host.appendChild(wrap);
    }
  }

  async function loadData(){
    try{
      const r = await fetch('/.netlify/functions/iban_ro', {
        method:'POST',
        headers:{ 'Content-Type':'application/json' },
        body: JSON.stringify({ id, token, em, lang })
      });
      const msgEl = $('msg');
      if(!r.ok){ msgEl && (msgEl.textContent='Link ungültig oder abgelaufen.'); return; }
      const j = await r.json();
      if(!j.ok){ msgEl && (msgEl.textContent=j.error||'Fehler.'); return; }

      const ro = j.readonly || {};
      const rows = [
        ['Gläubiger-Nr.', id],                                 // always from URL
        ['Vorname',       ro.firstname || ro.first_name || ''],
        ['Nachname',      ro.lastname || ro.last_name || ro.name || ''],
        ['Strasse',       ro.strasse || ro.street || ''],
        ['Nr.',           ro.hausnummer || ro.house_no || ro.housenumber || ''],
        ['PLZ',           ro.plz || ro.zip || ro.postcode || ''],
        ['Ort',           ro.ort || ro.city || ''],
        ['Land',          ro.country || '']
      ];
      renderKV(rows);
      $('email') && ($('email').value = j.email || '');
      $('ibanForm') && ( $('ibanForm').style.display='block' );
    }catch(e){
      $('msg') && ($('msg').textContent='Fehler beim Laden.');
    }
  }

  document.getElementById('ibanForm')?.addEventListener('submit', async (ev)=>{
    ev.preventDefault();
    const payload = new URLSearchParams();
    payload.set('id', id); payload.set('token', token); payload.set('em', em); payload.set('lang', lang);
    $('email') && payload.set('email', $('email').value);
    payload.set('iban', (document.getElementById('iban')?.value||'').replace(/\s+/g,'').toUpperCase());
    payload.set('iban_confirm', (document.getElementById('iban_confirm')?.value||'').replace(/\s+/g,'').toUpperCase());
    const r = await fetch('/.netlify/functions/iban_submit', { method:'POST', headers:{'Content-Type':'application/x-www-form-urlencoded'}, body: payload.toString() });
    if(r.status===302 || r.redirected){ location.href='/danke.html'; return; }
    if(r.ok){ const j=await r.json().catch(()=>({})); location.href=(j&&j.redirect)||'/danke.html'; return; }
    $('msg') && ($('msg').textContent = await r.text());
  });

  loadData();
})();