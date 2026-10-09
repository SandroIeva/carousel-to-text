# SlideScript — Carousel to Text SaaS

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
- Instagram-URL validieren, Apify-Actor des MVPs asynchron starten, Carousel laden und Gemini 2.5 Flash-Lite pro Bild aufrufen.
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

Medienabrufe erlauben ausschließlich HTTPS auf `cdninstagram.com` und `fbcdn.net` inklusive echter Subdomains, keine Credentials/abweichenden Ports oder Redirects. Maximal 8 MB werden gestreamt; nur JPEG/PNG/WebP. API-URLs sind serverseitig festgelegt. Antworten mit OCR-Abbruch oder fehlendem Inhalt werden als Fehler behandelt.

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
