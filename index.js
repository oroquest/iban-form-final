
// index.js — fetch data for IBAN form via POST with URL params
(function () {
  const qs   = new URLSearchParams(location.search);
  const id   = qs.get("id")    || "";
  const token= qs.get("token") || "";
  const em   = qs.get("em")    || "";
  const lang = (qs.get("lang") || "de").toLowerCase();

  if (document.getElementById("id")) document.getElementById("id").value = id;
  if (document.getElementById("token")) document.getElementById("token").value = token;
  if (document.getElementById("em")) document.getElementById("em").value = em;

  async function loadData() {
    try {
      const r = await fetch("/.netlify/functions/iban_check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, token, em, lang })
      });
      if (!r.ok) {
        document.getElementById("msg").textContent = "Link ungültig oder abgelaufen.";
        return;
      }
      const j = await r.json();
      if (!j.ok) {
        document.getElementById("msg").textContent = j.error || "Fehler.";
        return;
      }
      if (document.getElementById("email")) document.getElementById("email").value = j.email || "";

      const props = j.readonly && Object.keys(j.readonly).length ? j.readonly : (j.props_all || {});

      const rows = [
        ["Gläubiger-Nr.", id],
        ["Vorname", props.firstname || ""],
        ["Nachname", props.lastname || ""],
        ["Strasse", props.strasse || ""],
        ["Nr.", props.hausnummer || ""],
        ["PLZ", props.plz || ""],
        ["Ort", props.ort || ""],
        ["Land", props.country || ""]
      ];
      const host = document.getElementById("ro-list");
      if (host) {
        host.innerHTML = "";
        for (const [label, value] of rows) {
          const wrap = document.createElement("div");
          wrap.className = "ro-item";
          const lab = document.createElement("label");
          lab.textContent = label;
          const input = document.createElement("input");
          input.readOnly = true;
          input.value = value || "";
          wrap.appendChild(lab);
          wrap.appendChild(input);
          host.appendChild(wrap);
        }
      }
      document.getElementById("ibanForm").style.display = "block";
    } catch (e) {
      document.getElementById("msg").textContent = "Fehler beim Laden.";
    }
  }

  loadData();
})();
