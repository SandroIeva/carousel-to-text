# Deployment auf Vercel

## 1. Zielprojekt prüfen und Schema anwenden

Projekt: `jpgkkblchzzckoghrsku`. Der Supabase-Zugriff wurde repariert. Die Migration `20261009103544_carousel_saas` wurde am 09.10.2026 im Zielprojekt erfolgreich angewendet. Vorher waren weder öffentliche Tabellen noch Auth-Nutzer vorhanden. Bestehende Daten wurden nicht verändert.

Die lokale Datei `supabase/migrations/20261009103544_carousel_saas.sql` entspricht dem angewendeten Schema. **Im Zielprojekt nicht erneut ausführen.** Für neue, leere Projekte einmal anwenden. `schema.sql` enthält denselben Inhalt für lokale Tests.

RLS ist auf allen drei Tabellen aktiv. Live-SQL-Tests für Eigentümertrennung, gesperrte Client-RPCs und Schreibrechte, anonyme Zugriffe, Quota, Rate-Limit, Idempotenz und Job-Leases bestanden. Die Testdaten wurden zurückgerollt; danach waren Auth-Nutzer und alle App-Tabellen leer. Security Advisors meldeten keine Befunde. Live-Löschtests lieferten einen Verbindungsfehler; Löschpolicies wurden anhand des Schemas und lokal geprüft. Login und Provider-End-to-End bleiben offen.

Limits können nur administrativ geändert werden:

```sql
insert into public.ctt_plans(user_id, monthly_limit)
values ('<BESTÄTIGTE-USER-UUID>'::uuid, 100)
on conflict (user_id) do update set monthly_limit=excluded.monthly_limit;
```

## 2. Umgebungsvariablen

In Vercel getrennt für Production/Preview konfigurieren; `.env.local` niemals committen oder hochladen.

| Variable | Wert / Zweck | Browser |
| --- | --- | --- |
| NEXT_PUBLIC_SUPABASE_URL | https://jpgkkblchzzckoghrsku.supabase.co | öffentlich |
| NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY | aktiver Publishable-Key des Projekts | öffentlich zulässig |
| SUPABASE_SECRET_KEY | Supabase Secret-Key (`sb_secret_…`), alternativ kompatibler legacy service_role-Key | nur Server |
| APIFY_TOKEN | Apify-Token mit Actor-Zugriff | nur Server |
| APIFY_ACTOR | themineworks~instagram-post-scraper, aus dem MVP übernommen | nur Server |
| GEMINI_API_KEY | Gemini API-Key | nur Server |
| GEMINI_MODEL | gemini-2.5-flash-lite | nur Server |
| APP_URL | exakte HTTPS-Origin der App, z. B. https://dein-projekt.vercel.app | nur Server |
| CRON_SECRET | eigener zufälliger langer Wert, falls Scheduler aktiv | nur Server |

Supabase-Secret-Key ist für Queue-Schritte und atomare Reservierungen erforderlich. Die Session-Prüfung geschieht vorher mit dem normalen Nutzer-Client. Das Nutzer-ID-Argument wird ausschließlich aus dem verifizierten Nutzer abgeleitet.

Für Preview-Deployments APP_URL auf die Preview-Origin setzen und Redirects in Supabase zulassen. Keine Produktionsdatenbank für ungeprüfte Schemaexperimente verwenden. Änderungen an öffentlichen Variablen erfordern einen neuen Build.

## 3. Auth

In Supabase Auth E-Mail/Passwort aktivieren. Site URL auf APP_URL setzen und Redirect URLs für `APP_URL/auth/callback` sowie lokale Entwicklungs-URLs freigeben. E-Mail-Bestätigung aktiviert lassen. Für verlässlichen Registrierungsversand den vorgesehenen SMTP-Versand konfigurieren und dessen Limits berücksichtigen.

Das Standard-PKCE-Verfahren verwendet `/auth/callback`. Für E-Mail-Bestätigung auf einem anderen Gerät die Confirm-signup-Mailvorlage alternativ auf folgenden Token-Hash-Link umstellen:

```html
<a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email">E-Mail bestätigen</a>
```

Die App akzeptiert an `/auth/confirm` nur den Typ `email` und leitet immer auf die feste APP_URL weiter.

## 4. Vercel-Projekt

Den Inhalt dieses Projektordners in das gewünschte Git-Repository übernehmen und in Vercel importieren. Framework: Next.js; Node.js 22 oder 24; Install: `npm ci`; Build: `npm run build`; Root Directory: Ordner mit `package.json`.

`vercel.json` bereitet Hosting vor. Fluid Compute aktivieren und prüfen, dass 90 Sekunden für `/api/jobs/[id]/step` und 300 Sekunden für `/api/cron` verfügbar sind. Werte sind im Code exportiert. Zunächst ein Preview-Deployment verwenden, Live-Checks aus Abschnitt 6 durchführen, danach Production veröffentlichen. In dieser Übergabe wurde kein Deployment gestartet und keine Vercel-Ressource angelegt.

## 5. Verarbeitung im Hintergrund

Standardmäßig ist kein kostenabhängiger Scheduler eingeschaltet. Das Dashboard setzt Jobs selbst fort. Für automatischen Betrieb mit Vercel Pro/Enterprise `deploy/vercel.pro.json` als `vercel.json` übernehmen und CRON_SECRET setzen. Der Minuten-Cron ruft `/api/cron` auf. Vercel übermittelt CRON_SECRET als Bearer-Token; der Handler prüft ihn. Auch ein externer autorisierter Scheduler kann den Endpunkt entsprechend aufrufen.

Vercel Hobby erlaubt derzeit nur tägliche Cron-Ausführung, daher keinen Minuten-Cron in diesem Plan aktivieren. Quelle: https://vercel.com/docs/cron-jobs/usage-and-pricing (geprüft 09.10.2026). Function-Dauer: https://vercel.com/docs/functions/configuring-functions/duration.

Jeder Cron-Aufruf bearbeitet maximal drei Jobs, einen Schritt pro Job. Eine Extraktion mit 25 Slides dauert dadurch ohne offenes Dashboard mindestens 27 Minuten bei Minuten-Cron. Bei größeren Warteschlangen wächst diese Dauer. Bilder können in der Zwischenzeit ablaufen. Für höhere Last einen dedizierten Worker verwenden und Last-/Kostenmessung ergänzen.

## 6. Live-Abnahme

1. Zwei Testkonten registrieren, E-Mails bestätigen, anmelden und abmelden; Cookies/Session-Refresh prüfen.
2. Einen bekannten öffentlichen Carousel-Link verarbeiten. Slide-Anzahl und Reihenfolge mit Instagram vergleichen; Zahlen und Interpunktion am Original prüfen.
3. Markdown, TXT und JSON herunterladen; Umlaute und Fehler-Platzhalter prüfen.
4. Mit Konto B weder Verlauf noch Export von Konto A erhalten; auch ID direkt in der URL testen.
5. Ein Limit administrativ auf 1 setzen und nach einer Extraktion eine weitere Anfrage testen (429). Parallele Anfragen und erneute identische Anfrage testen.
6. Fenster während der Verarbeitung schließen und mit Scheduler fortsetzen; anschließend gespeicherten Status prüfen.
7. Videos, fehlende Bildquelle, private/gelöschte Posts, ungültige Links, Provider-Timeouts und fehlende API-Keys testen.
8. Abgeschlossene Extraktion löschen; Nutzung bleibt erhalten. Browser-Netzwerk/JS auf privilegierte API-Keys prüfen.

Diese Live-Abnahme ist noch nicht erfolgt. Erforderlich sind serverseitig konfigurierte Apify-, Gemini- und Supabase-Zugangsdaten.

## Supabase integration variable aliases

The app also accepts `NEXT_PUBLIC_SUPABASE_PUBLISH_KEY`, `SUPABASE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` or `SUPABASE_ANON_KEY` for the public key; `SUPABASE_URL` for the URL; and `SUPABASE_SERVICE_ROLE_KEY` for server operations. Existing `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SECRET_KEY` take precedence. All aliases are read only in server modules. Public keys never substitute for server secrets. `POSTGRES_*` variables are unused.
