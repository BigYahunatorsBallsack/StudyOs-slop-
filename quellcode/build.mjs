// Baut dist/ aus src/: bündelt die App, kopiert das CSS und setzt den Cache-Namen des
// Service Workers aus einem Hash der ausgelieferten Dateien (damit Updates sicher ankommen).
import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, copyFileSync, mkdirSync, cpSync, readdirSync, rmSync } from 'node:fs';
import { SUPABASE_URL } from './src/lib/cloud-config.js';

const pkg = JSON.parse(readFileSync('package.json', 'utf8'));

// 0) Statische Dateien (index.html, Icons, Manifest …) aus public/ übernehmen; alte Chunks entfernen
rmSync('dist', { recursive: true, force: true });
cpSync('public', 'dist', { recursive: true });

// 0b) Content-Security-Policy: Verbindungen nur zur eigenen Seite, zu Supabase und zum Mensa-Speiseplan.
// GitHub Pages kann keine eigenen HTTP-Header setzen, darum steht die Regel als <meta> in index.html.
const connect = ["'self'", SUPABASE_URL, 'https://tum-dev.github.io'].filter(Boolean).join(' ');
const csp = [
  "default-src 'self'", "script-src 'self'", "style-src 'self' 'unsafe-inline'", "img-src 'self' blob: data:",
  "font-src 'self' data:", `connect-src ${connect}`, "worker-src 'self'", "manifest-src 'self'",
  "frame-src 'none'", "object-src 'none'", "base-uri 'self'", "form-action 'self'",
].join('; ');
writeFileSync('dist/index.html', readFileSync('dist/index.html', 'utf8').replace('__CSP__', csp));

// 1) JavaScript bündeln; selten genutzte Bereiche (Lernen, Mehr, Supabase …) als eigene Chunks
const app = await build({
  entryPoints: { app: 'src/entry.jsx' }, bundle: true, minify: true, format: 'esm', splitting: true, target: 'es2020',
  jsx: 'automatic', outdir: 'dist', chunkNames: 'chunks/[name]-[hash]', legalComments: 'none', metafile: true,
  define: { 'process.env.NODE_ENV': '"production"', __APP_VERSION__: JSON.stringify(pkg.version) },
});
const chunks = Object.keys(app.metafile.outputs).filter((f) => f.startsWith('dist/chunks/') && f.endsWith('.js')).map((f) => f.slice(5)).sort();

// 2) CSS: Utilities + Designsystem; Schrift für den Offline-Betrieb mitliefern
writeFileSync('dist/style.css', readFileSync('src/style.css', 'utf8') + '\n' + readFileSync('src/design.css', 'utf8'));
mkdirSync('dist/fonts', { recursive: true });
copyFileSync('node_modules/@fontsource-variable/bricolage-grotesque/files/bricolage-grotesque-latin-wght-normal.woff2', 'dist/fonts/bricolage-grotesque-latin-wght.woff2');

// 2b) Formeln und Code-Farben als eigene Datei, wird nur bei Bedarf geladen
await build({ entryPoints: ['src/vendor/extras.js'], bundle: true, minify: true, format: 'iife', target: 'es2020', outfile: 'dist/extras.js', legalComments: 'none' });
mkdirSync('dist/katex/fonts', { recursive: true });
copyFileSync('node_modules/katex/dist/katex.min.css', 'dist/katex/katex.min.css');
for (const f of readdirSync('node_modules/katex/dist/fonts')) if (f.endsWith('.woff2')) copyFileSync('node_modules/katex/dist/fonts/' + f, 'dist/katex/fonts/' + f);

// 3) Service Worker mit Inhalts-Hash der Shell-Dateien. Formeln und Code-Farben (extras.js, KaTeX) werden
// nicht vorab geladen, sondern beim ersten Gebrauch zwischengespeichert; der Hash deckt sie trotzdem ab.
const shell = ['index.html', 'app.js', ...chunks, 'style.css', 'fonts/bricolage-grotesque-latin-wght.woff2', 'manifest.webmanifest', 'favicon.svg', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'apple-touch-icon.png'];
const h = createHash('sha256');
for (const f of [...shell, 'extras.js', 'katex/katex.min.css']) h.update(f).update(readFileSync('dist/' + f));
const hash = h.digest('hex').slice(0, 12);
writeFileSync('dist/sw.js', readFileSync('src/sw.template.js', 'utf8').replace('__HASH__', hash).replace('__SHELL__', JSON.stringify(['./', ...shell.map((f) => './' + f)])));
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
