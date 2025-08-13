const fetch = require("node-fetch");

exports.handler = async (event) => {
  try {
    const params = new URLSearchParams(event.body);
    const id = params.get("id");
    const token = params.get("token");
    const iban = params.get("iban");
    const bic = params.get("bic") || "";
    const name = params.get("name") || "";
    const email = Buffer.from(params.get("em") || "", "base64").toString();

    if (!iban || !id || !token || !email) {
      return { statusCode: 400, body: "Missing parameters" };
    }

    // IBAN-Prüfung (Mod-97)
    const ibanNorm = iban.replace(/\s+/g, "").toUpperCase();
    const ibanNumeric = ibanNorm.slice(4) + ibanNorm.slice(0, 4);
    const ibanCheck = ibanNumeric.replace(/[A-Z]/g, (c) => c.charCodeAt(0) - 55);
    const isValid = BigInt(ibanCheck) % 97n === 1n;
    if (!isValid) {
      return { statusCode: 400, body: "Invalid IBAN" };
    }

    // Mailjet-Felder updaten
    const mjUrl = `https://api.mailjet.com/v3/REST/contact/${encodeURIComponent(email)}`;
    const mjAuth = Buffer.from(`${process.env.MJ_APIKEY_PUBLIC}:${process.env.MJ_APIKEY_PRIVATE}`).toString("base64");
    const updateBody = {
      Data: [
        { Name: "iban", Value: ibanNorm },
        { Name: "bic", Value: bic },
        { Name: "iban_name", Value: name },
        { Name: "iban_status", Value: "submitted" },
        { Name: "token_iban", Value: "" },
        { Name: "token_iban_used_at", Value: new Date().toISOString() }
      ]
    };
    const resp = await fetch(mjUrl, {
      method: "PUT",
      headers: { "Authorization": `Basic ${mjAuth}`, "Content-Type": "application/json" },
      body: JSON.stringify(updateBody)
    });
    if (!resp.ok) {
      return { statusCode: resp.status, body: await resp.text() };
    }

    return {
      statusCode: 302,
      headers: { Location: "/danke.html" },
      body: ""
    };

  } catch (err) {
    return { statusCode: 500, body: err.toString() };
  }
};
