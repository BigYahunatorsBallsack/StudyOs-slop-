// Baut dist/ aus src/: bündelt die App, kopiert das CSS und setzt den Cache-Namen des
// Service Workers aus einem Hash der ausgelieferten Dateien (damit Updates sicher ankommen).
import { build, transform } from 'esbuild';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, copyFileSync, mkdirSync, cpSync, readdirSync, rmSync } from 'node:fs';
import { SUPABASE_URL } from './src/lib/cloud-config.js';
import { parseChangelog } from './src/lib/whatsnew.js';

const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
// „Was ist neu“: nur die fett gedruckten Überschriften der jüngsten Abschnitte aus CHANGELOG.md
const whatsNew = parseChangelog(readFileSync('CHANGELOG.md', 'utf8'));

// 0) Statische Dateien (index.html, Icons, Manifest …) aus public/ übernehmen; alte Chunks entfernen
rmSync('dist', { recursive: true, force: true });
cpSync('public', 'dist', { recursive: true });

// 0b) Content-Security-Policy: Verbindungen nur zur eigenen Seite, zu Supabase, zum Mensa-Speiseplan und zum Wetter (Open-Meteo).
// GitHub Pages kann keine eigenen HTTP-Header setzen, darum steht die Regel als <meta> in index.html.
const connect = ["'self'", SUPABASE_URL, 'https://tum-dev.github.io', 'https://api.open-meteo.com'].filter(Boolean).join(' ');
const csp = [
  "default-src 'self'", "script-src 'self'", "style-src 'self' 'unsafe-inline'", "img-src 'self' blob: data:",
  "font-src 'self' data:", `connect-src ${connect}`, "worker-src 'self'", "manifest-src 'self'",
  "frame-src 'none'", "object-src 'none'", "base-uri 'self'", "form-action 'self'",
].join('; ');

// 1) JavaScript bündeln; selten genutzte Bereiche (Lernen, Mehr, Supabase …) als eigene Chunks
const app = await build({
  entryPoints: { app: 'src/entry.jsx' }, bundle: true, minify: true, format: 'esm', splitting: true, target: 'es2020',
  jsx: 'automatic', outdir: 'dist', chunkNames: 'chunks/[name]-[hash]', legalComments: 'none', metafile: true,
  define: { 'process.env.NODE_ENV': '"production"', __APP_VERSION__: JSON.stringify(pkg.version), __WHATS_NEW__: JSON.stringify(whatsNew) },
});
const chunks = Object.keys(app.metafile.outputs).filter((f) => f.startsWith('dist/chunks/') && f.endsWith('.js')).map((f) => f.slice(5)).sort();

// 1b) Chunks, die app.js beim Start fest importiert, gleich mit index.html anfordern (modulepreload):
// Sonst fragt der Browser sie erst an, wenn app.js ganz geladen und gelesen ist.
const startChunks = new Set();
const walk = (f) => { for (const i of app.metafile.outputs[f].imports) if (i.kind === 'import-statement' && !startChunks.has(i.path)) { startChunks.add(i.path); walk(i.path); } };
walk('dist/app.js');
const preloads = [...startChunks].sort().map((f) => `<link rel="modulepreload" href="./${f.slice(5)}">`).join('\n  ');
writeFileSync('dist/index.html', readFileSync('dist/index.html', 'utf8').replace('__CSP__', csp).replace('<!--MODULEPRELOAD-->', preloads));

// 2) CSS: Utilities + Designsystem; Schrift für den Offline-Betrieb mitliefern
// Farbschema „Retro“ (src/retro.css) kommt danach. Es ist das einzige Farbschema: index.html lädt seine Pixel-Schriften
// vorab, der Service Worker hält sie offline bereit. Bricolage (design.css) braucht Retro nicht, sie bleibt nur als Datei dabei.
// Minifiziert (ohne Kommentare und Leerraum): style.css blockiert das erste Bild, gzip 36 → 28 KB.
const css = ['src/style.css', 'src/design.css', 'src/retro.css'].map((f) => readFileSync(f, 'utf8')).join('\n');
writeFileSync('dist/style.css', (await transform(css, { loader: 'css', minify: true, legalComments: 'none' })).code);
mkdirSync('dist/fonts', { recursive: true });
copyFileSync('node_modules/@fontsource-variable/bricolage-grotesque/files/bricolage-grotesque-latin-wght-normal.woff2', 'dist/fonts/bricolage-grotesque-latin-wght.woff2');
for (const [pkg, file] of [['silkscreen', 'silkscreen-latin-400'], ['silkscreen', 'silkscreen-latin-700'], ['jetbrains-mono', 'jetbrains-mono-latin-400'], ['jetbrains-mono', 'jetbrains-mono-latin-700'], ['vt323', 'vt323-latin-400']]) {
  copyFileSync(`node_modules/@fontsource/${pkg}/files/${file}-normal.woff2`, `dist/fonts/${file}.woff2`);
}

// 2b) Formeln und Code-Farben als eigene Datei, wird nur bei Bedarf geladen
await build({ entryPoints: ['src/vendor/extras.js'], bundle: true, minify: true, format: 'iife', target: 'es2020', outfile: 'dist/extras.js', legalComments: 'none' });
mkdirSync('dist/katex/fonts', { recursive: true });
copyFileSync('node_modules/katex/dist/katex.min.css', 'dist/katex/katex.min.css');
for (const f of readdirSync('node_modules/katex/dist/fonts')) if (f.endsWith('.woff2')) copyFileSync('node_modules/katex/dist/fonts/' + f, 'dist/katex/fonts/' + f);

// 3) Service Worker mit Inhalts-Hash der Shell-Dateien. Formeln und Code-Farben (extras.js, KaTeX) werden
// nicht vorab geladen, sondern beim ersten Gebrauch zwischengespeichert; der Hash deckt sie trotzdem ab.
const fonts = ['silkscreen-latin-400', 'silkscreen-latin-700', 'jetbrains-mono-latin-400', 'jetbrains-mono-latin-700', 'vt323-latin-400'].map((f) => `fonts/${f}.woff2`);
const shell = ['index.html', 'app.js', ...chunks, 'style.css', ...fonts, 'manifest.webmanifest', 'favicon.svg', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'apple-touch-icon.png'];
const h = createHash('sha256');
for (const f of [...shell, 'extras.js', 'katex/katex.min.css']) h.update(f).update(readFileSync('dist/' + f));
const hash = h.digest('hex').slice(0, 12);
// Jede Shell-Datei mit eigenem Inhalts-Hash: Der Service Worker übernimmt bei einem Update unveränderte Dateien aus dem alten Cache
const fileHash = (f) => createHash('sha256').update(readFileSync('dist/' + f)).digest('hex').slice(0, 16);
const shellList = [['./', fileHash('index.html')], ...shell.map((f) => ['./' + f, fileHash(f)])];
writeFileSync('dist/sw.js', readFileSync('src/sw.template.js', 'utf8').replace('__HASH__', hash).replace('__SHELL__', JSON.stringify(shellList)));
console.log(`Build fertig · v${pkg.version} · ${chunks.length} Chunks · Cache studyos-shell-${hash}`);

// 4) Supabase Edge Function als eine Datei (zum Einfügen im Dashboard oder für `supabase functions deploy`)
const fn = await build({
  entryPoints: ['src/server/deno-entry.js'], bundle: true, format: 'esm', target: 'es2022', platform: 'neutral', write: false, legalComments: 'none',
});
mkdirSync('supabase/functions/studyos', { recursive: true });
writeFileSync('supabase/functions/studyos/index.ts', `// StudyOS Edge Function – automatisch erzeugt aus src/server/ (npm run build). Nicht von Hand ändern.
// Einrichtung: siehe supabase/EINRICHTUNG.md
// @ts-nocheck
${fn.outputFiles[0].text}`);
console.log('Edge Function gebaut: supabase/functions/studyos/index.ts');
