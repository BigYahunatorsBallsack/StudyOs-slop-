# Änderungen

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
