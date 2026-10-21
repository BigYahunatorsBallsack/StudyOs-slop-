# StudyOS online stellen und installieren

Diese Anleitung bringt die fertige StudyOS-Web-App auf eine eigene URL und als App auf dein Handy. Du brauchst dafür keinen eigenen Server. Die App ist eine statische PWA: HTML, CSS und JavaScript werden gehostet; deine Studien-Daten liegen zuerst lokal im Browser beziehungsweise in der installierten App. Wenn du möchtest, kannst du sie zusätzlich per Ende-zu-Ende-verschlüsseltem Cloud-Sync zwischen deinen Geräten abgleichen (siehe unten).

## Vor dem Start: wichtige Grenzen

- Ohne Anmeldung bleiben deine Daten nur auf dem jeweiligen Gerät. Für den automatischen Abgleich zwischen Handy, Laptop und Browsern gibt es den optionalen **Cloud-Sync** unter **Mehr → Daten & Einstellungen** (siehe unten). Alternativ kannst du Sicherungen zweier Geräte von Hand zusammenführen.
- Die **Sync-Passphrase** kann niemand wiederherstellen. Vergisst du sie, sind die Cloud-Daten verloren; die Daten auf deinen Geräten bleiben erhalten.
- Die App speichert Studien-Daten immer auch lokal auf dem jeweiligen Gerät. Der Cloud-Sync allein ist keine Sicherung: Löschst du etwas, wird das auf allen verbundenen Geräten übernommen. Exportiere regelmäßig unter **Mehr → Daten & Einstellungen → Als Datei herunterladen** eine JSON-Sicherung und bewahre sie zusätzlich an einem zweiten Ort auf.
- Die Website-Dateien sind bei GitHub Pages öffentlich erreichbar. Das ist unproblematisch, solange du keine persönlichen Daten oder Zugangsdaten in den Website-Dateien speicherst. Deine Einträge gehören nicht in das Repository.
- Lokale Wiederherstellungspunkte auf dem Gerät sind praktisch, ersetzen aber keine exportierte Sicherungsdatei.

## Variante A: kostenlos über GitHub Pages

Für die kostenlose GitHub-Free-Variante muss das Repository öffentlich sein. GitHub beschreibt das Veröffentlichen aus einem Branch in der offiziellen Anleitung: [GitHub Pages: Publishing source](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site).

### 1. Dateien entpacken

1. Entpacke das StudyOS-Paket auf deinem Computer.
2. Öffne darin den Ordner `dist`.
3. Für die Veröffentlichung brauchst du **den Inhalt** dieses Ordners: insbesondere `index.html`, `app.js`, `style.css`, `sw.js`, `manifest.webmanifest` sowie die Icons und `.nojekyll`.

### 2. Repository anlegen und Website-Dateien hochladen

1. Erstelle bei GitHub ein neues öffentliches Repository, zum Beispiel `studyos`.
2. Lade die Dateien **aus dem `dist`-Ordner** in das oberste Verzeichnis des Repositorys hoch. Wichtig: `index.html` muss direkt im Repository-Hauptverzeichnis liegen, nicht in einem zusätzlichen `dist`-Unterordner.
3. Committe die hochgeladenen Dateien.

Die App benötigt keine Build-Schritte auf GitHub: Die gebauten Dateien sind bereits im Paket enthalten.

### 3. GitHub Pages einschalten

1. Öffne im Repository **Settings → Pages**.
2. Unter **Build and deployment** wählst du als Quelle **Deploy from a branch**.
3. Wähle den Branch `main` und den Ordner `/(root)`, danach **Save**.
4. Warte, bis GitHub die Seite veröffentlicht hat. Die Projekt-URL hat normalerweise die Form `https://DEIN-GITHUB-NAME.github.io/studyos/`.

Im StudyOS-Repository selbst baut und veröffentlicht GitHub Actions die App: Dort unter **Build and deployment** als Quelle **GitHub Actions** wählen statt eines Branches (siehe README).

Falls GitHub die Beschriftungen ändert, folge der verlinkten offiziellen Anleitung. Die Veröffentlichung ist öffentlich; poste die URL daher nicht, wenn du sie nicht teilen möchtest.

### 4. Am Handy oder Computer installieren

Öffne die veröffentlichte URL zunächst einmal mit Internetverbindung.

- **Android (Chrome):** Browsermenü öffnen und **App installieren** oder **Zum Startbildschirm hinzufügen** wählen.
- **iPhone/iPad (Safari):** **Teilen → Zum Home-Bildschirm** wählen. Die genaue Bezeichnung kann je nach iOS-Version leicht abweichen.
- **Desktop (Chrome/Edge):** Das Installationssymbol in der Adressleiste verwenden, falls es angezeigt wird.

Nutze anschließend möglichst konsequent dieselbe Installationsart. Browser-Tab und installierte PWA können je nach Gerät als getrennte lokale App-Umgebungen behandelt werden. Sichere deine Daten, bevor du Browserdaten löschst, die App entfernst oder das Gerät wechselst.

### Updates veröffentlichen

Lade bei einer neuen StudyOS-Version die aktualisierten Dateien aus `dist` erneut in das oberste Verzeichnis des Repositorys hoch und committe sie. Öffne StudyOS anschließend einmal mit Internetverbindung. Die App kann ein verfügbares Update anzeigen; bestätige es, wenn du aktualisieren möchtest. Lokale Studien-Daten werden nicht mit den Website-Dateien hochgeladen.

## Variante B: lokal ausprobieren

1. Entpacke das Paket und wechsle im Terminal in den Ordner `dist`.
2. Starte einen lokalen Webserver mit:

   ```bash
   python3 -m http.server 8080
   ```

3. Öffne `http://localhost:8080` im Browser.

Für Installation und Offline-Betrieb muss die App über HTTPS oder `localhost` geöffnet werden; ein direktes Öffnen der `index.html` als `file://`-Datei reicht dafür nicht.

## Daten sichern und auf ein anderes Gerät übertragen

1. Auf dem bisherigen Gerät in StudyOS **Mehr → Daten & Einstellungen → Als Datei herunterladen** öffnen, am besten mit Passphrase verschlüsselt.
2. Die JSON-Datei sicher übertragen, zum Beispiel über einen verschlüsselten Cloud-Speicher oder ein Kabel.
3. StudyOS auf dem neuen Gerät öffnen und unter **Mehr → Daten & Einstellungen → Import** die Datei auswählen. Bei einer verschlüsselten Sicherung die Passphrase eingeben. Dann **Zusammenführen** wählen (behält, was auf dem Gerät schon vorhanden ist) oder **Daten ersetzen**.
4. Nach dem Import prüfen, ob Module, Termine, Hausaufgaben, Notizen und Lernfortschritt vorhanden sind.

Dieser Weg funktioniert immer, auch ohne Anmeldung. Wenn du deine Geräte dauerhaft abgleichen willst, ist der Cloud-Sync bequemer.

## Cloud-Sync zwischen Geräten

GitHub Pages hostet nur die App-Dateien. Den Abgleich deiner Einträge übernimmt der Cloud-Sync von StudyOS. Er speichert eine verschlüsselte Kopie deiner Daten bei Supabase.

### Einrichten auf dem ersten Gerät

1. Öffne **Mehr → Daten & Einstellungen → Cloud-Sync**.
2. Gib deine E-Mail-Adresse ein. Du bekommst einen Anmeldecode per E-Mail; ein Passwort brauchst du nicht.
3. Trage den **Code aus der E-Mail** ein.
4. Lege eine **Sync-Passphrase** fest und wiederhole sie. Sie verschlüsselt deine Daten auf dem Gerät, bevor sie es verlassen. Supabase sieht nur verschlüsselte Daten und kann sie nicht lesen. Einzige Ausnahme: Schaltest du Push-Erinnerungen an Fristen ein, liegen Titel und Datum dieser Fristen unverschlüsselt bei Supabase.

### Weitere Geräte verbinden

1. Auf dem neuen Gerät ebenfalls mit derselben E-Mail-Adresse und einem neuen Code anmelden.
2. Die Sync-Passphrase vom ersten Gerät eingeben und **Entsperren und synchronisieren** wählen.
3. Was schon auf dem neuen Gerät liegt, wird mit den Cloud-Daten **zusammengeführt**, nicht überschrieben.

Die Passphrase gibst du auf jedem Gerät nur einmal ein.

### Im Alltag

- Änderungen werden nach wenigen Sekunden automatisch hochgeladen, und die App prüft regelmäßig, ob ein anderes Gerät etwas geändert hat. Mit **Jetzt synchronisieren** stößt du den Abgleich sofort an.
- Ohne Internet arbeitest du ganz normal weiter. Die App zeigt dann „Offline, synchronisiert später“ und gleicht ab, sobald wieder Netz da ist.
- Hat ein anderes Gerät etwas überschrieben oder gelöscht, das du hier seit dem letzten Abgleich geändert hast, erscheint ein Hinweis mit **Meine behalten**.
- Unter **Cloud-Sicherung** kannst du einmal pro Woche automatisch einen verschlüsselten Schnappschuss in der Cloud speichern lassen. Die letzten 8 Wochen bleiben erhalten und lassen sich einzeln wiederherstellen.
- Der **Papierkorb** wird mit synchronisiert: Was du auf einem Gerät löschst, kannst du 30 Tage lang auch auf dem anderen wiederherstellen. Geräte mit einer älteren StudyOS-Version kennen das noch nicht; aktualisiere am besten alle Geräte.
- **Abmelden** lässt die Daten auf diesem Gerät unverändert.
- **Cloud-Daten löschen** entfernt nur die Kopie in der Cloud. Danach kannst du mit einer neuen Passphrase neu hochladen, zum Beispiel wenn du die alte vergessen hast.
- Achtung: **Alle Daten löschen** wird bei aktivem Sync auf allen Geräten wirksam.

Exportiere trotz Sync weiterhin regelmäßig eine Sicherungsdatei, denn ein versehentliches Löschen wird ebenfalls synchronisiert, und die Cloud-Sicherung hilft nur, solange du deine Sync-Passphrase kennst.

## App-Sperre mit Fingerabdruck oder Face ID

Unter **Mehr → Daten & Einstellungen → App-Sperre** kannst du die App auf diesem Gerät sperren lassen (standardmäßig aus, gilt nur für das jeweilige Gerät). Dann erscheint beim Öffnen und nach 5 Minuten im Hintergrund ein Sperrbildschirm; **Entsperren** fragt Fingerabdruck, Face ID oder die Geräte-PIN ab. Die Option erscheint nur, wenn Browser und Gerät das unterstützen.

- Das ist eine **Sichtsperre, keine Verschlüsselung**: Sie verdeckt die App vor neugierigen Blicken, die Daten selbst liegen weiter unverschlüsselt im Browser.
- Klappt das Entsperren nicht oder brichst du ab, tippst du einfach erneut auf **Entsperren**.
- **Ausschalten** geht nur im entsperrten Zustand, unter **App-Sperre → Ausschalten**.
- Löschst du den Fingerabdruck- bzw. Passkey-Eintrag im Gerät, lässt sich die App nicht mehr entsperren. Dann hilft nur, die Websitedaten von StudyOS im Browser zu löschen; ohne Cloud-Sync oder Sicherungsdatei sind die Daten damit weg.

## Aufräumen

**Mehr → Daten & Einstellungen → Aufräumen** findet doppelte Termine (gleiches Modul, Datum, Beginn und Art), doppelte Karteikarten (gleiche Vorder- und Rückseite im selben Modul), leere Notizen und verwaiste Anhänge auf diesem Gerät. **Löschen** entfernt eine ganze Gruppe; bei Doppeln bleibt jeweils der bearbeitete bzw. meistgelernte Eintrag, und Notizen zu einem doppelten Termin hängen danach am behaltenen. Gelöschte Einträge liegen im Papierkorb; verwaiste Anhänge werden endgültig gelöscht.
