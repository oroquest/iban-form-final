// iban.js — Verify-like UI with server-side proxy and live IBAN validation
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

  const i18n = {
    de: {
      title: "Bitte bestätigen Sie Ihre Adresse",
      lead: "Die Felder sind vorausgefüllt und können bei Bedarf aktualisiert werden.",
      note: "Bitte geben Sie vollständige und korrekte Angaben ein.",
      creditorNo: "Gläubiger-Nr.",
      firstName: "Vorname",
      lastName: "Nachname",
      street: "Strasse",
      houseNo: "Nr.",
      zip: "PLZ",
      city: "Ort",
      country: "Land",
      iban: "IBAN",
      ibanHint: "Bitte ohne Leerzeichen oder Sonderzeichen eingeben.",
      iban2: "IBAN Bestätigung",
      chkConfirm: "Ich bestätige, dass die Angaben korrekt sind.",
      chkGDPR: "Ich stimme der Verarbeitung meiner Daten gemäß DSGVO zu",
      privacy: "Datenschutzhinweise",
      submit: "Senden",
      validity: "Hinweis: Aus Sicherheitsgründen ist der Link 7 Tage gültig.",
      ibanInvalid: "IBAN ist ungültig.",
      ibanOk: "IBAN scheint gültig zu sein.",
      ibanMismatch: "Bestätigung stimmt nicht mit der IBAN überein.",
      linkInvalid: "Link ungültig oder abgelaufen.",
      loadError: "Fehler beim Laden."
    },
    en: {
      title: "Please confirm your address",
      lead: "Fields are pre-filled and can be updated if necessary.",
      note: "Please enter complete and correct information.",
      creditorNo: "Creditor number",
      firstName: "First name",
      lastName: "Last name",
      street: "Street",
      houseNo: "No.",
      zip: "ZIP",
      city: "City",
      country: "Country",
      iban: "IBAN",
      ibanHint: "Please enter without spaces or special characters.",
      iban2: "Confirm IBAN",
      chkConfirm: "I confirm that the information provided is correct.",
      chkGDPR: "I consent to the processing of my data according to GDPR",
      privacy: "Privacy policy",
      submit: "Submit",
      validity: "Note: For security reasons, the link is valid for 7 days.",
      ibanInvalid: "IBAN is invalid.",
      ibanOk: "IBAN looks valid.",
      ibanMismatch: "Confirmation does not match IBAN.",
      linkInvalid: "Link invalid or expired.",
      loadError: "Error while loading."
    },
    it: {
      title: "Per favore conferma il tuo indirizzo",
      lead: "I campi sono precompilati e possono essere aggiornati se necessario.",
      note: "Si prega di inserire dati completi e corretti.",
      creditorNo: "Numero del creditore",
      firstName: "Nome",
      lastName: "Cognome",
      street: "Via",
      houseNo: "Nr.",
      zip: "CAP",
      city: "Città",
      country: "Paese",
      iban: "IBAN",
      ibanHint: "Inserire senza spazi o caratteri speciali.",
      iban2: "Conferma IBAN",
      chkConfirm: "Confermo che i dati forniti sono corretti.",
      chkGDPR: "Acconsento al trattamento dei miei dati secondo il GDPR",
      privacy: "Informativa privacy",
      submit: "Invia",
      validity: "Nota: Per motivi di sicurezza il link è valido per 7 giorni.",
      ibanInvalid: "IBAN non valido.",
      ibanOk: "IBAN sembra valido.",
      ibanMismatch: "La conferma non corrisponde all'IBAN.",
      linkInvalid: "Link non valido o scaduto.",
      loadError: "Errore durante il caricamento."
    }
  };

  function t(){ return i18n[lang] || i18n.de; }

  function cleanIBAN(x){ return String(x||"").replace(/\s+/g,"").toUpperCase(); }
  function formatIBAN(x){ const c=cleanIBAN(x); return c.replace(/(.{4})/g,"$1 ").trim(); }
  function isValidIBAN(iban){
    const s = cleanIBAN(iban);
    if(!/^[A-Z]{2}\d{2}[A-Z0-9]{1,30}$/.test(s)) return false;
    const rearr = s.slice(4)+s.slice(0,4);
    const expanded = rearr.replace(/[A-Z]/g,ch => (ch.charCodeAt(0)-55).toString());
    let rem=0;
    for(let i=0;i<expanded.length;i++){
      const code = expanded.charCodeAt(i)-48;
      if(code<0||code>35) return false;
      rem=(rem*10+code)%97;
    }
    return rem===1;
  }

  function renderKV(ro){
    const rows = [
      [t().creditorNo, id], // always from URL (ID-accurate, like Verify)
      [t().firstName,  ro.firstname || ro.first_name || ""],
      [t().lastName,   ro.lastname  || ro.last_name  || ro.name || ""],
      [t().street,     ro.strasse   || ro.street || ""],
      [t().houseNo,    ro.hausnummer|| ro.house_no || ro.housenumber || ""],
      [t().zip,        ro.plz       || ro.zip || ro.postcode || ""],
      [t().city,       ro.ort       || ro.city || ""],
      [t().country,    ro.country   || ""]
    ];
    const host = document.getElementById("ro-list");
    if (!host) return;
    host.innerHTML = "";
    for(const [label, value] of rows){
      const wrap = document.createElement("div");
      wrap.className = "ro-item";
      const lab = document.createElement("label");
      lab.textContent = label;
      const input = document.createElement("input");
      input.readOnly = true;
      input.className = "input";
      input.value = value || "";
      wrap.appendChild(lab); wrap.appendChild(input);
      host.appendChild(wrap);
    }
  }

  async function loadData(){
    try{
      const r = await fetch('/.netlify/functions/iban_ro', {
        method:'POST', headers:{ 'Content-Type':'application/json' },
        body: JSON.stringify({ id, token, em, lang })
      });
      if(!r.ok){ document.getElementById('msg').textContent = t().linkInvalid; return; }
      const j = await r.json();
      if(!j.ok){ document.getElementById('msg').textContent = j.error || t().linkInvalid; return; }
      if (document.getElementById('email')) document.getElementById('email').value = j.email || '';
      renderKV(j.readonly || {});
      const form = document.getElementById('ibanForm'); if(form) form.style.display='block';
    }catch(e){ document.getElementById('msg').textContent = t().loadError; }
  }

  // live IBAN validation + submit
  const ibanField = document.getElementById('iban');
  const iban2Field = document.getElementById('iban_confirm');
  const btn = document.getElementById('submitBtn');
  function updateValidity(){
    if(!ibanField || !iban2Field || !btn) return;
    const a = cleanIBAN(ibanField.value);
    const b = cleanIBAN(iban2Field.value);
    const ok = a.length>0 && a===b && isValidIBAN(a);
    btn.disabled = !ok;
  }
  if (ibanField){
    ibanField.addEventListener('input', (e)=>{
      const before = e.target.value, caret = e.target.selectionStart;
      e.target.value = formatIBAN(before);
      e.target.selectionStart = e.target.selectionEnd = Math.min(e.target.value.length, caret + (e.target.value.length - before.length));
      updateValidity();
    });
  }
  if (iban2Field) iban2Field.addEventListener('input', updateValidity);

  const formEl = document.getElementById('ibanForm');
  if (formEl){
    formEl.addEventListener('submit', async (ev)=>{
      ev.preventDefault();
      const payload = new URLSearchParams();
      payload.set('id', id);
      payload.set('token', token);
      payload.set('em', em);
      payload.set('lang', lang);
      const emailEl = document.getElementById('email');
      if (emailEl) payload.set('email', emailEl.value);
      payload.set('iban', cleanIBAN(ibanField?.value||''));
      payload.set('iban_confirm', cleanIBAN(iban2Field?.value||''));
      const r = await fetch('/.netlify/functions/iban_submit', { method:'POST', headers:{'Content-Type':'application/x-www-form-urlencoded'}, body: payload.toString() });
      if(r.status===302 || r.redirected){ location.href='/danke.html'; return; }
      if(r.ok){ const j=await r.json().catch(()=>({})); location.href=(j&&j.redirect)||'/danke.html'; return; }
      document.getElementById('msg').textContent = await r.text();
    });
  }

  loadData();
})();