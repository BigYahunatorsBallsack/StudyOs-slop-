import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/* Großer Durchlauf (npm run test:durchlauf, dauert einige Minuten): alle Bereiche und wichtigen Unteransichten mit
   Beispieldaten, auf Handy- und PC-Breite, in allen Farbpaletten und in Schriftgröße „Groß“. Geprüft werden
   horizontale Überläufe, abgeschnittene Texte, überlappende Knöpfe, zu kleine Tippflächen am Handy und axe-Regeln
   (u. a. Kontrast). Bilder und Befunde landen in test-results/durchlauf (oder DURCHLAUF_DIR). */
const OUT = process.env.DURCHLAUF_DIR || 'test-results/durchlauf';
const NOW = new Date('2026-10-20T09:30:00+02:00'); // Dienstag
const STILL = `*, *::before, *::after { animation: none !important; transition: none !important; caret-color: transparent !important; }`;
const nav = (page, name) => page.getByRole('navigation', { name: 'Hauptnavigation' }).getByRole('button', { name });
const tab = (page, name) => page.getByRole('tab', { name, exact: true }).first();

const SCREENS = {
  handy: { viewport: { width: 412, height: 915 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  pc1280: { viewport: { width: 1280, height: 800 } },
  pc1440: { viewport: { width: 1440, height: 900 } },
};
const PALETTES = ['synthwave', 'gameboy', 'amber', 'cga', 'papier'];
/* alle Paletten in normaler Schrift, dazu „Groß“ in der Standardpalette und auf Papier */
const RUNS = [];
for (const s of Object.keys(SCREENS)) {
  for (const p of PALETTES) RUNS.push([s, p, 'normal']);
  for (const p of ['synthwave', 'papier']) RUNS.push([s, p, 'large']);
}
const only = process.env.DURCHLAUF_NUR; // z. B. "handy-papier" zum gezielten Nachprüfen
const MODAL = '[role=dialog]';

/* Ansichten: Name und wie man hinkommt (jeweils von der vorigen aus) */
const STEPS = [
  ['heute', async (p) => { await nav(p, 'Heute').click(); }],
  ['module', async (p) => { await nav(p, 'Module').click(); }],
  ...['Übersicht', 'Termine', 'Hausaufgaben', 'Themen', 'Lernzeit', 'Notizen', 'Karten'].map((sub, i) => [`modul-${sub.toLowerCase()}`, async (p) => {
    if (i === 0) await p.locator('.tile').first().click();
    await p.getByRole('tab', { name: new RegExp(`^${sub}`) }).first().click();
  }]),
  ...[['raster', 'Raster'], ['tag', 'Tag'], ['liste', 'Liste'], ['monat', 'Monat']].map(([k, label], i) => [`woche-${k}`, async (p) => {
    if (i === 0) await nav(p, 'Woche').click();
    await tab(p, label).click();
  }]),
  ...[['timer', 'Timer'], ['einheiten', 'Lerneinheiten'], ['karten', 'Karteikarten'], ['pruefungen', 'Prüfungen & Lernplan']].map(([k, label], i) => [`lernen-${k}`, async (p) => {
    if (i === 0) await nav(p, 'Lernen').click();
    await tab(p, label).click();
  }]),
  ['lernen-abfragen', async (p) => {
    await tab(p, 'Karteikarten').click();
    const b = p.getByRole('button', { name: 'Lernen starten' });
    if (await b.isEnabled()) { await b.click(); await p.waitForTimeout(200); const show = p.getByRole('button', { name: /Antwort zeigen|Umdrehen|Aufdecken/ }).first(); if (await show.count()) await show.click(); }
  }],
  ...[['rueckblick', 'Wochenrückblick'], ['erfolge', 'Erfolge'], ['hausaufgaben', 'Alle Hausaufgaben'], ['studium', 'Studienfortschritt'], ['neu', 'Was ist neu'], ['daten', 'Daten & Einstellungen']].map(([k, label], i) => [`mehr-${k}`, async (p) => {
    if (i === 0) { await p.keyboard.press('Escape'); await nav(p, 'Mehr').click(); }
    await tab(p, label).click();
  }]),
  ...['Darstellung & Klang', 'Benachrichtigungen', 'Studium', 'Kalender & Abos', 'Weg zur Uni', 'Cloud & Sync', 'Sicherheit', 'Sicherung & Daten', 'Papierkorb & Aufräumen', 'Zurücksetzen'].map((g) => [`einstellungen-${g.split(' ')[0].toLowerCase()}`, async (p) => {
    const t = p.locator('.settings-toggle', { hasText: new RegExp(`^${g.replace(/[&]/g, '.')}`) });
    if ((await t.getAttribute('aria-expanded')) !== 'true') await t.click();
  }]),
  ...[['abgabe', 'Neue Hausaufgabe'], ['termin', 'Neuer Termin'], ['notiz', 'Neue Notiz'], ['karte', 'Neue Karteikarte'], ['modul', 'Neues Modul'], ['pruefung', 'Neue Prüfung'], ['lernzeit', 'Lernzeit eintragen']].map(([k, cmd]) => [`formular-${k}`, async (p) => {
    while (await p.locator(MODAL).count()) { await p.keyboard.press('Escape'); await p.waitForTimeout(100); }
    await p.getByRole('button', { name: 'Suchen (Strg + K)', exact: true }).click();
    await p.getByRole('combobox', { name: 'Suchbegriff' }).fill(cmd);
    await p.getByRole('option', { name: new RegExp(cmd) }).first().click();
    await expect(p.locator(MODAL)).toBeVisible();
  }]),
  ['suche', async (p) => {
    while (await p.locator(MODAL).count()) { await p.keyboard.press('Escape'); await p.waitForTimeout(100); }
    await p.getByRole('button', { name: 'Suchen (Strg + K)', exact: true }).click();
    await p.getByRole('combobox', { name: 'Suchbegriff' }).fill('ana');
  }],
  ['schnelleingabe', async (p) => {
    while (await p.locator(MODAL).count()) { await p.keyboard.press('Escape'); await p.waitForTimeout(100); }
    await p.getByRole('button', { name: 'Schnelleingabe (E)', exact: true }).click();
    await p.keyboard.type('Blatt 4 Analysis bis Freitag 12 Uhr');
  }],
];

/* Messungen im Browser: liefert eine Liste von Befunden [Art, Element, Detail] */
function measure({ mobile }) {
  const out = [];
  /* dichte Kalender- und Heatmap-Felder: dort geht es nicht größer, dieselben Einträge gibt es als Liste */
  const DENSE = '.hm, .allday button, .ev, .grid-hw';
  const W = document.documentElement.clientWidth;
  const label = (el) => {
    const cls = typeof el.className === 'string' ? el.className.trim().split(/\s+/).slice(0, 3).join('.') : '';
    const txt = (el.getAttribute('aria-label') || el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 40);
    return `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}${cls ? '.' + cls : ''}${txt ? ` „${txt}“` : ''}`;
  };
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return false;
    const cs = getComputedStyle(el);
    return cs.visibility !== 'hidden' && cs.display !== 'none' && Number(cs.opacity) > 0.05 && !el.closest('[aria-hidden=true],[inert]');
  };
  const scroller = (el) => { for (let p = el.parentElement; p; p = p.parentElement) { const o = getComputedStyle(p).overflowX; if (o === 'auto' || o === 'scroll') return p; } return null; };
  if (document.documentElement.scrollWidth > W + 1) out.push(['seite-ueberlauf', 'html', `${document.documentElement.scrollWidth} > ${W}`]);
  const modal = document.querySelector('[role=dialog]');
  const root = modal || document.body;
  const all = [...root.querySelectorAll('*')].filter((el) => !el.closest('svg') && visible(el));
  for (const el of all) {
    const cs = getComputedStyle(el), r = el.getBoundingClientRect();
    if (cs.position !== 'fixed' && !scroller(el) && (r.right > W + 1 || r.left < -1)) {
      if (!all.includes(el.parentElement) || (() => { const pr = el.parentElement.getBoundingClientRect(); return pr.right <= W + 1 && pr.left >= -1; })()) out.push(['ragt-raus', label(el), `${Math.round(r.left)}…${Math.round(r.right)} bei ${W}`]);
    }
    const hidden = (o) => o === 'hidden' || o === 'clip';
    if (hidden(cs.overflowX) && el.scrollWidth > el.clientWidth + 1 && cs.textOverflow !== 'ellipsis' && el.textContent.trim() && el.children.length < 4 && el.clientWidth > 0) out.push(['abgeschnitten', label(el), `breit ${el.scrollWidth} > ${el.clientWidth}`]);
    if (hidden(cs.overflowY) && el.scrollHeight > el.clientHeight + 2 && cs.webkitLineClamp === 'none' && el.textContent.trim() && el.children.length < 4 && el.clientHeight > 0) out.push(['abgeschnitten-hoch', label(el), `hoch ${el.scrollHeight} > ${el.clientHeight}`]);
  }
  const hits = all.filter((el) => el.matches('button, a[href], input:not([type=hidden]), select, textarea, [role=button], [role=tab], [role=switch], [role=checkbox], summary'));
  const rects = hits.map((el) => el.getBoundingClientRect());
  /* Ebene: Knöpfe in fester/klebender Leiste (Kopf, Navigation, Dialogfuß) liegen absichtlich über dem scrollenden Inhalt */
  const layer = (el) => { for (let p = el; p; p = p.parentElement) { const pos = getComputedStyle(p).position; if (pos === 'fixed' || pos === 'sticky') return p; } return null; };
  /* Tippfläche: das Label eines Kästchens zählt mit, ebenso eine absichtlich vergrößerte Fläche (::before/::after mit position: absolute) */
  const target = (el, r) => {
    const lab = el.matches('[type=checkbox], [type=radio]') && (el.closest('label') || (el.id && document.querySelector(`label[for="${el.id}"]`)));
    if (lab) return lab.getBoundingClientRect();
    let { left, top, right, bottom } = r;
    for (const ps of ['::before', '::after']) {
      const c = getComputedStyle(el, ps);
      if (c.content === 'none' || c.position !== 'absolute') continue;
      if (getComputedStyle(el).position === 'static') return { width: 99, height: 99 }; // Fläche des umgebenden Blocks
      const px = (v) => (v.endsWith('px') ? parseFloat(v) : 0);
      left = Math.min(left, r.left + px(c.left)); top = Math.min(top, r.top + px(c.top)); right = Math.max(right, r.right - px(c.right)); bottom = Math.max(bottom, r.bottom - px(c.bottom));
    }
    return { width: right - left, height: bottom - top };
  };
  for (let i = 0; i < hits.length; i++) {
    const a = rects[i];
    if (mobile && !hits[i].closest(DENSE)) {
      const inline = hits[i].tagName === 'A' && getComputedStyle(hits[i]).display === 'inline';
      const t = target(hits[i], a);
      if (!inline && (Math.round(t.width) < 32 || Math.round(t.height) < 32)) out.push(['klein', label(hits[i]), `${Math.round(t.width)}×${Math.round(t.height)}`]);
    }
    for (let j = i + 1; j < hits.length; j++) {
      if (hits[i].contains(hits[j]) || hits[j].contains(hits[i]) || layer(hits[i]) !== layer(hits[j])) continue;
      const b = rects[j];
      const w = Math.min(a.right, b.right) - Math.max(a.left, b.left), h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
      if (w > 2 && h > 2) out.push(['ueberlappt', `${label(hits[i])} / ${label(hits[j])}`, `${Math.round(w)}×${Math.round(h)}`]);
    }
  }
  return out;
}

for (const [screen, palette, size] of RUNS) {
  const name = `${screen}-${palette}${size === 'large' ? '-gross' : ''}`;
  if (only && !name.startsWith(only)) continue;
  test.describe(name, () => {
    test.use({ ...SCREENS[screen] });
    test(`Durchlauf ${name}`, async ({ page }) => {
      test.setTimeout(240000);
      const dir = join(OUT, name);
      mkdirSync(dir, { recursive: true });
      await page.clock.setFixedTime(NOW);
      await page.route('https://tum-dev.github.io/**', (r) => r.fulfill({ json: { days: [] } }));
      await page.route('https://api.open-meteo.com/**', (r) => r.fulfill({ json: [] }));
      await page.goto('./');
      await nav(page, 'Mehr').click();
      await tab(page, 'Daten & Einstellungen').click();
      await page.locator('.settings-toggle', { hasText: /^Zurücksetzen/ }).click();
      await page.getByRole('button', { name: 'Beispieldaten laden' }).click();
      await page.getByRole('button', { name: 'Aktuelle Daten ersetzen?' }).click();
      await expect.poll(() => page.evaluate(async () => (await window.STUDYOS_ENV.load())?.modules?.length ?? 0)).toBeGreaterThan(0);
      await page.evaluate(async ([p, z]) => {
        const d = await window.STUDYOS_ENV.load(); d.settings.retroPalette = p; d.meta.lastBackup = new Date().toISOString(); await window.STUDYOS_ENV.save(d);
        localStorage.setItem('studyos-groesse', z);
      }, [palette, size]);
      await page.reload();
      await page.addStyleTag({ content: STILL });
      await page.evaluate(() => document.fonts.ready);
      const found = [];
      for (const [step, go] of STEPS) {
        try { await go(page); } catch (e) { found.push({ step, kind: 'schritt-fehler', el: '', detail: String(e.message).split('\n')[0] }); continue; }
        await page.waitForTimeout(150);
        for (const [kind, el, detail] of await page.evaluate(measure, { mobile: screen === 'handy' })) found.push({ step, kind, el, detail });
        const ax = new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']);
        if (await page.locator(MODAL).count()) ax.include(MODAL);
        for (const v of (await ax.analyze()).violations) for (const n of v.nodes.slice(0, 6)) found.push({ step, kind: `axe:${v.id}`, el: n.target.join(' '), detail: (n.any[0]?.message || n.failureSummary || '').slice(0, 160) });
        await page.evaluate(() => window.scrollTo(0, 0)); // Kopfleiste oben, nicht mitten im Bild
        await page.screenshot({ path: join(dir, `${step}.png`), fullPage: !(await page.locator(MODAL).count()) });
      }
      writeFileSync(join(dir, 'befunde.json'), JSON.stringify(found, null, 1));
      const real = found.filter((f) => f.kind !== 'abgeschnitten-hoch');
      expect(real, real.map((f) => `${f.step}: ${f.kind} ${f.el} (${f.detail})`).join('\n')).toEqual([]);
    });
  });
}
