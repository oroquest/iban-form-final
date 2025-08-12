// netlify/functions/cleanup_verify_logs.js
// Räumt abgelaufene Tokens & alte Protokolle bei Mailjet auf.

const MJ_PUBLIC  = process.env.MJ_APIKEY_PUBLIC;
const MJ_PRIVATE = process.env.MJ_APIKEY_PRIVATE;
const mjAuth = 'Basic ' + Buffer.from(`${MJ_PUBLIC}:${MJ_PRIVATE}`).toString('base64');

const DAYS    = Number(process.env.CLEANUP_DAYS || 7);       // Aufbewahrungsfrist in Tagen
const DRY_RUN = process.env.CLEANUP_DRY_RUN === '1';         // Testlauf ohne Schreiben
const PAGE    = 1000;                                        // Mailjet-Page size
const SLEEPMS = Number(process.env.CLEANUP_SLEEP_MS || 150); // kleine Pause pro Kontakt

const cutoff = new Date(Date.now() - DAYS*24*60*60*1000);

function sleep(ms){ return new Promise(r=>setTimeout(r, ms)); }
function parseDate(v){ const d = new Date(v); return isFinite(d) ? d : null; }

async function mjGET(path) {
  const r = await fetch(`https://api.mailjet.com${path}`, { headers: { Authorization: mjAuth } });
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
  return r.json();
}
async function mjPUTContactData(email, updates) {
  if (!updates.length || DRY_RUN) return { ok:true, dry: true };
  const r = await fetch(`https://api.mailjet.com/v3/REST/contactdata/${encodeURIComponent(email)}`, {
    method: 'PUT',
    headers: { Authorization: mjAuth, 'Content-Type':'application/json' },
    body: JSON.stringify({ Data: updates })
  });
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
  return r.json();
}

function buildProps(arr){
  const m = Object.create(null);
  for (const p of (arr||[])) m[p.Name] = p.Value;
  return m;
}
function clear(name, arr){ arr.push({ Name: name, Value: '' }); }

exports.handler = async () => {
  const stats = { scanned: 0, updated: 0, dryUpdates: 0, skipped: 0, errors: 0, pages: 0 };

  try {
    for (let offset = 0; ; offset += PAGE) {
      // 1) Kontakte seitenweise holen
      const list = await mjGET(`/v3/REST/contact?Limit=${PAGE}&Offset=${offset}`);
      const contacts = list.Data || [];
      stats.pages++;

      if (!contacts.length) break;

      // 2) Pro Kontakt prüfen & ggf. bereinigen
      for (const c of contacts) {
        const email = (c.Email || '').trim().toLowerCase();
        if (!email) { stats.skipped++; continue; }
        stats.scanned++;

        try {
          const cd = await mjGET(`/v3/REST/contactdata/${encodeURIComponent(email)}`);
          const props = buildProps(cd.Data?.[0]?.Data || []);

          const updates = [];

          const usedAt   = parseDate(props['token_verify_used_at'] || '');
          const expiryRaw = props['Token_verify_expiry'] || props['token_verify_expiry'] || props['token_expiry'] || '';
          const expiry   = parseDate(expiryRaw);

          // a) Protokolle nach Verwendung > cutoff löschen
          if (usedAt && usedAt < cutoff) {
            clear('ip_verify', updates);
            clear('agent_verify', updates);
            clear('timestamp_verify', updates);
            clear('token_verify_used_at', updates);
          }

          // b) Nicht benutzte, längst abgelaufene Tokens entfernen
          if (!usedAt && expiry && expiry < cutoff) {
            clear('token_verify', updates);
            clear('Token_verify_expiry', updates);
          }

          if (updates.length) {
            if (DRY_RUN) { stats.dryUpdates++; }
            const res = await mjPUTContactData(email, updates);
            if (!DRY_RUN) stats.updated++;
          } else {
            stats.skipped++;
          }

          // kleine Pause, um Limits zu schonen
          await sleep(SLEEPMS);
        } catch (e) {
          stats.errors++;
          // continue mit nächstem Kontakt
        }
      }

      if (contacts.length < PAGE) break; // letzte Seite
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type':'application/json' },
      body: JSON.stringify({ ok: true, days: DAYS, dryRun: DRY_RUN, ...stats })
    };
  } catch (e) {
    return { statusCode: 500, body: `cleanup failed: ${e.message}` };
  }
};
