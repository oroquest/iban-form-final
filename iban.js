(function(){
  const qs = new URLSearchParams(location.search);
  const id    = qs.get('id')||'';
  const token = qs.get('token')||'';
  const em    = qs.get('em')||'';
  const lang  = (qs.get('lang')||'de').toLowerCase();

  const $ = (id)=>document.getElementById(id);
  const msg = (t)=>{ const el=document.getElementById('msg'); if(el){ el.textContent = t; } };

  async function init(){
    try{
      const r = await fetch(`/.netlify/functions/iban_check?id=${encodeURIComponent(id)}&token=${encodeURIComponent(token)}&em=${encodeURIComponent(em)}&lang=${encodeURIComponent(lang)}`);
      if(!r.ok){ msg('Link ungültig oder abgelaufen.'); return; }
      const j = await r.json();
      // Render readonly list
      const host = document.getElementById('ro-list'); host.innerHTML='';
      Object.entries(j.readonly||{}).forEach(([k,v])=>{
        const row=document.createElement('div'); row.className='ro-row';
        const label=document.createElement('label'); label.textContent=k;
        const input=document.createElement('input'); input.value=String(v||''); input.readOnly=true;
        row.appendChild(label); row.appendChild(input); host.appendChild(row);
      });
      document.getElementById('ibanForm').style.display='block';
      document.getElementById('email').value = j.email || '';
    }catch(e){ msg('Fehler beim Laden.'); }
  }

  document.addEventListener('DOMContentLoaded', init);

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

  document.addEventListener('submit', async (ev)=>{
    if(ev.target && ev.target.id==='ibanForm'){
      ev.preventDefault();
      const iban = document.getElementById('iban').value.trim();
      const iban2= document.getElementById('iban_confirm').value.trim();
      if(iban!==iban2){ msg('IBAN stimmt nicht überein.'); return; }
      if(!isValidIBAN(iban)){ msg('IBAN ungültig.'); return; }

      const payload = new URLSearchParams();
      payload.set('id', id);
      payload.set('token', token);
      payload.set('em', em);
      payload.set('lang', lang);
      payload.set('email', document.getElementById('email').value);
      payload.set('iban', iban);
      payload.set('iban_confirm', iban2);

      const r = await fetch('/.netlify/functions/iban_submit', {
        method:'POST',
        headers:{ 'Content-Type':'application/x-www-form-urlencoded' },
        body: payload.toString()
      });
      if(r.status===302 || r.redirected){ location.href='/danke.html'; return; }
      if(r.ok){
        const j = await r.json().catch(()=>({}));
        if(j.redirect){ location.href=j.redirect; return; }
        location.href='/danke.html';
        return;
      }
      const t = await r.text(); msg('Fehler: '+t);
    }
  });
})();