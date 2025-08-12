export const handler = async () => {
  // Hier koenntest du geplante Token fuer Folgeprozesse generieren
  // und maskierte Events an Mailjet/Ops senden. Keine Voll-IBANs.
  return {
    statusCode: 200,
    body: JSON.stringify({ status:"ok" })
  };
};
