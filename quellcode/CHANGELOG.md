# Änderungen

## 2.6.0

### Neu
- **Konflikthinweis beim Sync:** Hat ein anderes Gerät eine Notiz, Aufgabe o. Ä. überschrieben oder gelöscht, die du hier seit dem letzten Abgleich geändert hast, erscheint ein Hinweis mit **Meine behalten**. Funktioniert auch beim ersten Abgleich nach dem Neuladen.
- **Cloud-Sicherung:** Einmal pro Woche ein verschlüsselter Schnappschuss im privaten Cloud-Speicher, die letzten 8 Wochen bleiben; je Woche wiederherstellbar (Mehr → Daten → Cloud-Sync). Nutzt den Speicher aus `anhaenge.sql`.
- **Wochenrückblick:** Die Sonntagsnachricht um 18 Uhr nennt zusätzlich die Lernzeit der Woche (mit Vorwoche) und die fälligen Karten.
- **Weg zur Uni:** Störungen und Baustellen der MVG zu deinen Linien auf „Heute“. Optional Push, wenn du wegen Verspätung oder Ausfall früher losmusst (ab 3 Minuten). Braucht die aktuelle Edge Function.
- **Teilen an StudyOS:** Aus anderen Apps Text, Links, PDFs oder Fotos an StudyOS teilen (Android, Chrome am Desktop); daraus wird eine Notiz mit Anhang.

### Behoben
- Im hellen Farbschema waren Code-Blöcke in Notizen dunkelblau hinterlegt.
- Zu schwacher Kontrast bei grauem Text (u. a. Navigation, Stundenraster, Statistiken) in beiden Farbschemata.
- Kacheln, Wochenraster-Termine, Schalter und Raum-Links heißen für Screenreader und Sprachsteuerung so, wie sie beschriftet sind.
- „1 Termine“ im Wochenausblick.

### Technik
- Start-Bundle von 644 auf 315 KB: Lernen, Module, Mehr, Suche als eigene Dateien; Supabase wird erst geladen, wenn der Cloud-Sync genutzt wird. Formeln und Code-Farben lädt der Service Worker erst beim ersten Gebrauch.
- Content-Security-Policy in `index.html` (GitHub Pages ignoriert `_headers`, die Datei ist entfernt).
- Veröffentlichen über **GitHub Pages Deployments** statt Commit ins Wurzelverzeichnis (Settings → Pages → Source: „GitHub Actions“).
- CI: `npm audit`, Typprüfung (`tsc --checkJs` für `lib/` und `server/`), Deno fest auf 2.9.6, Dependabot.
- KaTeX 0.19, Vitest 5, esbuild 0.28 (schließt gemeldete Sicherheitslücken).
- ESLint läuft ohne Warnungen (`--max-warnings 0`), ungenutzte Imports entfernt.
- `App.jsx` aufgeteilt: Speichern, Farbschema, Timer und Kalender-Abos als Hooks in `src/app/`.
- Tests: Barrierefreiheit mit axe (alle Bereiche, hell und dunkel), Screenshot-Vergleich (`npm run test:visual`), Property-Tests mit fast-check für Zusammenführen und Migration; 155 Unit-, 51 Browser-Tests.

## 2.5.3
- **Wochenraster:** Samstag und Sonntag erscheinen jetzt auch, wenn dort nur eine Abgabe oder ein Lernblock liegt (bisher nur bei Terminen und Prüfungen).

## 2.5.2
- **Artemis:** Erkennt das echte Format der Artemis-Kalender („EIDI Exercise | Due: …“ bzw. „Aufgabe | Abgabefrist: …“). Ein Abo geht jetzt auch, solange noch keine Abgaben im Kalender stehen; sie werden übernommen, sobald sie erscheinen. Freigabe-, Start- und Korrekturtermine werden ignoriert.

## 2.5.1
- **Weg zur Uni mit Umstieg:** Standard ist jetzt S6 Zorneding → Haar (8 Min.), Umstieg (4 Min.), Bus 230 → Garching-Forschungszentrum. StudyOS sucht zum spätesten passenden Bus die passende S6 (Richtung München, ohne Grafing/Ebersberg) und sagt, wann du zu Hause losmusst. Zubringer abschaltbar, alle Zeiten einstellbar; Gleis wird angezeigt.

## 2.5.0

### Neu
- **Weg zur Uni:** Echtzeit-Abfahrten (MVG) auf „Heute“, standardmäßig Bus 230 ab Haar Richtung Garching-Forschungszentrum. StudyOS sagt, wann du für die erste Veranstaltung losmusst. Haltestelle, Linie, Fahrzeit, Fußweg und Puffer einstellbar.
- **Formeln und Code:** `$…$` und `$$…$$` werden mit KaTeX gesetzt, Code-Blöcke (Java, OCaml, Python, C, SQL, Assembler …) eingefärbt. Wird nur bei Bedarf geladen und offline vorgehalten.
- **Lernblöcke:** Lernzeit im Wochenraster einplanen; StudyOS schlägt freie Lücken zwischen Veranstaltungen vor (mit passender Aufgabe), zeigt sie im Tagesplan und erinnert 10 Minuten vorher.
- **„Was jetzt?“:** Verfügbare Zeit wählen, StudyOS schlägt die wichtigste Aufgabe vor und startet den Timer (Taste W).
- **Anhänge:** PDFs und Fotos an Hausaufgaben und Notizen; mit Cloud-Sync verschlüsselt im privaten Supabase-Speicher. Einmalig `supabase/anhaenge.sql` ausführen.
- **Artemis-Abgaben:** Kalender-Abo je Artemis-Kurs, Abgabefristen werden Hausaufgaben.
- **Probeklausur:** Karten eines Moduls unter Zeitdruck, Auswertung nach Themen, unsichere Karten auf heute setzen.
- **Lernrhythmus:** Wann du am meisten lernst (Tageszeit, Wochentag) und Lernzeit je ECTS neben der Note.

### Behoben
- „Zuletzt bearbeitet“ bei Notizen zeigte einen rohen Zeitstempel.

## 2.4.0

### Neu
- **Moodle-Abgaben:** Kalender-Export aus Moodle abonnieren; Abgabefristen landen automatisch als Hausaufgaben (mit Uhrzeit). Eigene Änderungen und gelöschte Abgaben überschreibt das Abo nicht.
- **Fristen im Handy-Kalender:** Kalender-Link (iCal) für Google, Apple oder Outlook mit Abgaben, Prüfungen und Anmeldeschlüssen; jederzeit widerrufbar. Einmalig `supabase/kalender.sql` ausführen.
- **GOP-Tracker:** Wie viele der 12 ECTS Grundlagenprüfung schon bestanden sind und welche Module reichen würden.
- **Notenprognose:** Erwartete Noten eintragen und den voraussichtlichen Schnitt sehen.
- **Mensa auf „Heute“:** Speiseplan (eat-api der TUM-Dev-Gruppe), heute bzw. am nächsten Werktag; Mensa in den Einstellungen wählbar.
- **Raum finden:** Räume verlinken direkt auf NavigaTUM; pro Modul ein Link zu den Aufzeichnungen (TUM-Live).
- **Karteikarten mit FSRS-5** statt SM-2: gleicher Lernerfolg mit weniger Wiederholungen. Vorhandene Karten werden übernommen.

## 2.3.0

### Studienalltag
- **Übungsblatt-Serien:** Beim Anlegen „Jede Woche ein neues Blatt bis …“ wählen; die Nummer im Titel zählt mit (Blatt 1, 2, 3 …).
- **Bonus-Prognose:** Wie viele Punkte pro Blatt du für den Notenbonus noch brauchst, mit Ampel (erreicht, auf Kurs, knapp, nicht mehr möglich).
- **Workload-Ampel:** Ist-Stunden (Lernzeit + besuchte Termine) gegen das ECTS-Soll (30 h je ECTS, verteilt auf die Semesterwochen, einstellbar).
- **Altklausuren:** Pro Prüfung eintragen, Status Offen/Gerechnet/Korrigiert mit Punkten; offene landen automatisch auf den letzten Tagen des Lernplans.
- **Karteikarten aus Notizen:** Zeilen „Frage :: Antwort“ und Lückentexte `{{c1::…}}` werden mit einem Klick zu Karten.
- **Semester-Archiv:** Abgeschlossene Semester archivieren; sie verschwinden aus Heute, Vorschlägen und Erinnerungen, bleiben aber in Statistik und Notenschnitt.
- **Studienplan TUM Informatik:** Pflichtmodule je Semester (FPSO ab SoSe 2026) übernehmen; Module aus dem Stundenplan-Abo werden nur um Modulnummer und ECTS ergänzt.

### Neu
- **Karteikarten teilen:** Link für Kommilitonen, Inhalt im Browser verschlüsselt, Schlüssel nur im Link. Öffnen geht ohne Konto. Einmalig `supabase/teilen.sql` ausführen.
- **Erinnerungen:** um 20 Uhr, wenn heutige Termine noch nicht nachbereitet sind, und sonntags um 18 Uhr ein Ausblick auf die nächste Woche (beides abschaltbar).
- Seit 2.2: Parallele Säle als ein Termin, Termin-Karte beim Überfahren im Wochenraster, neues Heute (Tagesplan + Checkliste), Module zusammenführen, Änderungen auf alle folgenden gleichen Termine übertragen.

### Technik
- Quellcode liegt im Repository unter `quellcode/`. GitHub Actions prüft jeden Push (ESLint, Unit-Tests, Edge-Function-Test in Deno, E2E mit Playwright) und veröffentlicht die gebaute App nur, wenn alles grün ist.

## 2.2.0

### Neues Design
- **Bold Mobile:** Eigenes Farbschema (Nachtviolett bzw. helles Lavendel), Schrift Bricolage Grotesque für Überschriften, Modulfarben als Flächen statt kleiner Punkte. Hell und Dunkel unterscheiden sich nur in Design-Tokens (`src/design.css`).
- **„Als Nächstes“** oben auf Heute: die eine wichtigste Sache (laufender Termin, Prüfung, überfällige Abgabe, nächster Termin) in der Modulfarbe, mit direkten Aktionen.
- **Wischen nach rechts** hakt Abgaben bzw. Nachbereitung ab, mit Rückgängig.
- **Woche als Stundenraster** mit Jetzt-Linie, überlappende Termine nebeneinander; Listenansicht bleibt umschaltbar.
- Module als Farbkacheln, Formulare als Bottom Sheets, schwebende Navigation.

### Neu
- **Schnelleingabe:** „Blatt 4 Analysis Fr“, „Übung DS Do 14-16 MI HS 1“, „90 min Analysis Kapitel 3“ werden zu Hausaufgabe, Termin bzw. Lerneinheit. Erkennt Modulnamen, Initialen (DS, EIDI), Modulnummern, Wochentage, Datumsangaben, Uhrzeiten und Dauern.
- **Tastenkürzel (Desktop):** `?` Übersicht, `E` Schnelleingabe, `N`/`H`/`L`/`S`/`P` neu anlegen, `1`–`5` Bereiche, `T` Timer, `J`/`K` durch Listen, Leertaste startet/pausiert den Timer.
- **Push-Erinnerungen** für Abgaben, Prüfungen, Anmeldeschlüsse und Wiederholungsprüfungen, auch bei geschlossener App. Supabase Edge Function mit eigener Web-Push-Implementierung (VAPID + aes128gcm über WebCrypto, keine Fremdbibliothek), Zeitplan per pg_cron. Titel und Datum der Fristen liegen dafür unverschlüsselt bei Supabase.
- **Stundenplan-Abo (TUMonline):** iCal-Link eintragen, Veranstaltungen Modulen zuordnen. Alle 6 Stunden automatischer Abgleich: neue Termine, Raumänderungen, Ausfälle und geänderte Einzeltermine werden übernommen, eigene Häkchen bleiben. Ein leerer Kalender löscht nichts.

### Technik
- 68 Unit-Tests (u. a. Schnelleingabe, Erinnerungsregeln mit Sommer-/Winterzeit, Web-Push-Verschlüsselung gegen eine Browser-Entschlüsselung, Kalender-Abgleich), 20 E2E-Tests, 1 Test der gebauten Edge Function in echtem Deno.
- ESLint prüft zusätzlich `react/jsx-no-undef` und Zugriffe vor der Deklaration.

## 2.1.0

### Neu
- **Cloud-Sync über Supabase:** Anmeldung per E-Mail-Code (funktioniert auch in der installierten App auf dem iPhone, wo ein Mail-Link in Safari statt in der App landen würde). Die Daten werden im Browser mit einer Sync-Passphrase verschlüsselt (AES-256-GCM), Supabase sieht nur einen unlesbaren Block. Der abgeleitete Schlüssel liegt nicht auslesbar im Gerät; die Passphrase selbst wird nie gespeichert.
- Automatischer Abgleich beim Start, beim Zurückkehren in die App, wenn wieder Netz da ist, 3 Sekunden nach jeder Änderung und alle 5 Minuten. Offline arbeitet die App normal weiter.
- Gleichzeitiges Schreiben von zwei Geräten wird über eine Versionsnummer erkannt und durch erneutes Zusammenführen gelöst.
- „Ersetzen“ (Import, Wiederherstellen, „Alle Daten löschen“) wird jetzt per Zeitstempel und Löschmarken auch auf andere Geräte übertragen.
- Sync-Status im Kopf („Synchronisiert“, „Offline“, „Sync-Fehler“).

### Technik
- Nur `@supabase/auth-js` und `@supabase/postgrest-js` statt des kompletten supabase-js (spart ca. 100 KB).
- 7 Unit-Tests für die Sync-Logik (zwei Geräte, Löschungen, Schreibkonflikt, falsche Passphrase), 2 E2E-Tests (zwei Browser-Kontexte, nicht erreichbarer Server).
- `supabase/schema.sql` mit Tabelle und Zugriffsregeln.

## 2.0.0

### Neu
- **Zwei Geräte ohne Server:** Jede Änderung bekommt einen Zeitstempel, Löschungen werden als „Grabsteine“ gemerkt (365 Tage). Beim Import gibt es jetzt **Zusammenführen** statt nur Ersetzen: pro Eintrag gewinnt der jüngere Stand, eine Löschung gewinnt, wenn sie nach der letzten Änderung lag. Ablauf: Gerät A exportieren → auf Gerät B importieren und zusammenführen → B exportieren → auf A zusammenführen.
- **Verschlüsselte Sicherungen:** Optional mit Passphrase (PBKDF2-SHA256 mit 600 000 Runden, AES-256-GCM über WebCrypto). Falsche Passphrase und manipulierte Dateien werden erkannt.
- **Prüfungsverwaltung:** Anmeldeschluss, Anmeldestatus, Versuch (1. bis 3.), Ergebnis und Wiederholungstermin. Fristen der nächsten 14 Tage erscheinen auf „Heute“.
- **Lernplan:** Themen haben einen Aufwand (klein, mittel, groß) und bekommen entsprechend Platz. Lernfreie Wochentage pro Prüfung. Das Tagesziel wird in Minuten auf die Themen des Tages verteilt.
- **Karteikarten:** Markdown und Code-Blöcke auf Karten, Lückentext im Anki-Stil (`{{c1::Antwort::Hinweis}}`), Tags mit Filter, CSV-Import (Semikolon, Komma oder Tab; Kopfzeile wird erkannt) und CSV-Export.
- **Auswertung:** Aktivitäts-Heatmap über 20 Wochen im Wochenrückblick, Lernzeit und kumulierter Notenschnitt je Semester im Studienfortschritt.
- **App-Verknüpfungen:** Langes Drücken auf das App-Symbol bietet „Lerneinheit“, „Timer“, „Karten“ und „Notiz“ (Android, Desktop).
- **Einstellungen:** Name für die Begrüßung (vorher fest „Jonas“), Hochschule und Studiengang (vorher fest „Informatik · TUM“), helles, dunkles oder System-Farbschema.
- **Speicherstatus:** Belegter Speicher, ob der Browser die Daten dauerhaft hält, und eine Warnung, wenn die localStorage-Notfallkopie voll ist (vorher schlug das still fehl).
- Versionsanzeige am Seitenende.

### Technik
- `src/StudyOS.jsx` (2164 Zeilen) ist aufgeteilt in `lib/` (reine Logik), `ui/` (Bausteine) und `views/` (Bildschirme).
- Der Timer rendert nicht mehr die ganze App jede halbe Sekunde neu; nur Anzeige und Titel aktualisieren sich.
- Tests: 29 Unit-Tests (Vitest) für Lernalgorithmus, Lernplan, ICS, CSV, Datenformat, Sync, Verschlüsselung und Statistik; 10 End-to-End-Tests (Playwright) auf Handygröße.
- ESLint mit `no-undef` als Fehler; `npm run check` führt Lint, Unit- und E2E-Tests aus.
- Datenformat-Version 3. Ältere Sicherungen werden beim Import automatisch migriert. StudyOS 1.x lehnt Sicherungen aus 2.0 mit einer Meldung ab, statt Felder zu verlieren.

## 1.1.0
- `.flex-wrap` hatte keinen Wert und wirkte nie (18 Stellen, u. a. überlaufende Chips auf dem Handy).
- ICS-Import: `BYDAY` mit mehreren Wochentagen; Import verbraucht keine Wiederherstellungspunkte mehr.
- Timer überlebt Neuladen; Import-Schutz für neuere Datenversionen; sichere IDs; Service-Worker-Cache aus Inhalts-Hash; Umlaute.
