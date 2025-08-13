
// index.js
document.addEventListener("DOMContentLoaded", () => {
  const params = new URLSearchParams(window.location.search);
  const lang = params.get('lang') || 'de';
  const id = params.get('id');
  const token = params.get('token');
  const em = params.get('em');

  fetch(`/.netlify/functions/iban_check?id=${id}&token=${token}&em=${encodeURIComponent(em)}&lang=${lang}`)
    .then(r => r.json())
    .then(data => {
      if (data.ok) {
        document.getElementById('creditor_no').value = data.data.creditor_no;
        document.getElementById('firstname').value = data.data.firstname;
        document.getElementById('lastname').value = data.data.lastname;
        document.getElementById('street').value = data.data.street;
        document.getElementById('street_no').value = data.data.street_no;
        document.getElementById('zip').value = data.data.zip;
        document.getElementById('city').value = data.data.city;
        document.getElementById('country').value = data.data.country;
      } else {
        alert("Fehler: " + data.error);
      }
    });
});
