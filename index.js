(function(){
  const L = {
    de: {
      title: "IBAN Erhebung",
      subtitle: "Bitte prüfen Sie Ihre Angaben und ergänzen Sie die IBAN.",
      notice: "Die Felder sind vorausgefüllt und können bei Bedarf aktualisiert werden.",
      fields: {
        creditor_no: "Gläubiger-Nr.",
        firstname: "Vorname",
        lastname: "Nachname",
        street: "Strasse",
        houseno: "Nr.",
        zip: "PLZ",
        city: "Ort",
        country: "Land"
      },
      iban: "IBAN",
      iban2: "IBAN Bestätigung",
      hintIban: "Bitte ohne Leerzeichen oder Sonderzeichen eingeben.",
      send: "Senden",
      invalidLink: "Link ungültig oder abgelaufen.",
      mismatch: "IBAN stimmt nicht überein.",
      invalidIban: "IBAN ungültig."
    },
    en: {
      title: "Provide your IBAN",
      subtitle: "Please review your details and enter your IBAN.",
      notice: "Fields are pre-filled and can be updated if necessary.",
      fields: {
        creditor_no: "Creditor number",
        firstname: "First name",
        lastname: "Last name",
        street: "Street",
        houseno: "No.",
        zip: "ZIP",
        city: "City",
        country: "Country"
      },
      iban: "IBAN",
      iban2: "Confirm IBAN",
      hintIban: "Please enter without spaces or special characters.",
      send: "Submit",
      invalidLink: "Invalid or expired link.",
      mismatch: "IBAN mismatch.",
      invalidIban: "Invalid IBAN."
    },
    it: {
      title: "Per favore inserisci il tuo IBAN",
      subtitle: "Controlla i tuoi dati e inserisci l'IBAN.",
      notice: "I campi sono precompilati e possono essere aggiornati se necessario.",
      fields: {
        creditor_no: "Numero del creditore",
        firstname: "Nome",
        lastname: "Cognome",
        street: "Via",
        houseno: "Nr.",
        zip: "CAP",
        city: "Città",
        country: "Paese"
      },
      iban: "IBAN",
      iban2: "Conferma IBAN",
      hintIban: "Inserisci senza spazi o caratteri speciali.",
      send: "Invia",
      invalidLink: "Link non valido o scaduto.",
      mismatch: "Gli IBAN non coincidono.",
      invalidIban: "IBAN non valido."
    }
  };

  const qs = new URLSearchParams(location.search);
  const id    = qs.get('id')||'';
  const token = qs.get('token')||'';
  const em    = qs.get('em')||'';
  const langQ = (qs.get('lang')||'de').toLowerCase();
  const lang = (langQ==='en'||langQ==='it')?langQ:'de';
  const t = L[lang];

  const $ = (id)=>document.getElementById(id);
  const msg = (s)=>{ const el=$('msg'); if(el) el.textContent=s; };

  // Apply texts
  document.getElementById('title').textContent = t.title;
  document.getElementById('subtitle').textContent = t.subtitle;
  document.getElementById('notice').textContent = t.notice;
  document.getElementById('lblIban').textContent = t.iban;
  document.getElementById('lblIban2').textContent = t.iban2;
  document.getElementById('hintIban').textContent = t.hintIban;
  document.getElementById('btnSend').textContent = t.send;
  document.getElementById('langSel').value = lang;

  // Hidden
  $('id').value = id;
  $('token').value = token;
  $('em').value = em;
  $('lang').value = lang;

  // Language switcher
  document.getElementById('langSel').addEventListener('change',(e)=>{
    const l=e.target.value;
    const q=new URLSearchParams(location.search);
    q.set('lang', l);
    location.search=q.toString();
  });

  function addRoRow(label, value){
    const grid = document.getElementById('roGrid');
    const box = document.createElement('div'); box.className='ro';
    const lab = document.createElement('label'); lab.textContent=label;
    const inp = document.createElement('input'); inp.value=String(value||''); inp.readOnly=true;
    box.appendChild(lab); box.appendChild(inp); grid.appendChild(box);
  }

  function isValidIBAN(input){
    let s=String(input||'').replace(/\s+/g,'').toUpperCase();
    if(!/^[A-Z]{2}\d{2}[A-Z0-9]{1,30}$/.test(s)) return false;
    const rearr=s.slice(4)+s.slice(0,4);
    const expanded=rearr.replace(/[A-Z]/g,ch=>(ch.charCodeAt(0)-55).toString());
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
      const r = await fetch(`/.netlify/functions/iban_check?id=${encodeURIComponent(id)}&token=${encodeURIComponent(token)}&em=${encodeURIComponent(em)}&lang=${encodeURIComponent(lang)}`, {cache:'no-store'});
      if(!r.ok){ msg(t.invalidLink); return; }
      const j = await r.json();
      const props = j.props_all || {};
      $('email').value = j.email || props.email || '';

      // Map props to desired fields (fallbacks)
      const creditor_no = props.gläubiger || props.glaeubiger || props.creditor_no || j.id || id || '';
      const firstname   = props.firstname || props.first_name || '';
      const lastname    = props.name || props.lastname || props.last_name || '';
      const street      = props.strasse || props.street || '';
      const houseno     = props.hausnummer || props.house_no || props.housenumber || '';
      const zip         = props.plz || props.zip || props.postcode || '';
      const city        = props.ort || props.city || '';
      const country     = props.country || '';

      // Render in Verify order
      addRoRow(t.fields.creditor_no, creditor_no);
      addRoRow(t.fields.firstname, firstname);
      addRoRow(t.fields.lastname,  lastname);
      addRoRow(t.fields.street,    street);
      addRoRow(t.fields.houseno,   houseno);
      addRoRow(t.fields.zip,       zip);
      addRoRow(t.fields.city,      city);
      addRoRow(t.fields.country,   country);

      document.getElementById('ibanForm').style.display='block';
    }catch(e){
      msg(t.invalidLink);
    }
  }

  document.getElementById('ibanForm').addEventListener('submit', async (ev)=>{
    ev.preventDefault();
    const iban = $('iban').value.trim(), iban2 = $('iban_confirm').value.trim();
    if(iban !== iban2){ msg(t.mismatch); return; }
    if(!isValidIBAN(iban)){ msg(t.invalidIban); return; }

    const payload = new URLSearchParams();
    payload.set('id', id); payload.set('token', token); payload.set('em', em); payload.set('lang', lang);
    payload.set('email', $('email').value); payload.set('iban', iban); payload.set('iban_confirm', iban2);

    const r = await fetch('/.netlify/functions/iban_submit', {
      method:'POST', headers:{'Content-Type':'application/x-www-form-urlencoded'}, body: payload.toString()
    });
    if(r.status===302 || r.redirected){ location.href='/danke.html'; return; }
    if(r.ok){ const j=await r.json().catch(()=>({})); location.href = (j && j.redirect) || '/danke.html'; return; }
    msg('Fehler');
  });

  init();
})();