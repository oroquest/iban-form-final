const fetch = require("node-fetch");

exports.handler = async (event) => {
  try {
    const params = new URLSearchParams(event.body);
    const email = params.get("email");
    const id = params.get("id");
    const lang = params.get("lang") || "de";
    const category = params.get("category") || process.env.IBAN_DEFAULT_CATEGORY;
    const send = params.get("send") || "0";

    if (!email || !id) {
      return { statusCode: 400, body: "Missing email or id" };
    }

    // Token erzeugen
    const crypto = require("crypto");
    const token = crypto.randomBytes(16).toString("hex");
    const days = parseInt(process.env.IBAN_TOKEN_DAYS || "5", 10);
    const expiry = new Date(Date.now() + days * 86400000).toISOString();

    // In Mailjet speichern
    const mjUrl = `https://api.mailjet.com/v3/REST/contact/${encodeURIComponent(email)}`;
    const mjAuth = Buffer.from(`${process.env.MJ_APIKEY_PUBLIC}:${process.env.MJ_APIKEY_PRIVATE}`).toString("base64");
    const updateBody = {
      Data: [
        { Name: "token_iban", Value: token },
        { Name: "token_iban_expiry", Value: expiry },
        { Name: "iban_status", Value: "issued" },
        { Name: "glaeubiger_id", Value: id }
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

    const baseUrl = process.env.BASE_IBAN_URL || "https://iban.sikuralife.com";
    const link = `${baseUrl}/?id=${id}&token=${token}&em=${Buffer.from(email).toString("base64")}&lang=${lang}`;

    return {
      statusCode: 200,
      body: JSON.stringify({ ok: true, url: link })
    };

  } catch (err) {
    return { statusCode: 500, body: err.toString() };
  }
};
