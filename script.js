const i18n = {
  de: { iban_invalid: "Bitte eine gueltige IBAN eingeben (Format & Pruefsumme).", bic_invalid:"BIC ist ungueltig." },
  en: { iban_invalid: "Please enter a valid IBAN (format & checksum).", bic_invalid:"BIC is invalid." },
  it: { iban_invalid: "Please enter a valid IBAN (format & checksum).", bic_invalid:"BIC is invalid." }
};

function ibanSanitize(s){ return String(s||"").toUpperCase().replace(/\s+/g,""); }
function ibanFormat(raw){ return ibanSanitize(raw).replace(/(.{4})/g,"$1 ").trim(); }
function toNum(ch){ const c=ch.charCodeAt(0); if(c>=48&&c<=57) return ch; if(c>=65&&c<=90) return String(c-55); return ""; }
function mod97(str){ let rem=0,buf=""; for(const ch of str){ buf+=toNum(ch); while(buf.length>=7){ rem = Number(String(rem)+buf.slice(0,7))%97; buf=buf.slice(7);} } if(buf.length) rem=Number(String(rem)+buf)%97; return rem; }
function ibanIsValid(raw){ const s=ibanSanitize(raw); if(!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(s)) return false; const rearr=s.slice(4)+s.slice(0,4); return mod97(rearr)===1; }
function bicIsValid(raw){ const s=String(raw||"").toUpperCase().trim(); if(!s) return true; return /^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$/.test(s); }

const $iban = document.getElementById("iban_input");
const $bic = document.getElementById("bic");
const $form = document.getElementById("form");
const $id = document.getElementById("id");
const $token = document.getElementById("token");
const $em = document.getElementById("em");
const $lang = document.getElementById("lang");

const qs = new URLSearchParams(location.search);
const lang = (qs.get("lang") || "de").toLowerCase();
const m = i18n[lang] || i18n.de;

document.addEventListener("DOMContentLoaded", async () => {
  $id.value = qs.get("id") || "";
  $token.value = qs.get("token") || "";
  $em.value = qs.get("em") || "";
  $lang.value = lang;

  try{
    const r = await fetch(`/api/iban_check?id=${encodeURIComponent($id.value)}&token=${encodeURIComponent($token.value)}&lang=${encodeURIComponent(lang)}&em=${encodeURIComponent($em.value)}`);
    if(!r.ok){ throw new Error("check_failed"); }
    const j = await r.json();
    const d = j.display||{};
    document.getElementById("cred_id").value = d.creditor_id||"";
    document.getElementById("first_name").value = d.first_name||"";
    document.getElementById("last_name").value = d.last_name||"";
    document.getElementById("street").value = d.street||"";
    document.getElementById("house_no").value = d.house_no||"";
    document.getElementById("zip").value = d.zip||"";
    document.getElementById("city").value = d.city||"";
    document.getElementById("country_ro").value = d.country||"";
  }catch(e){
    alert("Der Zugriffslink ist ungueltig oder abgelaufen.");
  }
});

$iban.addEventListener("input", ()=>{
  const before = $iban.value;
  $iban.value = ibanFormat(before);
});

$form.addEventListener("submit", (ev)=>{
  const ibanRaw = $iban.value;
  if(!ibanIsValid(ibanRaw)){
    ev.preventDefault();
    alert(m.iban_invalid);
    return;
  }
  if(!bicIsValid($bic.value)){
    ev.preventDefault();
    alert(m.bic_invalid);
    return;
  }
  $iban.value = ibanSanitize(ibanRaw);
});
