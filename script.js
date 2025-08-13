
let currentLang = "de";

function setLanguage(lang) {
  currentLang = lang;
  const i18n = {
    de: {
      title: "Bitte bestätigen Sie Ihre Daten",
      glaeubiger: "Gläubiger-Nr.",
      token: "Token",
      email: "E-Mail-Adresse",
      adresse: "Aktuelle Adresse",
      confirm1: "Ich bestätige, dass die angegebenen Daten korrekt sind.",
      confirm2: "Ich stimme der Verarbeitung meiner Daten im Rahmen des Konkursverfahrens der SIKURA Leben AG. i.L. gemäss DSGVO zu.",
      submit: "Absenden"
    },
    it: {
      title: "Si prega di confermare i propri dati",
      glaeubiger: "Numero del creditore",
      token: "Token",
      email: "Indirizzo e-mail",
      adresse: "Indirizzo attuale",
      confirm1: "Confermo che i dati forniti sono corretti.",
      confirm2: "Acconsento al trattamento dei miei dati nell'ambito della procedura fallimentare di SIKURA Vita SA i.L. ai sensi del GDPR.",
      submit: "Invia"
    },
    en: {
      title: "Please confirm your information",
      glaeubiger: "Creditor No.",
      token: "Token",
      email: "Email address",
      adresse: "Current Address",
      confirm1: "I confirm that the provided data is correct.",
      confirm2: "I consent to the processing of my data in the context of the bankruptcy proceedings of SIKURA Life AG i.L. in accordance with GDPR.",
      submit: "Submit"
    }
  };

  document.querySelectorAll("[data-i18n]").forEach(el => {
    const key = el.getAttribute("data-i18n");
    el.textContent = i18n[lang][key] || el.textContent;
  });
}

document.addEventListener("DOMContentLoaded", async () => {
  const params = new URLSearchParams(window.location.search);
  const glaeubigerId = params.get("id") || "";
  const token = params.get("token") || "";

  document.getElementById("glaeubiger").value = glaeubigerId;
  document.getElementById("token").value = token;

  try {
    const response = await fetch(`/.netlify/functions/verify?id=${glaeubigerId}&token=${token}`);
    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || "Ungültiger Zugriff");
    }

    document.getElementById("name").value = result.name || "";
    document.getElementById("adresse").value = result.adresse || "";

    setLanguage(currentLang);

  } catch (error) {
    alert("Ungültiger Link oder abgelaufener Zugriff. Bitte verwenden Sie den offiziellen Zugang.");
    const form = document.getElementById("verify-form");
    if (form) form.style.display = "none";
  }
});

document.getElementById("verify-form").addEventListener("submit", function(event) {
  const email = document.getElementById("email").value.trim();
  const adresse = document.getElementById("adresse").value.trim();
  const confirm = document.getElementById("confirm").checked;
  const privacy = document.getElementById("privacy").checked;

  const blockedDomains = ["mailrez.com", "yopmail.com", "tempmail.com", "sharklasers.com"];
  const emailDomain = email.split("@")[1]?.toLowerCase() || "";

  if (blockedDomains.includes(emailDomain)) {
    alert("Bitte verwenden Sie eine gültige, persönliche E-Mail-Adresse.");
    event.preventDefault();
    return;
  }

  const messages = {
    de: {
      email: "Bitte geben Sie eine gültige E-Mail-Adresse ein.",
      adresse: "Bitte geben Sie Ihre Adresse ein.",
      confirm: "Bitte bestätigen Sie die Richtigkeit der Angaben.",
      privacy: "Bitte stimmen Sie der Datenschutzvereinbarung zu."
    },
    en: {
      email: "Please enter a valid email address.",
      adresse: "Please enter your address.",
      confirm: "Please confirm the accuracy of your information.",
      privacy: "Please accept the privacy agreement."
    },
    it: {
      email: "Si prega di inserire un indirizzo e-mail valido.",
      adresse: "Si prega di inserire l'indirizzo.",
      confirm: "Confermi la correttezza delle informazioni.",
      privacy: "Accetti l'informativa sulla privacy."
    }
  };

  const m = messages[currentLang];
  const regex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

  if (!regex.test(email)) { alert(m.email); event.preventDefault(); return; }
  if (!adresse) { alert(m.adresse); event.preventDefault(); return; }
  if (!confirm) { alert(m.confirm); event.preventDefault(); return; }
  if (!privacy) { alert(m.privacy); event.preventDefault(); return; }
});
