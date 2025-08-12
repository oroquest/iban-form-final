(function(){
  const qs = new URLSearchParams(location.search);
  const id    = qs.get('id')||'';
  const token = qs.get('token')||'';
  const em    = qs.get('em')||'';
  const lang  = qs.get('lang')||'de';

  const $ = (id)=>document.getElementById(id);
  const msg = (t)=>{ const el=$('msg'); if(el){ el.textContent = t; } };

  $('id').value = id;
  $('token').value = token;
  $('em').value = em;
  $('lang').value = lang;

  function renderReadonly(readonly){
    const host = document.getElementById('ro-list');
    host.innerHTML = '';
    const keys = Object.keys(readonly||{});
    if(!keys.length){
      host.innerHTML = '<p>Keine Daten vorhanden.</p>';
      return;
    }
    for(const k of keys){
      const v = readonly[k];
      const row = document.createElement('div');
      row.className = 'ro-row';
      const label = document.createElement('label');
      label.textContent = k;
      const input = document.createElement('input');
      input.value = String(v || '');
      input.readOnly = true;
      row.appendChild(label);
      row.appendChild(input);
      host.appendChild(row);
    }
  }

  function isValidIBAN(s){
    s = String(s||'').replace(/\s+/g,'').toUpperCase();
    if(!/^[A-Z]{2}\d{2}[A-Z0-9]{1,30}$/.test(s)) return false;
    const rearr = s.slice(4)+s.slice(0,4);
    const expanded = rearr.replace(/[A-Z]/g, ch => (ch.charCodeAt(0)-55).toString());
    let rem=0;
    for(let i=0;i<expanded.length;i++){
      const code = expanded.charCodeAt(i)-48;
      if(code<0||code>35) return false;
      rem=(rem*10+code)%97;
    }
    return rem===1;
  }

  async function init(){
    try{
      const r = await fetch(`/.netlify/functions/iban_check?id=${encodeURIComponent(id)}&token=${encodeURIComponent(token)}&em=${encodeURIComponent(em)}&lang=${encodeURIComponent(lang)}`, { credentials:'omit' });
      if(!r.ok){ msg('Link ungültig oder abgelaufen.'); return; }
      const j = await r.json();
      const email = j.email || '';
      $('email').value = email;

      renderReadonly(j.readonly || {});
      document.getElementById('ibanForm').style.display = 'block';
    }catch(e){
      msg('Fehler beim Laden.');
    }
  }

  document.getElementById('ibanForm').addEventListener('submit', async (ev)=>{
    ev.preventDefault();
    const iban = $('iban').value.trim();
    const iban2 = $('iban_confirm').value.trim();
    if(iban !== iban2){ msg('IBAN stimmt nicht überein.'); return; }
    if(!isValidIBAN(iban)){ msg('IBAN ungültig.'); return; }

    const payload = new URLSearchParams();
    payload.set('id', id);
    payload.set('token', token);
    payload.set('em', em);
    payload.set('lang', lang);
    payload.set('email', $('email').value);
    payload.set('iban', iban);
    payload.set('iban_confirm', iban2);

    const r = await fetch('/.netlify/functions/iban_submit', {
      method:'POST',
      headers:{ 'Content-Type':'application/x-www-form-urlencoded' },
      body: payload.toString()
    });

    if(r.status===302 || r.redirected){
      location.href = '/danke.html'; return;
    }
    if(r.ok){
      const j = await r.json().catch(()=>({}));
      if(j && j.redirect){ location.href = j.redirect; return; }
      location.href = '/danke.html'; return;
    }
    const t = await r.text();
    msg('Fehler: '+t);
  });

  init();
})();