// Baut dist/ aus src/: bündelt die App, kopiert das CSS und setzt den Cache-Namen des
// Service Workers aus einem Hash der ausgelieferten Dateien (damit Updates sicher ankommen).
import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, copyFileSync, mkdirSync, cpSync } from 'node:fs';

const pkg = JSON.parse(readFileSync('package.json', 'utf8'));

// 0) Statische Dateien (index.html, Icons, Manifest …) aus public/ übernehmen
cpSync('public', 'dist', { recursive: true });

// 1) JavaScript bündeln
await build({
  entryPoints: ['src/entry.jsx'], bundle: true, minify: true, format: 'iife', target: 'es2020',
  jsx: 'automatic', outfile: 'dist/app.js', legalComments: 'none',
  define: { 'process.env.NODE_ENV': '"production"', __APP_VERSION__: JSON.stringify(pkg.version) },
});

// 2) CSS: Utilities + Designsystem; Schrift für den Offline-Betrieb mitliefern
writeFileSync('dist/style.css', readFileSync('src/style.css', 'utf8') + '\n' + readFileSync('src/design.css', 'utf8'));
mkdirSync('dist/fonts', { recursive: true });
copyFileSync('node_modules/@fontsource-variable/bricolage-grotesque/files/bricolage-grotesque-latin-wght-normal.woff2', 'dist/fonts/bricolage-grotesque-latin-wght.woff2');

// 3) Service Worker mit Inhalts-Hash der Shell-Dateien
const shell = ['index.html', 'app.js', 'style.css', 'fonts/bricolage-grotesque-latin-wght.woff2', 'manifest.webmanifest', 'favicon.svg', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'apple-touch-icon.png'];
const h = createHash('sha256');
for (const f of shell) h.update(f).update(readFileSync('dist/' + f));
const hash = h.digest('hex').slice(0, 12);
writeFileSync('dist/sw.js', readFileSync('src/sw.template.js', 'utf8').replace('__HASH__', hash));
console.log(`Build fertig · v${pkg.version} · Cache studyos-shell-${hash}`);

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
