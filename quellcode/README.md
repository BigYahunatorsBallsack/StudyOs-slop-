# StudyOS – persönlicher Studienplaner

StudyOS ist eine private, offlinefähige Progressive Web App fürs Studium. Sie hat keinen Server: Alle Einträge bleiben lokal im Browser bzw. in der installierten App. Zwischen Geräten werden Sicherungen exportiert und zusammengeführt.

## Inhalt

| Pfad | Zweck |
| --- | --- |
| `dist/` | Fertige Website/PWA zum Hosten (Inhalt dieses Ordners hochladen) |
| `src/App.jsx` | App-Rahmen: Zustand, Speichern, Navigation, Timer |
| `src/lib/` | Reine Logik ohne UI: Datenformat, Lernplan, Karteikarten, ICS, Sync, Verschlüsselung, Statistik |
| `src/ui/` | Wiederverwendbare Bausteine (Karten, Formulare, Markdown, Timer-Anzeige) |
| `src/views/` | Bildschirme: Heute, Module, Woche, Lernen, Mehr, Daten |
| `src/cloud/` | Cloud-Sync: Supabase-Anbindung, Test-Backend, React-Hook |
| `src/server/` | Quellcode der Supabase Edge Function (Erinnerungen, Kalender-Abruf) |
| `supabase/schema.sql` | Tabellen, Zugriffsregeln und Zeitplan |
| `supabase/functions/studyos/index.ts` | Gebaute Edge Function zum Einfügen im Dashboard |
| `supabase/EINRICHTUNG.md` | Einrichtung von Erinnerungen und Stundenplan-Abo |
| `src/design.css` | Designsystem (Tokens, Komponenten, hell/dunkel) |
| `src/runtime.js` | Lokale Speicherung (IndexedDB + Notfallkopie), Wiederherstellungspunkte, PWA |
| `src/style.css` | Utility-Klassen (Farben über Tokens) |
| `tests/unit/` | Unit-Tests (Vitest) für `src/lib/` |
| `tests/e2e/` | End-to-End-Tests (Playwright) gegen `dist/` |
| `ANLEITUNG.md` | Hosting, Installation, Datensicherung |
| `CHANGELOG.md` | Änderungen je Version |

## Entwickeln

Voraussetzung: Node.js 20 oder neuer.

```bash
npm install
npx playwright install chromium   # einmalig, für die E2E-Tests
npm run build                     # baut dist/
npm run serve                     # http://localhost:8080
npm run check                     # Lint, Unit-Tests, Funktions-Test (Deno), E2E-Tests
```

**Veröffentlichen:** Im GitHub-Repository liegt dieser Ordner unter `quellcode/`, die gebaute App im Wurzelverzeichnis (dort liest GitHub Pages). Bei jedem Push auf `main`, der `quellcode/` ändert, läuft `.github/workflows/studyos.yml`: erst alle Prüfungen, dann `npm run build` und ein Commit der neuen Dateien ins Wurzelverzeichnis. Schlägt ein Test fehl, bleibt die Seite unverändert.

`build.mjs` bündelt `src/` zu `dist/app.js`, kopiert das CSS und berechnet den Cache-Namen des Service Workers aus den Dateiinhalten. Dadurch kommen Updates sicher bei installierten Apps an.

**Styling:** Komponenten-Klassen (`.row`, `.hero`, `.btn`, …) und alle Farben als Tokens stehen in `src/design.css`. `src/style.css` enthält Utility-Klassen ohne Tailwind; eine neue Utility im JSX braucht eine Regel. `python3 tools/css_check.py .` findet fehlende.

## Cloud-Sync (Supabase)

Die Verbindung steht in `src/lib/cloud-config.js` (Projekt-URL und Publishable Key, beides öffentlich). Einrichtung im Supabase-Dashboard:

1. **SQL Editor:** `supabase/schema.sql` ausführen.
2. **Authentication → URL Configuration:** Site URL und Redirect URL = Adresse der App (mit Schrägstrich am Ende).
3. **Authentication → E-Mail-Vorlagen → Magic Link:** `{{ .Token }}` in die Vorlage einfügen, damit die Mail den Code enthält.
4. Für Erinnerungen und Stundenplan-Abo: siehe `supabase/EINRICHTUNG.md`.

In der App: **Mehr → Daten & Einstellungen → Cloud-Sync** → E-Mail → Code → Sync-Passphrase. Auf jedem weiteren Gerät dieselbe E-Mail und Passphrase.

Pro Eintrag gewinnt der zuletzt geänderte Stand, Löschungen werden übertragen. Gleichzeitige Änderungen am **selben** Eintrag werden nicht feldweise gemischt. Die Zeitstempel kommen von der Geräteuhr.

## Zwei Geräte ohne Cloud

1. Gerät A: **Mehr → Daten & Einstellungen → Als Datei herunterladen** (am besten verschlüsselt).
2. Gerät B: Datei importieren und **Zusammenführen** wählen.
3. Danach umgekehrt: B exportieren, auf A zusammenführen.

## Speicherung und Datenschutz

- Automatisches Speichern lokal auf dem Gerät (IndexedDB, dazu eine Notfallkopie in localStorage).
- Exportiere regelmäßig eine Sicherung und bewahre sie an einem zweiten Ort auf. Lokale Wiederherstellungspunkte ersetzen keine Datei.
- Verschlüsselte Sicherungen: PBKDF2-SHA256 (600 000 Runden) und AES-256-GCM. Ohne Passphrase sind sie nicht wiederherstellbar.
- Die Website-Dateien enthalten keine persönlichen Einträge. Bei GitHub Pages ist die Website öffentlich erreichbar.
- `dist/_headers` (Sicherheits-Header) wirkt nur auf Netlify und Cloudflare Pages, nicht auf GitHub Pages.

## Hilfsskripte (Python 3)

- `python3 tools/css_check.py .` listet Utility-Klassen aus dem JSX, für die `src/style.css` keine Regel hat.
- `python3 tools/tokens_css.py src/style.css` stellt Farb-Utilities (`bg-slate-900`, `text-sky-300` …) auf Design-Tokens um. Nach neuen Farb-Utilities ausführen.
