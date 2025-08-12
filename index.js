// index.js – shows exact backend error if DEBUG=1
(function(){
  const $=id=>document.getElementById(id);
  const qs=new URLSearchParams(location.search);
  const id=qs.get('id')||''; const token=(qs.get('token')||'').trim(); const em=qs.get('em')||''; const lang=(qs.get('lang')||'de').toLowerCase();
  const msgEl = document.getElementById('msg');
  function showErr(txt){ if(msgEl){ msgEl.textContent = txt; msgEl.className='feedback'; } }

  async function init(){
    const url = `/.netlify/functions/iban_check?id=${encodeURIComponent(id)}&token=${encodeURIComponent(token)}&em=${encodeURIComponent(em)}&lang=${encodeURIComponent(lang)}`;
    const r = await fetch(url, {cache:'no-store'});
    let bodyText = await r.text();
    let j = null; try { j = JSON.parse(bodyText); } catch{}
    if(!r.ok || !j || j.ok===false){
      // Show detailed reason if available
      if(j && j.error){
        let detail = j.error;
        if(j.got || j.stored){ detail += ' | ' + JSON.stringify({ got:j.got, stored:j.stored }); }
        showErr('Link ungültig oder abgelaufen: ' + detail);
      }else{
        showErr('Link ungültig oder abgelaufen.');
      }
      return;
    }
    document.getElementById('email').value = j.email || '';
    const view = (j.readonly && Object.keys(j.readonly).length)? j.readonly : (j.props_all||{});
    const host=document.getElementById('ro-list'); host.innerHTML='';
    Object.entries(view).forEach(([k,v])=>{
      const w=document.createElement('div'); const l=document.createElement('label'); l.textContent=k; const i=document.createElement('input'); i.readOnly=true; i.className='input'; i.value=String(v||''); w.appendChild(l); w.appendChild(i); host.appendChild(w);
    });
    document.getElementById('ibanForm').style.display='block';
  }

  document.getElementById('ibanForm').addEventListener('submit', async (ev)=>{
    ev.preventDefault();
    const payload = new URLSearchParams();
    payload.set('id', qs.get('id')||''); payload.set('token', qs.get('token')||''); payload.set('em', qs.get('em')||''); payload.set('lang', qs.get('lang')||'de');
    payload.set('email', (document.getElementById('email').value||'')); payload.set('iban', (document.getElementById('iban').value||'')); payload.set('iban_confirm', (document.getElementById('iban_confirm').value||''));
    const r = await fetch('/.netlify/functions/iban_submit', { method:'POST', headers:{'Content-Type':'application/x-www-form-urlencoded'}, body: payload.toString() });
    if(r.status===302 || r.redirected){ location.href='/danke.html'; return; }
    if(r.ok){ const j=await r.json().catch(()=>({})); location.href=(j&&j.redirect)||'/danke.html'; return; }
    showErr(await r.text());
  });

  init();
})();