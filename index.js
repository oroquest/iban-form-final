// index.js — minimal, robust handoff of URL params to iban_ro
(function () {
  function $(id){ return document.getElementById(id); }
  var qs = new URLSearchParams(window.location.search);
  var id    = qs.get("id")    || "";
  var token = qs.get("token") || "";
  var em    = qs.get("em")    || "";   // base64url email from mailjet
  var lang  = (qs.get("lang") || "de").toLowerCase();

  // Write into hidden inputs if they exist (for debugging/submit)
  if ($("id")) $("id").value = id;
  if ($("token")) $("token").value = token;
  if ($("em")) $("em").value = em;

  async function load() {
    try {
      // Send BOTH fields: "em" and "email" (function accepts either)
      var body = JSON.stringify({ id: id, token: token, em: em, email: em, lang: lang });
      var r = await fetch("/.netlify/functions/iban_ro", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: body,
        cache: "no-store",
      });
      if (!r.ok) {
        document.getElementById("msg") && (document.getElementById("msg").textContent = "Link ungültig oder abgelaufen.");
        return;
      }
      var j = await r.json();
      if (!j.ok) {
        document.getElementById("msg") && (document.getElementById("msg").textContent = j.error || "Link ungültig.");
        return;
      }
      // Fill a few fields so we see it's working
      if ($("email")) $("email").value = j.email || "";
      var ro = j.readonly || {};
      var host = document.getElementById("ro-list");
      if (host) {
        var rows = [
          ["Gläubiger-Nr.", id],
          ["Vorname", ro.firstname || ro.first_name || ""],
          ["Nachname", ro.lastname || ro.last_name || ro.name || ""],
          ["Strasse", ro.strasse || ro.street || ""],
          ["Nr.", ro.hausnummer || ro.house_no || ro.housenumber || ""],
          ["PLZ", ro.plz || ro.zip || ro.postcode || ""],
          ["Ort", ro.ort || ro.city || ""],
          ["Land", ro.country || ""],
        ];
        host.innerHTML = "";
        rows.forEach(function (p) {
          var wrap = document.createElement("div");
          wrap.className = "ro-item";
          var lab = document.createElement("label");
          lab.textContent = p[0];
          var inp = document.createElement("input");
          inp.readOnly = true;
          inp.className = "input";
          inp.value = p[1] || "";
          wrap.appendChild(lab);
          wrap.appendChild(inp);
          host.appendChild(wrap);
        });
      }
      var form = document.getElementById("ibanForm");
      if (form) form.style.display = "block";
    } catch (e) {
      document.getElementById("msg") && (document.getElementById("msg").textContent = "Fehler beim Laden.");
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", load);
  } else {
    load();
  }
})();