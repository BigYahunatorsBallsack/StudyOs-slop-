# Supabase einrichten (StudyOS 2.2)

Einmalig, etwa 10 Minuten. Voraussetzung: Der Cloud-Sync aus Version 2.1 ist eingerichtet (Tabelle `studyos_sync`, Login per Code).

## 1. SQL ausführen

**SQL Editor → New query**, den kompletten Inhalt von `supabase/schema.sql` einfügen, **Run**.

Das Skript kann gefahrlos mehrfach laufen. Es legt an:

- `studyos_push`: Push-Abos deiner Geräte und die Fristen (Titel, Modulname, Datum)
- `studyos_server`: VAPID-Schlüssel und ein zufälliges Geheimnis für den Zeitplan (nur die Funktion kommt heran)
- einen Zeitplan, der alle 15 Minuten fällige Erinnerungen verschickt (`pg_cron` + `pg_net`)

Falls eine Meldung zu `pg_cron` oder `pg_net` kommt: **Database → Extensions**, beide aktivieren, Skript nochmal ausführen.

## 2. Edge Function anlegen

1. **Edge Functions → Deploy a new function → Via Editor**
2. Name: **`studyos`** (genau so, die App und der Zeitplan rufen diesen Namen auf)
3. Den Inhalt im Editor komplett durch `supabase/functions/studyos/index.ts` ersetzen
4. **Deploy function**
5. In den Einstellungen der Funktion die **JWT-Prüfung ausschalten** (Schalter „Verify JWT“ bzw. „Enforce JWT verification“). Die Funktion prüft selbst: Erinnerungen nur mit dem Geheimnis aus `studyos_server`, Kalender und Testnachricht nur für angemeldete Nutzer.

Die Funktion braucht keine eigenen Secrets. `SUPABASE_URL` und den Secret Key stellt Supabase automatisch bereit.

**Prüfen:** Im Browser `https://kjyfdijcfvvlxipwogkv.supabase.co/functions/v1/studyos?action=vapid` öffnen. Erwartet: `{"publicKey":"B…"}`. Kommt `401`, ist die JWT-Prüfung noch an.

**Updates:** Wenn sich `index.ts` in einer neuen StudyOS-Version ändert, die Funktion öffnen, Inhalt ersetzen, **Deploy updates**.

## 3. In der App

**Mehr → Daten & Einstellungen**

- **Cloud-Sync → Erinnerungen einschalten** (auf jedem Gerät, das Nachrichten bekommen soll). Danach **Testnachricht schicken**.
  - iPhone/iPad: nur in der installierten App (Safari → Teilen → Zum Home-Bildschirm), ab iOS 16.4.
- **Stundenplan-Abo:** In TUMonline unter **Terminkalender → Veröffentlichen** den iCal-Link kopieren, einfügen, **Abrufen**, Veranstaltungen zuordnen, **Abonnieren**.

## Wann kommt was?

| Frist | Erinnerung |
| --- | --- |
| Abgabe | Vorabend 18:00 und am Tag um 8:00 |
| Prüfung | 7 Tage und 1 Tag vorher, jeweils 18:00 |
| Anmeldeschluss | 3 Tage vorher 18:00 und am Tag um 8:00 |
| Wiederholungsprüfung | 7 Tage und 1 Tag vorher, jeweils 18:00 |

Uhrzeiten in deiner Zeitzone. Der Zeitplan läuft alle 15 Minuten, eine Nachricht kann also bis zu 15 Minuten später kommen. Verpasste Erinnerungen (z. B. Projekt pausiert) werden höchstens 12 Stunden später nachgeholt, danach verworfen.

## Datenschutz

- Bei Supabase liegen unverschlüsselt: E-Mail-Adresse, für Erinnerungen Titel/Modulname/Datum der Fristen, die Push-Adressen deiner Geräte und dein Kalender-Link (in den verschlüsselten Einstellungen; beim Abruf wird er an die Funktion geschickt, aber nicht gespeichert).
- Alles andere (Notizen, Noten, Lernzeiten, Karten …) bleibt Ende-zu-Ende verschlüsselt.
- Erinnerungen ausschalten auf allen Geräten = keine neuen Fristen mehr hochladen. Alte Fristen löschen: im Table Editor die Zeile in `studyos_push` löschen.

## Fehlersuche

| Meldung in der App | Ursache |
| --- | --- |
| „Die Supabase-Funktion „studyos“ ist noch nicht eingerichtet“ | Schritt 2 fehlt oder anderer Name |
| „… verlangt eine JWT-Prüfung“ | Schalter aus Schritt 2.5 |
| „Tabelle studyos_server ist leer“ | Schritt 1 erneut ausführen |
| Testnachricht kommt nicht an | Benachrichtigungen fürs Gerät/die App in den Systemeinstellungen erlaubt? Fokus-Modus? |
| Keine Erinnerungen, Test geht | **Integrations → Cron** (bzw. Database → Cron): läuft `studyos-reminders`? Unter **Edge Functions → studyos → Logs** nach Fehlern schauen |

## Karteikarten teilen (ab 2.3)

Einmal im **SQL Editor** den Inhalt von `supabase/teilen.sql` ausführen (steht auch am Ende von `schema.sql`). Mehr ist nicht nötig, die Edge Function bleibt unverändert.

- Geteilt wird ein Link der Form `…/?teilen=KENNUNG#k=SCHLÜSSEL`. Der Server speichert nur das verschlüsselte Paket; den Schlüssel hinter `#` bekommt er nie zu sehen.
- Zum Öffnen braucht die andere Person **kein** Konto, nur den Link.
- Links laufen nach 180 Tagen ab; pro Konto höchstens 200 geteilte Stapel.

## Kalender-Abo, Anhänge, Abfahrten (ab 2.4/2.5)

1. Im **SQL Editor** `supabase/kalender.sql` (Kalender-Link der Fristen) und `supabase/anhaenge.sql` (privater Speicher für verschlüsselte Anhänge) ausführen. Beides steht auch am Ende von `schema.sql`.
2. Die Edge Function **studyos** mit der aktuellen `supabase/functions/studyos/index.ts` ersetzen und deployen (neu: `?action=cal` für den Kalender-Link, `?action=mvg` für Abfahrten). Danach prüfen, dass **Enforce JWT Verification** aus ist.
