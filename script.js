
function setLanguage(lang) {
  const i18n = {
    de: {
      title: "Bitte bestätigen Sie Ihre IBAN",
      iban: "IBAN",
      address: "Aktuelle Adresse",
      contract: "Vertragsnummer",
      passport: "Passnummer (optional)",
      lei: "LEI (optional für juristische Personen)",
      note: "Betreff / Bemerkungen",
      confirm1: "Ich bestätige, dass die angegebenen Daten korrekt sind und meine aktuellen Bankdaten widerspiegeln.",
      confirm2: "Ich stimme der Verarbeitung meiner Daten im Rahmen des Konkursverfahrens der SIKURA Leben AG. i.L. gemäss DSGVO zu.",
      submit: "Absenden"
    },
    it: {
      title: "Si prega di confermare il proprio IBAN",
      iban: "IBAN",
      address: "Indirizzo attuale",
      contract: "Numero del contratto",
      passport: "Numero di passaporto (opzionale)",
      lei: "LEI (opzionale per persone giuridiche)",
      note: "Oggetto / Commenti",
      confirm1: "Confermo che i dati forniti sono corretti e riflettono le informazioni bancarie attuali.",
      confirm2: "Acconsento al trattamento dei miei dati nell'ambito della procedura fallimentare di SIKURA Vita SA i.L. ai sensi del GDPR.",
      submit: "Invia"
    },
    en: {
      title: "Please confirm your IBAN",
      iban: "IBAN",
      address: "Current Address",
      contract: "Contract Number",
      passport: "Passport Number (optional)",
      lei: "LEI (optional for legal entities)",
      note: "Subject / Comments",
      confirm1: "I confirm that the data provided is correct and reflects my current bank details.",
      confirm2: "I consent to the processing of my data in the context of the bankruptcy proceedings of SIKURA Life AG i.L. in accordance with GDPR.",
      submit: "Submit"
    }
  };

  const elements = document.querySelectorAll("[data-i18n]");
  elements.forEach(el => {
    const key = el.getAttribute("data-i18n");
    el.textContent = i18n[lang][key] || el.textContent;
  });
}
