# Slide Scrape — Carousel to Text SaaS

Weiterentwicklung des unveränderten Flask-MVPs im Ordner `original-mvp/` nach Next.js. Projekt: `jpgkkblchzzckoghrsku`. Das gelieferte ZIP wurde vor dem Entpacken gegen SHA-256 `bc948780611146eb449dbc488095446f6666c35d1b97aea930019345192580a5` verifiziert (7.423 Bytes); ZIP-CRC und Pfade wurden geprüft.

## Start

Node.js 22 oder 24 verwenden.

```sh
npm ci
cp .env.example .env.local
# Werte serverseitig eintragen
npm run dev
```

Siehe [DEPLOYMENT.md](DEPLOYMENT.md) für Supabase und Vercel. Ohne Konfiguration zeigt die App den Einrichtungsstatus und erlaubt keine Extraktion. Es gibt keinen simulierten Erfolg.

## Implementiert

- Schlichte responsive Oberfläche mit Linkfeld und slideweise gegliedertem Text, Login und Registrierung mit Supabase Auth, Bestätigungslink und Logout.
- Instagram-, LinkedIn- und Threads-Post-URLs validieren und den passenden Apify-Actor asynchron starten. Bilder und vollständige LinkedIn-Dokumentseiten werden einzeln mit dem konfigurierten Gemini-Modell transkribiert; reine Textposts ohne OCR gespeichert.
- Originalsprache, Lesereihenfolge, Überschriften, Listen, Zahlen und Interpunktion im OCR-Prompt erhalten. Keine Übersetzung oder Zusammenfassung. Unlesbare Stellen explizit kennzeichnen.
- Alle gelieferten Slide-Positionen erhalten, einschließlich Video- und Fehler-Platzhaltern. Maximal 25 Slides; größere Carousels werden ausdrücklich abgelehnt statt still gekürzt. Videos werden nicht transkribiert.
- Eingeklappter eigener Verlauf (letzte 100 Extraktionen), Fortschritt, Text kopieren, Markdown/TXT/JSON-Export und Löschen abgeschlossener Extraktionen.
- Gespeicherte Queue mit Lease pro Job, Fortsetzung durch Dashboard oder geschützten Cron-Endpunkt.
- Atomare Nutzungslimits: standardmäßig 30 Extraktionen pro UTC-Kalendermonat, maximal drei offene Jobs pro Nutzer und zehn Sekunden zwischen neuen Anfragen. Limits sind pro Nutzer serverseitig konfigurierbar.
- RLS auf allen drei Tabellen, kein direkter Client-Schreibzugriff auf Jobs, Kontingente oder Limits. Nutzer können nur eigene abgeschlossene Ergebnisse löschen. Kontingente bleiben auch nach dem Löschen erhalten.

## Verarbeitung

1. Der Server verifiziert die Session mit `getUser()`.
2. `ctt_reserve_job` reserviert Kontingent und Job gemeinsam in einer Transaktion. Die Anfrage-ID verhindert doppelte Reservierungen bei Wiederholung.
3. Ein Schritt startet Apify; weitere Schritte prüfen den Run und laden das Dataset. Pro Verarbeitungsschritt wird ein Slide transkribiert und gespeichert.
4. Laufende Jobs erhalten eine 120-Sekunden-Lease mit eindeutiger Kennung. Ein abgebrochener Request kann nach Ablauf erneut übernommen werden. Updates prüfen die Kennung und überschreiben keine neuere Lease.
5. Nach allen Slides wird der Status `completed`, `partial` oder `failed` gespeichert. Ein fehlgeschlagener Slide zählt nicht als gelungene Transkription.

Das Dashboard führt einen Schritt nach dem anderen aus. Ohne aktivierten Scheduler pausieren Jobs nach Schließen des Dashboards und laufen beim nächsten Öffnen weiter. Für Verarbeitung ohne offenes Fenster muss der Scheduler aus DEPLOYMENT.md aktiviert werden.

## Sicherheit und Daten

`APIFY_TOKEN`, `GEMINI_API_KEY`, `SUPABASE_SECRET_KEY` und `CRON_SECRET` stehen nur in Server-Modulen mit `server-only`. Nur Supabase-URL und Publishable-Key dürfen `NEXT_PUBLIC_` verwenden. Privilegierte RPCs sind für `anon`, `authenticated` und `PUBLIC` gesperrt; ausschließlich `service_role` darf sie ausführen. Alle RPCs nutzen SECURITY INVOKER, keine SECURITY DEFINER-Funktionen.

Medienabrufe erlauben ausschließlich HTTPS auf `cdninstagram.com`, `fbcdn.net` und `media.licdn.com` inklusive echter Subdomains, keine Credentials/abweichenden Ports oder Redirects. Maximal 8 MB werden gestreamt; nur JPEG/PNG/WebP. API-URLs sind serverseitig festgelegt. Antworten mit OCR-Abbruch oder fehlendem Inhalt werden als Fehler behandelt.

Extrahierte Inhalte werden als Text angezeigt, nicht als HTML interpretiert. Mutierende API-Routen prüfen Origin und Session. Private Antworten sind `no-store`. Ursprungstexte und Bilder werden als Daten behandelt, nicht als Anweisungen ausgeführt.

Gespeichert werden URL, Creator, Caption, Texte, Status, temporäre Bild-URLs und Provider-Run-IDs; Bilddateien selbst werden nicht gespeichert. Bildbytes werden an Gemini übermittelt; der Link an Apify. Löschen entfernt den Job, nicht die bereits angefallene Nutzung und keine externen Provider-Logs. Aufbewahrungsfristen und Rechtstexte sind vor öffentlicher Vermarktung passend zum Betreiber festzulegen.

## Tests

```sh
npm run typecheck
npm test
npm run build
npm run test:http
# Browser installieren, dann visuelle Smoke-Tests:
npx playwright install chromium
npm run test:ui
```

Die Datenbanktests führen das echte SQL in PGlite/Postgres aus und simulieren die Supabase-Rollen und `auth.uid()`. Sie testen die Policies und Rechte, sind jedoch kein Ersatz für Live-Tests gegen das Zielprojekt. Provider-Tests nutzen HTTP-Mocks; echte Zugangsdaten werden nicht für lokale Tests benötigt.

Siehe [VALIDATION.md](VALIDATION.md) für den tatsächlich geprüften Stand und offene Live-Checks.

## Grenzen

KI-Texterkennung ist nicht garantiert fehlerfrei; das Original bleibt für die Überprüfung verlinkt. Ein fehlgeschlagener Slide kann durch eine neue Extraktion erneut versucht werden. Auch fehlgeschlagene Extraktionen zählen gegen das Limit. Abgebrochene Requests können externe Aufrufe wiederholen; die Queue liefert keine Exactly-once-Garantie für Apify-/Gemini-Kosten. Insbesondere ein Abbruch zwischen Apify-Start und Speicherung der Run-ID kann einen zweiten Actor-Run verursachen.

Bei großen Nutzerzahlen sollte der Cron-Batch durch einen dedizierten Queue-Worker ersetzt werden; der aktuelle Batch verarbeitet maximal drei Jobs pro Aufruf. Billing, Abonnements, Organisationen, Passwort-Zurücksetzen und Admin-Oberfläche sind nicht Bestandteil dieses Auftrags.

## Supabase integration variable aliases

The app also accepts `NEXT_PUBLIC_SUPABASE_PUBLISH_KEY`, `SUPABASE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` or `SUPABASE_ANON_KEY` for the public key; `SUPABASE_URL` for the URL; and `SUPABASE_SERVICE_ROLE_KEY` for server operations. Existing `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SECRET_KEY` take precedence. All aliases are read only in server modules. Public keys never substitute for server secrets. `POSTGRES_*` variables are unused.

Google sign-in is implemented alongside email/password. Enable the Google provider and configure OAuth credentials in Supabase as described in DEPLOYMENT.md. The Gemini API key does not enable Google login.

Saved extractions appear as independently expandable post entries, newest first, titled from the first caption line or creator. Each entry contains slides, per-slide and whole-post copying, exports and terminal-job deletion. Signed-in users opening the home route return to their persisted history.

## LinkedIn and Threads

No extra API key is required. Existing `APIFY_TOKEN` and `GEMINI_API_KEY` remain server-only. Defaults:

- Instagram: `themineworks~instagram-post-scraper` (`APIFY_ACTOR`).
- LinkedIn: `curly~linkedin-post-scraper` (`APIFY_LINKEDIN_ACTOR`). Public author-bearing `/posts/...-activity-...` URLs only; `/feed/update/` aliases are explicitly rejected because this actor does not support them.
- Threads: `themineworks~threads-scraper` (`APIFY_THREADS_ACTOR`), single-post mode, `maxPosts: 1`. Both threads.net and threads.com links are accepted. Vitalue was not selected: its input schema describes post URLs as comment targets rather than full post retrieval.

Dataset rows must match the submitted post URL; quoted/parent posts and metadata rows are not substituted. Native post text is kept as the original caption, with its own copy action, and included in full-post copying. Text-only posts complete immediately without a Gemini call. Media text uses the same per-slide pipeline, history, quotas, deletion and exports as Instagram. Videos remain explicitly unsupported.

For LinkedIn documents, follow the `media[].url` master manifest, select its highest-resolution `perResolutions[].imageManifestUrl`, then read the ordered `pages[]`. This contract was observed on a public three-page LinkedIn document. Only HTTPS media.licdn.com is allowed, without redirects, credentials or non-default ports. Manifest responses are capped at 1 MB; documents and combined media at 25 pages. A missing/full-document access failure is shown clearly; never silently extract just the cover. PDF-only sources or changed manifest schemas are not supported by this adapter yet.

Instagram runs send `maxTotalChargeUsd=0.01` and `maxItems=1`: the actor's startup guard stops prematurely with a 0.009 cap, despite a single post costing 0.00679 USD on the verified free-plan run. LinkedIn and Threads retain `maxTotalChargeUsd=0.009`. All runs send `timeout=300` and `restartOnError=false`. These caps cover the scraper run, not Gemini, taxes, hosting, subscriptions or multiple runs caused by an interrupted start. The app does not automatically purchase any provider credit package. Actor overrides must retain the documented input/output contracts and pricing.

Live authenticated actor runs and Gemini calls for these new platforms require the Vercel environment. They were not executed locally because local keys are absent. Mock integration tests exercise actor routing, budget parameters, post matching, manifest resolution, SSRF/size limits, text-only completion, and exports; Instagram regression tests remain passing. No database migration is needed: platform is derived from the saved URL and slides are already JSON.

## Daily account and IP abuse limits

All platforms share a fixed limit of 3 new extractions per account and 3 per network/IP per Europe/Berlin calendar day. The existing 30/month, 3-active-job and 10-second account limits remain. Limits reserve atomically in the database with user and IP transaction locks; idempotent request IDs do not increment again. Failed jobs count and deleting results does not reset usage. Login is still allowed, while scraping is denied with HTTP 429 after either cap. Shared Wi-Fi/NAT users share the network allowance; VPNs or changing IPs are not prevented by an IP cap.

Vercel supplies the trusted client IP; arbitrary forwarding headers are not trusted on other production hosts (fail closed). Canonical IPv6 and IPv4-mapped addresses hash identically. No raw IP is stored: server-only HMAC-SHA256 uses optional `IP_HASH_SECRET` or the existing Supabase server key. Changing this secret resets IP identity and should not be done mid-day. IP counters have no public/client permissions; daily account counters have owner-only SELECT through RLS. Daily/IP buckets older than 7 days are pruned on successful reservations. Existing retained jobs from today are backfilled for the account cap; past IPs and previously deleted jobs cannot be reconstructed.

Apply `supabase/migrations/20261009153007_daily_user_and_ip_limits.sql` before running this version. It is additive, preserves jobs and monthly usage, and revokes the old 3-argument RPC to prevent a quota bypass; old deployments cannot create jobs until updated. `schema.sql` includes both initial and new schema for fresh installations. No new environment variables are required on Vercel. Local development uses a shared loopback bucket; production off Vercel needs a reviewed trusted-proxy adapter.
