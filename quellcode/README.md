# StudyOS – persönlicher Studienplaner

StudyOS ist eine private, offlinefähige Progressive Web App fürs Studium. Alle Einträge liegen lokal im Browser bzw. in der installierten App. Zwischen Geräten wird über einen optionalen, Ende-zu-Ende-verschlüsselten Cloud-Sync (Supabase) oder über exportierte Sicherungen abgeglichen.

## Inhalt

| Pfad | Zweck |
| --- | --- |
| `dist/` | Fertige Website/PWA zum Hosten (wird von `npm run build` erzeugt, nicht im Repository) |
| `src/App.jsx` | App-Rahmen: Navigation, Aktionen, Dialoge |
| `src/app/` | Hooks der App: Laden/Speichern, Farbschema, Timer, Kalender-Abos |
| `src/lib/` | Reine Logik ohne UI: Datenformat, Lernplan, Karteikarten, ICS, Sync, Verschlüsselung, Statistik |
| `src/ui/` | Wiederverwendbare Bausteine (Karten, Formulare, Markdown, Timer-Anzeige) |
| `src/views/` | Bildschirme: Heute, Module, Woche, Lernen, Mehr, Daten |
| `src/cloud/` | Cloud-Sync: Supabase-Anbindung, Test-Backend, React-Hook |
| `src/server/` | Quellcode der Supabase Edge Function (Erinnerungen, Kalender-Abruf, MVG) |
| `supabase/schema.sql` | Tabellen, Zugriffsregeln und Zeitplan |
| `supabase/functions/studyos/index.ts` | Gebaute Edge Function zum Einfügen im Dashboard |
| `supabase/EINRICHTUNG.md` | Einrichtung von Erinnerungen und Stundenplan-Abo |
| `src/design.css` | Designsystem (Tokens, Komponenten, hell/dunkel) |
| `src/retro.css` | Farbschema „Retro“ (nur unter `data-theme="retro"`, eigene Schriften) samt Animationsstilen Arcade/Röhre/Glitch (`data-fx`); Grafiken aus `tools/retro_skyline.py` |
| `src/runtime.js` | Lokale Speicherung (IndexedDB + Notfallkopie), Wiederherstellungspunkte, PWA |
| `src/style.css` | Utility-Klassen (Farben über Tokens) |
| `tests/unit/` | Unit-Tests (Vitest) für `src/lib/` |
| `tests/e2e/` | End-to-End-Tests (Playwright) gegen `dist/`, inkl. Barrierefreiheit (axe) |
| `tests/visual/` | Screenshot-Vergleich (Playwright-Projekt „bilder“) mit Referenzbildern |
| `tsconfig.json` | Nur Typprüfung (`npm run typecheck`) für `src/lib/` und `src/server/` |
| `ANLEITUNG.md` | Hosting, Installation, Datensicherung |
| `CHANGELOG.md` | Änderungen je Version |

## Entwickeln

Voraussetzung: Node.js 20 oder neuer.

```bash
npm install
npx playwright install chromium   # einmalig, für die E2E-Tests
npm run build                     # baut dist/
npm run serve                     # http://localhost:8080
npm run check                     # Lint (ohne Warnungen), Typen, Unit-Tests, Funktions-Test (Deno), E2E-Tests
npm run test:visual               # Screenshot-Vergleich; neue Referenzbilder: npm run test:visual -- --update-snapshots
```

**Veröffentlichen:** Im GitHub-Repository liegt dieser Ordner unter `quellcode/`. Bei jedem Push auf `main`, der `quellcode/` ändert, läuft `.github/workflows/studyos.yml`: erst alle Prüfungen (Audit, Lint, Typen, Unit, Deno, CSS, E2E), dann `npm run build` und ein Deployment von `dist/` auf GitHub Pages. Dafür muss unter **Settings → Pages → Source** „GitHub Actions“ gewählt sein. Schlägt ein Test fehl, bleibt die Seite unverändert. Der Screenshot-Vergleich läuft mit, blockiert aber nicht; bei Abweichungen liegen die Bilder im Artefakt „screenshot-abweichungen“. Dependabot schlägt wöchentlich Updates vor.

`build.mjs` kopiert `public/` (index.html, Icons, Manifest) nach `dist/`, setzt die Content-Security-Policy, bündelt `src/` zu `dist/app.js` plus Chunks in `dist/chunks/` (selten genutzte Bereiche und Supabase werden erst bei Bedarf geladen), kopiert das CSS und berechnet den Cache-Namen des Service Workers aus den Dateiinhalten. Dadurch kommen Updates sicher bei installierten Apps an.

**Styling:** Komponenten-Klassen (`.row`, `.hero`, `.btn`, …) und alle Farben als Tokens stehen in `src/design.css`. `src/style.css` enthält Utility-Klassen ohne Tailwind; eine neue Utility im JSX braucht eine Regel. `python3 tools/css_check.py .` findet fehlende.

## Cloud-Sync (Supabase)

Die Verbindung steht in `src/lib/cloud-config.js` (Projekt-URL und Publishable Key, beides öffentlich). Einrichtung im Supabase-Dashboard:

1. **SQL Editor:** `supabase/schema.sql` ausführen.
2. **Authentication → URL Configuration:** Site URL und Redirect URL = Adresse der App (mit Schrägstrich am Ende).
3. **Authentication → E-Mail-Vorlagen → Magic Link:** `{{ .Token }}` in die Vorlage einfügen, damit die Mail den Code enthält.
4. Für Erinnerungen und Stundenplan-Abo: siehe `supabase/EINRICHTUNG.md`.

In der App: **Mehr → Daten & Einstellungen → Cloud-Sync** → E-Mail → Code → Sync-Passphrase. Auf jedem weiteren Gerät dieselbe E-Mail und Passphrase.

Pro Eintrag gewinnt der zuletzt geänderte Stand, Löschungen werden übertragen. Gleichzeitige Änderungen am **selben** Eintrag werden nicht feldweise gemischt; wird dabei etwas überschrieben, das du auf diesem Gerät seit dem letzten Abgleich geändert hast, zeigt die App einen Hinweis mit **Meine behalten**. Das klappt auch direkt nach dem Neuladen: Die Zeitstempel des letzten Abgleichs merkt sich das Gerät (nur Zeitstempel, keine Inhalte; beim Abmelden gelöscht). Die Zeitstempel kommen von der Geräteuhr. Zusätzlich legt die App einmal pro Woche eine verschlüsselte Cloud-Sicherung an (die letzten 8 Wochen).

## Zwei Geräte ohne Cloud

1. Gerät A: **Mehr → Daten & Einstellungen → Als Datei herunterladen** (am besten verschlüsselt).
2. Gerät B: Datei importieren und **Zusammenführen** wählen.
3. Danach umgekehrt: B exportieren, auf A zusammenführen.

## Speicherung und Datenschutz

- Automatisches Speichern lokal auf dem Gerät (IndexedDB, dazu eine Notfallkopie in localStorage).
- Exportiere regelmäßig eine Sicherung und bewahre sie an einem zweiten Ort auf. Lokale Wiederherstellungspunkte ersetzen keine Datei.
- Verschlüsselte Sicherungen: PBKDF2-SHA256 (600 000 Runden) und AES-256-GCM. Ohne Passphrase sind sie nicht wiederherstellbar.
- Die Website-Dateien enthalten keine persönlichen Einträge. Bei GitHub Pages ist die Website öffentlich erreichbar.
- Eine Content-Security-Policy in `index.html` erlaubt Verbindungen nur zur eigenen Seite, zu Supabase und zum Mensa-Speiseplan (GitHub Pages kann keine eigenen HTTP-Header setzen).

## Hilfsskripte (Python 3)

- `python3 tools/overlap_check.py [Farbschema]` sucht überlappende Elemente in allen Bildschirmen (App unter http://localhost:8099, z. B. `python3 -m http.server 8099 --directory dist`).
- `python3 tools/retro_skyline.py` erzeugt Skyline und Sonne des Retro-Themes.
- `python3 tools/css_check.py .` listet Utility-Klassen aus dem JSX, für die `src/style.css` keine Regel hat.
- `python3 tools/tokens_css.py src/style.css` stellt Farb-Utilities (`bg-slate-900`, `text-sky-300` …) auf Design-Tokens um. Nach neuen Farb-Utilities ausführen.
