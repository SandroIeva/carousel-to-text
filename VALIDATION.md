# Verifikation — 09.10.2026

| Prüfung | Ergebnis |
| --- | --- |
| Eingang ZIP: 7.423 Bytes, SHA-256 | stimmt exakt; ZIP CRC, Pfade und Symlinks geprüft |
| Original-MVP | Flask, Apify Actor, Gemini 2.5 Flash-Lite, nur Markdown; keine Auth/DB |
| Supabase-Projektprüfung erneut | Zugriff repariert; Migration 20261009103544 erfolgreich angewendet |
| Supabase Tabellen/Advisors | RLS/Rechte geprüft; Security Advisors ohne Befunde |
| Supabase Publishable-Key-Abfrage | ebenfalls Zugriff verweigert |
| `npm run typecheck` | bestanden |
| `npm test` | 13 Tests bestanden, keine übersprungen |
| Produktionsbuild Next.js 16.4.0 | bestanden (Turbopack) |
| `npm run test:http` | bestanden gegen gestarteten Produktionsserver |
| Chromium / visuelle E2E-Tests | nicht ausgeführt: Browser-Download in Umgebung lieferte unbrauchbare ZIP-Datei |
| Live-Registrierung, Apify und Gemini | nicht ausgeführt: serverseitige API-Keys nicht konfiguriert |
| Vercel Deployment | vorbereitet, nicht ausgeführt |

Die Unit-/Integrationstests prüfen:

- Instagram-Link-Normalisierung und Zurückweisung fremder/verdeckter Hosts.
- Medien-SSRF-Allowlist, Credentials, Ports, Redirect-Konfiguration, MIME-Typ und 8-MB-Limit.
- Reihenfolge einschließlich Video-Slides und fehlender Bilder; explizite Ablehnung über 25 Slides.
- Markdown/TXT/JSON mit Unicode, Caption und Fehler-Platzhaltern.
- Echte PostgreSQL-RLS-Ausführung in PGlite mit Rollen `anon`, `authenticated` und `service_role`: Nutzer A/B getrennt, Limits nicht manipulierbar, RPCs für Clients gesperrt, aktive Jobs nicht löschbar, Löschung erhält Nutzung.
- Quota, Wiederholbarkeit identischer Anfrage-ID und exklusive Job-Lease.
- Queue-Übergänge: Actor-Start, Fortsetzung, abgeschlossene/teilweise/fehlerhafte Ergebnisse, Fehler nur auf aktuellem Slide, begrenzte Wiederholungen.
- Mock-Provider-Anfragen: Secrets nur in HTTP-Headers, Dataset muss zum Shortcode passen, abgeschnittene OCR-Antworten werden abgelehnt.

HTTP-Smoke: Landing/Login ausgeliefert; Dashboard ohne Session umgeleitet; API ohne Session/Konfiguration gesperrt; private Cache-Header; CSRF-Originprüfung; Cron ohne Token gesperrt.

## Umgebungseinschränkung

Die Work-Sandbox erlaubt keine normale `/proc`-Speichermessung: `process.memoryUsage()` meldete `uv_resident_set_memory ENOENT`. Der Build und gestartete Testserver wurden mit einem **nur im Scratch-Verzeichnis befindlichen** Node-Preload ausgeführt, der bei diesem ENOENT für diese Messung Nullwerte zurückgibt. Anwendungscode, TypeScript, Datenbanktests, Bundling und Routenerstellung wurden nicht deaktiviert. Die Anpassung ist **nicht** im Projektpaket enthalten; auf Vercel bzw. einem normalen Node-System ist `npm run build` vorgesehen.

Die zunächst aktuelle Supabase-CLI stürzte in dieser Sandbox ab. Die auf 2.81.3 gepinnte CLI konnte `migration new carousel_saas` erfolgreich ausführen. Die Migration wurde danach mit dem geprüften Schema befüllt. Alle Abhängigkeiten sind exakt gepinnt; Lockfile ist enthalten.

Die erfolgreiche lokale Prüfung ersetzt keine Live-Abnahme. Die benötigten Schritte und Grenzen stehen in DEPLOYMENT.md.

## Live-Supabase-Nachprüfung

Live-SQL-Tests bestanden: Eigentümer sieht eigenen Job, anderer JWT-Nutzer sieht ihn nicht; anonyme Tabellen-/RPC-Zugriffe gesperrt; Client-RPCs, Limit- und Job-Updates gesperrt; Reservierung, Nutzung, Idempotenz, Rate-Limit, Quota, exklusive Lease und Wiederaufnahme abgelaufener Lease. Temporäre Testdaten zurückgerollt; finale Zählung: 0 Auth-Nutzer, 0 Jobs, 0 Pläne, 0 Verbrauchszeilen.

Umfangreiche RLS- und Live-Löschtests meldeten Invalid or expired requestState. Diese Tests werden nicht als bestanden gewertet. Sicherheitsprüfung des Schemas und die kleineren Live-Tests bestanden. Der Performance-Advisor meldete lediglich den erwarteten, noch unbenutzten Queue-Index: https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index.

## Vereinfachte Oberfläche

Seitennavigation, Statistik-Kacheln und Marketing-Landing entfernt. Startseite und angemeldete Ansicht nutzen dieselbe einfache Linkeingabe. Ergebnisse bleiben slideweise getrennt und erhalten Zeilenumbrüche; Kopieren und drei Exportformate bleiben verfügbar. Verlauf und Originalbeschreibung sind eingeklappt. Nicht angemeldete Nutzer werden vor der Extraktion zur Anmeldung geführt; der eingegebene Link bleibt tabbezogen erhalten. Exakte Schriftgrößen und Bildpositionen werden nicht rekonstruiert. Produktionsbuild (Webpack), TypeScript und HTTP-Smoke bestanden. Browser-E2E weiterhin nicht ausgeführt.

## English interface

All interface text, authentication messages, API errors, status labels, metadata and export labels use English. The document language is `en`. OCR preserves the source language; unreadable/empty placeholders use English. TypeScript, all 13 tests, production build and HTTP smoke passed after the language change.

## Supabase integration aliases

Session and proxy configuration share server-only alias resolution. Publishable keys take priority over legacy anon keys; server secret takes priority over legacy service_role. No public key fallback for privileged operations. All 14 tests (including configuration/readiness checks), TypeScript production build and HTTP smoke passed. Actual Vercel environment values and live provider operation remain unverified.

## Google login

Added Google OAuth server action using the SSR client with PKCE and a fixed APP_URL callback. Existing callback exchanges the code for a session; denied OAuth returns a generic English message without reflecting provider input. Login button, production build/TypeScript, and HTTP checks including OAuth cancellation passed. Real Google sign-in remains untested until the provider is enabled with OAuth client credentials.

## Vercel origin validation fix

The old check accepted only APP_URL; mismatched deployment addresses caused HTTP 403 before URL parsing. Exact Vercel project, deployment and branch origins are now accepted alongside APP_URL, while missing/null/foreign/spoofed origins remain denied. The reported Instagram link normalizes correctly. All 16 tests, TypeScript production build and HTTP smoke passed. Actual production environment values and authenticated extraction still require live verification.

## Origin diagnostics

Repeated production rejection remains unresolved. Error responses now show only parsed public browser/configured origins or missing/invalid configuration indicators. No credentials, query strings or raw environment values are reflected. The 16 tests, including diagnostic assertions, and production build passed. Need the resulting production message to identify the live mismatch.

## Per-slide provider diagnostics

Screenshot showed all OCR steps failing, not an unreadable layout. Added safe provider-specific HTTP/network diagnostics for Gemini, Apify and image downloads. Only controlled messages are persisted; raw response bodies, secrets and unknown exceptions remain hidden. 17 tests and production build passed. Need a new extraction on the updated deployment to determine actual provider failure; no billing requirement has been established.

## Expandable saved extractions

Replaced selected-result/history picker with independent post accordions. Initial jobs still come from authenticated RLS queries; no local-only persistence. New jobs open automatically, existing jobs start collapsed after reload. Caption/creator titles, per-slide/all copying, exports and delete use existing protected APIs. Home now redirects authenticated users to saved results. Production build/TypeScript and HTTP smoke passed; live authenticated browser validation remains open.

## Login cleanup

Removed welcome label; centered confirmation note. Login now redirects already authenticated users to dashboard, complementing the authenticated home redirect. Production build and HTTP smoke passed. Reported Google session issue remains unverified; validate Supabase app callback allowlist and use the same canonical app domain throughout PKCE.


## Multi-platform update (2026-10-09)

LinkedIn (Curly) and Threads (The Mine Works) adapters added, with source matching, one-post input, a $0.009 Apify run cap and no new credentials. LinkedIn's real public document manifest was fetched successfully and yielded three ordered page images; these public metadata fetches incurred no actor run. The full authenticated Apify-to-Gemini chain remains unverified for the new platforms because the local environment has neither provider key. Existing Vercel server variables are used at runtime. No database/schema/RLS changes.

Verified after implementation: 22 unit/integration tests passed, TypeScript passed, production webpack build passed, and HTTP smoke passed. The actual `linkedInDocumentPages` and `readImage` provider functions also fetched the live public page-image manifest: 3 pages; first image PNG, 194,794 bytes. This verifies document/CDN parsing and download, not an authenticated actor run or OCR.


## Daily limits (2026-10-09)

Migration applied to jpgkkblchzzckoghrsku: per-account and per-IP daily counters, fixed cap 3 each, Berlin calendar day, atomic transaction locks, legacy RPC revoked. Additive migration retains existing jobs and monthly counts. 25 local tests, TypeScript, production build and HTTP smoke passed, including duplicate request IDs, 4th extraction denied, other account on same IP denied, deletion not resetting usage, next-day reset, canonical IPv6 and fail-closed IP handling. Security advisor has no new database findings; pre-existing leaked-password protection warning remains. Live privilege/RLS checks passed. The initially interrupted rollback scenario was retried successfully: the live database rejects a fourth account extraction and another account on the exhausted IP, preserves idempotency, and does not reset usage after result deletion. The entire test transaction was rolled back; no test accounts, jobs or usage counters remain.
# History and quota exemption update — 2026-10-09

- Active extractions appear expanded with platform-aware loading and slide-by-slide reading progress. Finished extractions remain in history only when they contain readable extracted text. Empty failures remain internal diagnostic records, not visible history cards.
- Limit rejection tests verify that no job is created. Composer notices are borderless and spaced 28px below the input.
- Fixed reversed daily/monthly counter assignments on the dashboard.
- Added service-managed `ctt_plans.quota_exempt`, protected by existing owner-only SELECT RLS and no authenticated write grants. Exempt reservations skip usage limits and do not consume shared IP buckets. No account email is embedded in application code.
- Live migration applied. Requested existing confirmed owner account enabled separately. Live bypass/idempotency/network-counter test passed inside a rolled-back transaction without provider calls. Client write and RPC permissions verified denied.
- Typecheck, all 26 tests and production build passed. Security advisor reports no database findings; existing leaked-password protection warning remains.

# LinkedIn Copy link fix — 2026-10-09

- Accepts author-bearing `/posts/...-ugcPost-ID-suffix` share links in addition to activity links. Tracking parameters removed.
- Resolves ugcPost links server-side using LinkedIn's public canonical URL before reservation and scraper launch. Activity and ugcPost IDs are different and are never substituted heuristically.
- HTTPS LinkedIn-only fetch, redirects disabled, 15s timeout, 1MB HTML limit, canonical host and matching author/post slug validated.
- Actual reported Ben Matthews URL resolved successfully with the application resolver to activity ID 7477337555148046336. Typecheck and 28 tests passed. No authenticated Apify/Gemini end-to-end run was performed in this workspace.

# Instagram budget regression — 2026-10-09

- Actual failed run OUTPUT reported `stopped_early: charge_limit`, no GraphQL calls or post lookups. The 0.009 USD cap triggered the actor's guard immediately after its 0.005 USD start charge.
- Successful earlier run used the same actor build 0.1.3 and charged 0.00679 USD (one start plus one post). This was not a public-post or dataset-matching failure.
- Instagram now uses a technical 0.01 USD ceiling and `maxItems=1`; single-post input remains enforced. Other platforms retain 0.009 USD. Gemini is separately billed.
- Empty dataset diagnostics inspect the run's OUTPUT summary and report budget stops accurately without exposing arbitrary provider responses.
- Typecheck and 28 tests passed, including Instagram budget/item count and budget error handling. End-to-end rerun needs deployed credentials; no paid retry made during diagnosis.

# Make it mine — 2026-10-12

- Added optional audience/tone/angle input and server-side Gemini rewriting with JSON output validation. Original readable slide positions are preserved; unreadable/failed slides are excluded. No Apify calls or new keys needed.
- Original slides and Your version have separate disclosure sections, slide copy, Copy all and Markdown/TXT/JSON exports. Original closes when the new version is ready. Latest successful version persists across reloads and remains intact during regeneration or provider failure.
- Additive migration applied: owner-read-only rewrite rows, service-only writes and quota counters, service-only atomic claim RPC, 90-second generation lease, cascading deletion with original job. Three attempts per Berlin day per account and IP; existing quota-exempt owner bypass remains.
- Typecheck, production build and all 30 tests passed. Tests cover provider schema/positions/truncation, secrets in headers, cross-user access denial, quotas, concurrent generation, regeneration preservation and cascade. Live lease/preservation test passed in a rolled-back transaction; client RPC privilege denied. Security advisor: no database findings, existing password protection warning only.
- Real Gemini end-to-end generation not run locally: credentials remain in Vercel. Model generation rewrites wording and angle; factual correctness and independence still need editorial review before publishing.

# Automatic i7OS plan recognition — 2026-10-12

- Confirmed email is taken from Slide Scrape's verified Auth user; the existing session and public project key are sent only to the configured HTTPS i7OS entitlement endpoint. No caller-supplied email, JWT-only decoding, alias collapsing or extra login.
- Effective paid Basic/Pro/Max limits are 10/25/50 daily for scraping and rewriting. Free limits, aggregate IP buckets, owner exemption, rate/concurrency protections and RLS stay enforced. Checks cache for 60s, invalidate on changed email, and downgrade on unavailable/malformed/unpaid results. SQL premium expiry is 120s.
- Slide Scrape migration applied. Live transactional paid quota/expiry tests passed and were rolled back. i7OS endpoint responds 401 with no-store when credentials are absent; i7OS agent reports its confirmed-email lookup deployed. No changes pushed to the i7OS repository from this workspace.
- Typecheck, 33 tests and production build passed. No DB security advisor findings; pre-existing password protection warning remains. Full two-app paid-account test requires a real signed-in session and remains pending; no credentials were extracted or logged.

# Adapted titles — 2026-10-12

- Gemini generates a required non-empty title (max 200 characters) alongside slide text. Title and slides persist atomically; failed regeneration preserves the prior successful title and slides.
- Your version shows a separate copyable title. Copy all and Markdown/TXT/JSON exports include it. Existing saved versions remain compatible and gain a title when regenerated.
- Additive title column migration applied and verified. Typecheck and all 34 tests passed, including provider title validation and exports.

