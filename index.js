
// index.js
document.addEventListener("DOMContentLoaded", () => {
  const params = new URLSearchParams(window.location.search);
  const lang = params.get('lang') || 'de';
  const idFromUrl = params.get('id');
  const token = params.get('token');
  const em = params.get('em');

  // Gläubiger-Nr. direkt aus URL setzen
  const creditorField = document.getElementById('creditor_no');
  if (creditorField && idFromUrl) {
    creditorField.value = idFromUrl;
  }

  fetch(`/.netlify/functions/iban_check?id=${idFromUrl}&token=${token}&em=${encodeURIComponent(em)}&lang=${lang}`)
    .then(r => r.json())
    .then(data => {
      if (data.ok && data.data) {
        document.getElementById('firstname').value = data.data.firstname || '';
        document.getElementById('lastname').value = data.data.lastname || '';
        document.getElementById('street').value = data.data.street || '';
        document.getElementById('street_no').value = data.data.street_no || '';
        document.getElementById('zip').value = data.data.zip || '';
        document.getElementById('city').value = data.data.city || '';
        document.getElementById('country').value = data.data.country || '';
      } else {
        console.error("Fehler:", data.error || "Unbekannt");
      }
    })
    .catch(err => console.error("Fetch-Fehler:", err));
});
