
exports.handler = async (event, context) => {
  const query = event.queryStringParameters;
  const id = query.id;
  const token = query.token;

  // Datenbank: intern gespeicherte Zuordnungen
  const data = {
    "83": { token: "aVKe-XPu3i4cKRqn", name: "Fasano", adresse: "Fasano Vicenzo Via Deco' e Canetta 127 IT-24068 Seriate" },
    "93": { token: "1-EOyOuGsZ-JH35G", name: "Fois", adresse: "Fois Maurizio Via Nazario Sauro 119 IT-51100 Pistoia" },
    "85": { token: "zIPT9R6jdkxTNHPV", name: "Frigerio", adresse: "Frigerio Marino Via Risorgimento 18 IT-22070 Luisago (CO)" },
    "73": { token: "MQ1zaDyA9Z0YLYq6", name: "Spezagutti", adresse: "Spezagutti Marta Via Spezimento 99 IT-22023 Milano" }
  };

  // ID oder Token fehlt
  if (!id || !token) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "Missing parameters" })
    };
  }

  // Kein Eintrag oder falscher Token
  const entry = data[id];
  if (!entry || entry.token !== token) {
    return {
      statusCode: 403,
      body: JSON.stringify({ error: "Invalid ID or token" })
    };
  }

  // Erfolg: sende Name + Adresse zurück
  return {
    statusCode: 200,
    body: JSON.stringify({
      name: entry.name,
      adresse: entry.adresse
    })
  };
};
