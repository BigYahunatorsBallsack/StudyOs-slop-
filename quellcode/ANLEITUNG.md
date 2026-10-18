# StudyOS online stellen und installieren

Diese Anleitung bringt die fertige StudyOS-Web-App auf eine eigene URL und als App auf dein Handy. Du brauchst dafür keinen eigenen Server. Die App ist eine statische PWA: HTML, CSS und JavaScript werden gehostet; deine Studien-Daten bleiben lokal im Browser beziehungsweise in der installierten App.

## Vor dem Start: wichtige Grenzen

- Es gibt **keine automatische Synchronisierung** zwischen Handy, Laptop oder Browsern. Du kannst aber Sicherungen zweier Geräte zusammenführen (siehe unten).
- Die App speichert Studien-Daten lokal auf dem jeweiligen Gerät. Exportiere regelmäßig unter **Mehr → Daten & Einstellungen → Als Datei herunterladen** eine JSON-Sicherung und bewahre sie zusätzlich an einem zweiten Ort auf.
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

GitHub Pages hostet nur die App-Dateien. Es synchronisiert deine Einträge nicht. Für automatische Gerätesynchronisierung wäre zusätzlich ein Backend mit Anmeldung und einer zentralen Datenbank nötig; das ist in dieser Version bewusst nicht enthalten.
