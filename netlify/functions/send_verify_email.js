// netlify/functions/send_verify_email.js
// Mailversand ohne Mailjet-SDK – direkte v3.1 REST API via native fetch

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== "POST") {
      return { statusCode: 405, body: "Method Not Allowed" };
    }

    const env = (k) => {
      const v = process.env[k];
      if (!v) throw new Error(`Missing ENV ${k}`);
      return v;
    };

    // --- ENV laden & prüfen ---
    const MJ_PUBLIC  = env("MJ_APIKEY_PUBLIC");
    const MJ_PRIVATE = env("MJ_APIKEY_PRIVATE");
    const MAIL_FROM_ADDRESS = env("MAIL_FROM_ADDRESS");
    const MAIL_FROM_NAME    = env("MAIL_FROM_NAME");
    const BASE_VERIFY_URL   = env("BASE_VERIFY_URL");   // z.B. https://verify.sikuralife.com
    const URL_ISSUE_TOKEN   = env("URL_ISSUE_TOKEN");   // z.B. https://verify.sikuralife.com/.netlify/functions/issue_token
    const TPL_DE_DIRECT     = Number(env("TEMPLATE_DE_DIRECT"));
    const TPL_DE_LAWYER     = Number(env("TEMPLATE_DE_LAWYER"));
    const TPL_EN_DIRECT     = Number(env("TEMPLATE_EN_DIRECT"));
    const TPL_EN_LAWYER     = Number(env("TEMPLATE_EN_LAWYER"));
    const INTERNAL_KEY      = env("GET_CONTACT_INTERNAL_KEY"); // ← NEU: interner Key für get_contact

    const { email, id, lang, category } = JSON.parse(event.body || "{}");
    if (!email || !id) {
      return { statusCode: 400, body: JSON.stringify({ error: "Missing email or id" }) };
    }

    // --- 1) Kontakt holen (mit internem Key) ---
    const contactRes = await fetch(
      `${BASE_VERIFY_URL}/.netlify/functions/get_contact?email=${encodeURIComponent(email)}`,
      { headers: { "x-internal-key": INTERNAL_KEY } } // ← NEU: Header mitschicken
    );
    if (!contactRes.ok) {
      const t = await contactRes.text().catch(() => "");
      return { statusCode: 502, body: JSON.stringify({ error: "Failed to get contact", details: t }) };
    }

    const contact = await contactRes.json();
    const firstname  = contact.firstname || "";
    const lastName   = contact.name || contact.Name || "";
    const creditorId = contact.glaeubiger || contact["gläubiger"] || "";
    const ort        = contact.ort || "";
    const country    = contact.country || "";

    // Sprache/Kategorie bestimmen (mit Fallbacks)
    const prefLang = (lang || contact.Sprache || "en").toLowerCase();
    const prefCat  = (category || contact.Category || "").toUpperCase();

    // --- 2) Token ausstellen ---
    const tokenRes = await fetch(URL_ISSUE_TOKEN, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, id, lang: prefLang })
    });
    if (!tokenRes.ok) {
      const t = await tokenRes.text().catch(() => "");
      return { statusCode: 502, body: JSON.stringify({ error: "Failed to issue token", details: t }) };
    }
    const tokenData = await tokenRes.json();
    const verifyUrl = tokenData.url;
    const expiresAt = tokenData.expiresAt;

    // --- 3) Template wählen (DE/EN × DIREKT/ANWALT; IT -> EN-Fallback) ---
    let templateId;
    if (prefLang === "de") {
      templateId = (prefCat === "VN ANWALT") ? TPL_DE_LAWYER : TPL_DE_DIRECT;
    } else {
      templateId = (prefCat === "VN ANWALT") ? TPL_EN_LAWYER : TPL_EN_DIRECT;
    }
    if (!Number.isFinite(templateId)) {
      return { statusCode: 500, body: JSON.stringify({ error: "Invalid TemplateID (ENV not set?)" }) };
    }

    // --- 4) Mailjet v3.1 Send ---
    const mjAuth = 'Basic ' + Buffer.from(`${MJ_PUBLIC}:${MJ_PRIVATE}`).toString('base64');
    const subject = (prefLang === "de") ? "Verifizierung Ihrer Daten" : "Verify your contact details";

    const payload = {
      Messages: [{
        From: { Email: MAIL_FROM_ADDRESS, Name: MAIL_FROM_NAME },
        To:   [{ Email: email, Name: `${firstname} ${lastName}`.trim() }],
        TemplateID: templateId,
        TemplateLanguage: true,
        Subject: subject,
        Variables: {
          verify_url:  verifyUrl,
          expires_at:  expiresAt,
          firstname:   firstname,
          creditor_id: creditorId,
          name:        lastName,
          ort:         ort,
          country:     country
        }
      }]
    };

    const sendRes = await fetch("https://api.mailjet.com/v3.1/send", {
      method: "POST",
      headers: { "Authorization": mjAuth, "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    const sendBody = await sendRes.json().catch(() => ({}));
    if (!sendRes.ok) {
      return { statusCode: 502, body: JSON.stringify({ error: "Mailjet send failed", details: sendBody }) };
    }
    const status = sendBody?.Messages?.[0]?.Status;
    if (status !== "success") {
      return { statusCode: 502, body: JSON.stringify({ error: "Mailjet send failed", status, details: sendBody }) };
    }

    // --- Erfolg ---
    return {
      statusCode: 200,
      body: JSON.stringify({
        ok: true,
        url: verifyUrl,
        expiresAt,
        lang: prefLang,
        category: prefCat,
        templateId,
        debug: { firstname, lastName }
      })
    };

  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ errorType: err.name, errorMessage: err.message }) };
  }
};
