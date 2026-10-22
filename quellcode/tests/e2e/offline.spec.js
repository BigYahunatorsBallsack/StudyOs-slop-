import { test, expect } from '@playwright/test';

/* Offline-Start aus dem Cache des Service Workers: Jede vorab geladene Datei trägt ihren Inhalts-Hash,
   damit ein Update unveränderte Dateien übernehmen kann, statt sie neu zu laden. */
test('Offline-Start: App, Schriften und spät geladene Bereiche kommen aus dem Cache', async ({ page, context }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('./');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload(); // jetzt steuert der Service Worker die Seite
  expect(await page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  const cached = await page.evaluate(async () => {
    const key = (await caches.keys()).find((k) => k.startsWith('studyos-shell-'));
    const cache = await caches.open(key);
    const out = {};
    for (const req of await cache.keys()) {
      const res = await cache.match(req);
      out[new URL(req.url).pathname] = { hash: res.headers.get('x-studyos-hash'), enc: res.headers.get('content-encoding'), size: (await res.arrayBuffer()).byteLength };
    }
    return out;
  });
  const files = Object.keys(cached);
  expect(files).toEqual(expect.arrayContaining(['/', '/index.html', '/app.js', '/style.css', '/fonts/jetbrains-mono-latin-400.woff2']));
  expect(files.some((f) => f.startsWith('/chunks/'))).toBe(true);
  for (const [f, c] of Object.entries(cached)) {
    expect(c.hash, f).toMatch(/^[0-9a-f]{16}$/);
    expect(c.enc, f).toBeNull();
    expect(c.size, f).toBeGreaterThan(0);
  }

  await context.setOffline(true);
  await page.reload();
  const nav = page.getByRole('navigation', { name: 'Hauptnavigation' });
  await expect(nav).toBeVisible();
  expect(await page.evaluate(() => getComputedStyle(document.body).fontFamily)).toContain('JetBrains Mono');
  await page.evaluate(() => document.fonts.ready);
  expect(await page.evaluate(() => document.fonts.check('16px "JetBrains Mono"'))).toBe(true);
  // ein Bereich aus einem eigenen Chunk
  await nav.getByRole('button', { name: 'Lernen' }).click();
  await expect(page.getByRole('heading', { name: 'Lernen', level: 2 })).toBeVisible();
  await context.setOffline(false);
  expect(errors).toEqual([]);
});
