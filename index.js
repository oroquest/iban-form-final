// index.js — Verify-style: UI calls server proxy iban_ro (POST) only
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

  function render(rows){
    const host = document.getElementById('ro-list');
    if(!host) return;
    host.innerHTML='';
    for(const [label,value] of rows){
      const w=document.createElement('div'); w.className='ro-item';
      const l=document.createElement('label'); l.textContent=label;
      const i=document.createElement('input'); i.readOnly=true; i.className='input'; i.value=value||'';
      w.appendChild(l); w.appendChild(i); host.appendChild(w);
    }
  }

  async function loadData(){
    try{
      const r = await fetch('/.netlify/functions/iban_ro', {
        method:'POST',
        headers:{ 'Content-Type':'application/json' },
        body: JSON.stringify({ id, token, em, lang })
      });
      if(!r.ok){ $('msg') && ($('msg').textContent='Link ungültig oder abgelaufen.'); return; }
      const j = await r.json();
      if(!j.ok){ $('msg') && ($('msg').textContent=j.error||'Fehler.'); return; }
      $('email') && ($('email').value = j.email || '');

      const p = j.readonly || {};
      const rows = [
        ['Gläubiger-Nr.', id], // always from URL (verify UX)
        ['Vorname',       p.firstname || p.first_name || ''],
        ['Nachname',      p.lastname  || p.last_name  || p.name || ''],
        ['Strasse',       p.strasse   || p.street     || ''],
        ['Nr.',           p.hausnummer|| p.house_no   || p.housenumber || ''],
        ['PLZ',           p.plz       || p.zip        || p.postcode || ''],
        ['Ort',           p.ort       || p.city       || ''],
        ['Land',          p.country   || '']
      ];
      render(rows);
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