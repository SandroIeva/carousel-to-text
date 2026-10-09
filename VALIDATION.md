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
