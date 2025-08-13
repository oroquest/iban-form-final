(function(){
  const $=id=>document.getElementById(id);
  const qs=new URLSearchParams(location.search);
  const id=qs.get('id')||''; const token=qs.get('token')||''; const em=qs.get('em')||''; const lang=(qs.get('lang')||'de').toLowerCase();
  $('id').value=id; $('token').value=token; $('em').value=em; document.getElementById('langSel').value=lang;

  function renderKV(ro){
    const rows=[
      ['Gläubiger-Nr.', id],
      ['Vorname', ro.firstname||ro.first_name||''],
      ['Nachname', ro.lastname||ro.last_name||ro.name||''],
      ['Strasse', ro.strasse||ro.street||''],
      ['Nr.', ro.hausnummer||ro.house_no||ro.housenumber||''],
      ['PLZ', ro.plz||ro.zip||ro.postcode||''],
      ['Ort', ro.ort||ro.city||''],
      ['Land', ro.country||'']
    ];
    const host=document.getElementById('ro-list'); host.innerHTML='';
    for(const [label,value] of rows){ const w=document.createElement('div'); const l=document.createElement('label'); l.textContent=label; const i=document.createElement('input'); i.readOnly=true; i.className='input'; i.value=String(value||''); w.appendChild(l); w.appendChild(i); host.appendChild(w); }
  }

  const iban=$('iban'), iban2=$('iban_confirm'), btn=$('submitBtn'), c1=$('c1'), c2=$('c2');
  function clean(x){return String(x||'').replace(/\s+/g,'').toUpperCase()}
  function isValidIBAN(v){ const s=clean(v); if(!/^[A-Z]{2}\d{2}[A-Z0-9]{1,30}$/.test(s)) return false; const r=s.slice(4)+s.slice(0,4); const e=r.replace(/[A-Z]/g,ch=>(ch.charCodeAt(0)-55).toString()); let m=0; for(let i=0;i<e.length;i++){ const c=e.charCodeAt(i)-48; if(c<0||c>35) return false; m=(m*10+c)%97; } return m===1; }
  function update(){ const a=clean(iban.value), b=clean(iban2.value); const ok = a && b && a===b && isValidIBAN(a) && c1.checked && c2.checked; btn.disabled=!ok; }
  iban?.addEventListener('input', ()=>{ const v=iban.value; iban.value=clean(v).replace(/(.{4})/g,'$1 ').trim(); update(); });
  iban2?.addEventListener('input', update); c1?.addEventListener('change', update); c2?.addEventListener('change', update);

  async function init(){
    const r = await fetch('/.netlify/functions/iban_ro', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ id, token, em, lang }) });
    if(!r.ok){ document.getElementById('msg').textContent='Link ungültig oder abgelaufen.'; return; }
    const j = await r.json(); if(!j.ok){ document.getElementById('msg').textContent=j.error||'Link ungültig.'; return; }
    $('email').value=j.email||''; renderKV(j.readonly||{}); document.getElementById('ibanForm').style.display='block';
  }

  document.getElementById('ibanForm').addEventListener('submit', async (ev)=>{
    ev.preventDefault();
    const payload=new URLSearchParams(); payload.set('id',id); payload.set('token',token); payload.set('em',em); payload.set('lang',lang); payload.set('email',$('email').value); payload.set('iban',clean(iban.value)); payload.set('iban_confirm',clean(iban2.value));
    const r=await fetch('/.netlify/functions/iban_submit',{ method:'POST', headers:{'Content-Type':'application/x-www-form-urlencoded'}, body: payload.toString() });
    if(r.status===302||r.redirected){ location.href='/danke.html'; return; }
    if(r.ok){ const j=await r.json().catch(()=>({})); location.href=(j&&j.redirect)||'/danke.html'; return; }
    document.getElementById('msg').textContent=await r.text();
  });

  init();
})();