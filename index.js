(function(){
  // --- language strings ---
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
      ibanMismatch: "Bestätigung stimmt nicht mit der IBAN überein."
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
      ibanMismatch: "Confirmation does not match IBAN."
    },
    it: {
      title: "Per favore conferma il tuo indirizzo",
      lead: "I campi sono precompilati e possono essere aggiornati se necessario.",
      note: "Si prega di inserire i dati completi e corretti dell'indirizzo.",
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
      ibanMismatch: "La conferma non corrisponde all'IBAN."
    }
  };

  // Map fields from contact properties to our UI
  const mapFields = (props) => {
    const v = (kArr) => {
      for (const k of kArr) {
        if (props[k] !== undefined && props[k] !== null && props[k] !== "") return String(props[k]);
      }
      return "";
    };
    return {
      creditorNo: v(["gläubiger","glaeubiger","creditor_no","id"]),
      firstName: v(["firstname","first_name"]),
      lastName: v(["lastname","last_name","name"]),
      street: v(["strasse","street"]),
      houseNo: v(["hausnummer","house_no","housenumber"]),
      zip: v(["plz","zip","postcode"]),
      city: v(["ort","city"]),
      country: v(["country"])
    };
  };

  // IBAN helpers (pattern + mod97 check), format spacing 4-4-...
  function cleanIBAN(x){ return String(x||"").replace(/\s+/g,"").toUpperCase(); }
  function formatIBAN(x){
    const c = cleanIBAN(x);
    return c.replace(/(.{4})/g,"$1 ").trim();
  }
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

  // DOM
  const $ = (id)=>document.getElementById(id);
  const qs = new URLSearchParams(location.search);
  const id    = qs.get("id")||"";
  const token = qs.get("token")||"";
  const em    = qs.get("em")||"";
  const langUrl = (qs.get("lang")||"de").toLowerCase();
  const langSel = $("langSel");

  // build language select
  const langKeys = ["de","en","it"];
  langKeys.forEach(k=>{
    const o = document.createElement("option");
    o.value = k; o.textContent = ({de:"Deutsch", en:"English", it:"Italiano"})[k];
    langSel.appendChild(o);
  });
  langSel.value = langUrl;

  function applyLang(l){
    const t = i18n[l] || i18n.de;
    $("pageTitle").textContent = t.title;
    $("lead").textContent = t.lead;
    $("note").textContent = t.note;
    $("lblIban").textContent = t.iban;
    $("ibanHint").textContent = t.ibanHint;
    $("lblIban2").textContent = t.iban2;
    $("lblChkConfirm").textContent = t.chkConfirm;
    $("lblChkGDPR").textContent = t.chkGDPR + " ";
    $("lblPrivacy").textContent = t.privacy;
    $("submitBtn").textContent = t.submit;
    $("validityNote").textContent = t.validity;
  }
  applyLang(langSel.value);
  langSel.addEventListener("change", ()=>{
    const newLang = langSel.value;
    applyLang(newLang);
    const url = new URL(location.href);
    url.searchParams.set("lang", newLang);
    history.replaceState(null, "", url.toString());
  });

  $("id").value = id; $("token").value = token; $("em").value = em;

  function renderRO(mapped, t){
    const host = $("ro-list");
    host.innerHTML = "";

    const rows = [
      [t.creditorNo, mapped.creditorNo],
      [t.firstName,  mapped.firstName],
      [t.lastName,   mapped.lastName],
      [t.street,     mapped.street],
      [t.houseNo,    mapped.houseNo],
      [t.zip,        mapped.zip],
      [t.city,       mapped.city],
      [t.country,    mapped.country]
    ];

    for(const [label, value] of rows){
      const item = document.createElement("div");
      item.className = "ro-item";
      const lab = document.createElement("label"); lab.textContent = label;
      const input = document.createElement("input"); input.readOnly = true; input.value = value || "";
      item.appendChild(lab); item.appendChild(input);
      host.appendChild(item);
    }
  }

  async function loadData(){
    try{
      const r = await fetch(`/.netlify/functions/iban_check?id=${encodeURIComponent(id)}&token=${encodeURIComponent(token)}&em=${encodeURIComponent(em)}&lang=${encodeURIComponent(langSel.value)}`, {cache:"no-store"});
      if(!r.ok){ $("msg").textContent = "Link ungültig oder abgelaufen."; return; }
      const j = await r.json();
      const mapped = mapFields(j.readonly && Object.keys(j.readonly).length ? j.readonly : (j.props_all||{}));
      $("email").value = j.email || "";
      renderRO(mapped, i18n[langSel.value] || i18n.de);
      $("ibanForm").style.display = "block";
    }catch(e){
      $("msg").textContent = "Fehler beim Laden.";
    }
  }

  // live validation
  const ibanField = $("iban");
  const iban2Field = $("iban_confirm");
  const feedback1 = $("ibanFeedback");
  const feedback2 = $("iban2Feedback");
  function updateValidity(){
    const t = i18n[langSel.value] || i18n.de;
    const iban = cleanIBAN(ibanField.value);
    const iban2 = cleanIBAN(iban2Field.value);
    let ok1=false, ok2=false;

    if(iban.length){
      if(isValidIBAN(iban)){ feedback1.textContent = t.ibanOk; feedback1.className="feedback ok"; ok1=true; }
      else { feedback1.textContent = t.ibanInvalid; feedback1.className="feedback err"; }
    } else { feedback1.textContent=""; }

    if(iban2.length){
      if(iban && iban===iban2){ feedback2.textContent=""; ok2=true; }
      else { feedback2.textContent=t.ibanMismatch; feedback2.className="feedback err"; }
    } else { feedback2.textContent=""; }

    const canSubmit = ok1 && ok2 && $("chkConfirm").checked && $("chkGDPR").checked;
    $("submitBtn").disabled = !canSubmit;
  }
  ibanField.addEventListener("input", (e)=>{
    const caret = e.target.selectionStart;
    const before = e.target.value;
    e.target.value = formatIBAN(before);
    // caret heuristic
    e.target.selectionStart = e.target.selectionEnd = Math.min(e.target.value.length, caret+ (e.target.value.length - before.length));
    updateValidity();
  });
  iban2Field.addEventListener("input", updateValidity);
  $("chkConfirm").addEventListener("change", updateValidity);
  $("chkGDPR").addEventListener("change", updateValidity);

  document.getElementById("ibanForm").addEventListener("submit", async (ev)=>{
    ev.preventDefault();
    const payload = new URLSearchParams();
    payload.set("id", id);
    payload.set("token", token);
    payload.set("em", em);
    payload.set("lang", langSel.value);
    payload.set("email", $("email").value);
    payload.set("iban", cleanIBAN(ibanField.value));
    payload.set("iban_confirm", cleanIBAN(iban2Field.value));

    const r = await fetch("/.netlify/functions/iban_submit", {
      method:"POST",
      headers:{ "Content-Type":"application/x-www-form-urlencoded" },
      body: payload.toString()
    });
    if(r.status===302 || r.redirected){ location.href="/danke.html"; return; }
    if(r.ok){
      const j = await r.json().catch(()=>({}));
      location.href = (j && j.redirect) || "/danke.html";
      return;
    }
    $("msg").textContent = await r.text();
  });

  loadData();
})();