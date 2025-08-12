(function(){
  const $=id=>document.getElementById(id);
  const qs=new URLSearchParams(location.search);
  const id=qs.get('id')||''; const token=qs.get('token')||''; const em=qs.get('em')||''; const lang=(qs.get('lang')||'de').toLowerCase();
  $('id').value=id; $('token').value=token; $('em').value=em; document.getElementById('langSel').value=lang;

  function renderKV(obj){ const host=document.getElementById('ro-list'); host.innerHTML=''; Object.entries(obj||{}).forEach(([k,v])=>{ const w=document.createElement('div'); const l=document.createElement('label'); l.textContent=k; const i=document.createElement('input'); i.readOnly=true; i.className='input'; i.value=String(v||''); w.appendChild(l); w.appendChild(i); host.appendChild(w); }); }

  async function init(){
    const r = await fetch(`/.netlify/functions/iban_check?id=${encodeURIComponent(id)}&token=${encodeURIComponent(token)}&em=${encodeURIComponent(em)}&lang=${encodeURIComponent(lang)}`, {cache:'no-store'});
    if(!r.ok){ document.getElementById('msg').textContent='Link ungültig oder abgelaufen.'; return; }
    const j = await r.json();
    if(!j.ok){ document.getElementById('msg').textContent=j.error||'Fehler.'; return; }
    $('email').value=j.email||'';
    const view = (j.readonly && Object.keys(j.readonly).length)? j.readonly : (j.props_all||{});
    renderKV(view);
    document.getElementById('ibanForm').style.display='block';
  }

  document.getElementById('ibanForm').addEventListener('submit', async (ev)=>{
    ev.preventDefault();
    const payload = new URLSearchParams();
    payload.set('id', id); payload.set('token', token); payload.set('em', em); payload.set('lang', lang);
    payload.set('email', $('email').value); payload.set('iban', $('iban').value); payload.set('iban_confirm', $('iban_confirm').value);
    const r = await fetch('/.netlify/functions/iban_submit', { method:'POST', headers:{'Content-Type':'application/x-www-form-urlencoded'}, body: payload.toString() });
    if(r.status===302 || r.redirected){ location.href='/danke.html'; return; }
    if(r.ok){ const j=await r.json().catch(()=>({})); location.href=(j&&j.redirect)||'/danke.html'; return; }
    document.getElementById('msg').textContent = await r.text();
  });

  init();
})();