
# IBAN-Erhebung (Netlify + Mailjet)

Stand: 2025-08-13

Diese App spiegelt den funktionierenden Verify-Flow und fuegt unten die IBAN-Erfassung hinzu.
Oben werden die Verify-Adressfelder **read-only** angezeigt (nur Anzeige), unten erfolgt die IBAN-Erfassung mit **Client- und Server-Pruefung (Mod-97)**.

## ENV (Netlify)
- BASE_IBAN_URL
- MJ_APIKEY_PUBLIC, MJ_APIKEY_PRIVATE
- MAIL_FROM_ADDRESS, MAIL_FROM_NAME
- IBAN_TEST_MODE (0|1)
- IBAN_TOKEN_DAYS (z. B. 7)
- GET_CONTACT_INTERNAL_KEY
- IBAN_DEFAULT_CATEGORY = "VN DIREKT" oder "VN ANWALT"
- TEMPLATE_DE_IBAN_DIRECT, TEMPLATE_DE_IBAN_LAWYER
- TEMPLATE_EN_IBAN_DIRECT, TEMPLATE_EN_IBAN_LAWYER
- NODE_VERSION (optional)

## Mailjet Properties (Kontakt)
- token_iban, token_iban_expiry, token_iban_used_at
- iban_status (issued|opened|submitted|expired|invalidated)
- link_iban, sprache
- ip_iban, agent_iban, timestamp_iban
- iban (Klartext-IBAN), glaeubiger, bic, country
- zusaetzlich vorhandene Felder fuer Anzeige: glaeubiger_nr / glaeubiger, vorname, nachname, strasse, hausnummer, plz, ort, land

## Endpoints
- POST /api/iban_issue_token  → Token erstellen, Status `issued`, optional Mail versenden
- GET  /api/iban_check        → Token pruefen, Anzeige-Felder liefern, Status `opened`
- POST /api/iban_submit       → IBAN validieren & speichern, Status `submitted`, Token leeren

## Deployment
- Repo/Ordner hochladen, Netlify als Site deployen, Domain `iban.sikuralife.com` hinterlegen.
- ENV laut obiger Liste setzen.
- Testlink: https://iban.sikuralife.com/?id=<ID>&token=<TOKEN>&em=<base64url(email)>&lang=de

## Hinweis
- Italienisch mapped bewusst auf EN-Templates (it + VN DIREKT → TEMPLATE_EN_IBAN_DIRECT etc.).
- IBAN wird **nicht** geloggt (nur in Mailjet in `iban` gespeichert).
