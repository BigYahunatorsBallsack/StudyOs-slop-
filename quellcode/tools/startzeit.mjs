// Misst die Startzeit von StudyOS wie auf einem Mittelklasse-Handy: Chromium mit 4-fach gedrosselter CPU,
// Pixel-7-Ansicht und einem vollen Semester (8 Module, ~380 Termine, 200 Notizen, 640 Karten, 600 Lerneinheiten).
// Gemessen werden die Zeit bis zum ersten Bild (First Contentful Paint) und bis „Heute“ mit Inhalt dasteht,
// jeweils mit warmem Service-Worker-Cache und ohne (alles frisch aus dem Netz, einmal ungedrosselt, einmal wie 4G).
//
// Aufruf (nach `node build.mjs`, Server läuft: PORT=4205 node tests/e2e/server.mjs):
//   PORT=4205 TZ=Europe/Berlin node tools/startzeit.mjs [Durchläufe]   Eigenes Chromium: PW_CHROMIUM=/pfad/chrome
// Vorher/Nachher: alten Stand bauen und auf einem zweiten Port ausliefern, dann VERGLEICH=<port> setzen.
import { chromium, devices } from '@playwright/test';

const PORT = process.env.PORT || 4173;
const URL = `http://localhost:${PORT}/`;
const RUNS = Number(process.argv[2] || 7);

export function semester() {
  const day = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toLocaleDateString('sv-SE'); };
  const names = ['Diskrete Strukturen', 'Einführung in die Informatik', 'Lineare Algebra', 'Analysis', 'Rechnerarchitektur', 'Algorithmen und Datenstrukturen', 'Theoretische Informatik', 'Datenbanken'];
  const modules = names.map((name, i) => ({ id: 'm' + i, name, ects: 6 + (i % 3), semester: 1, status: 'belegt', semesterStart: day(-56) }));
  const sessions = [], homework = [], topics = [], logs = [], notes = [], cards = [], exams = [];
  let k = 0;
  modules.forEach((m, i) => {
    for (const [type, wd, start, end] of [['Vorlesung', i % 5, '08:30', '10:00'], ['Übung', (i + 2) % 5, '12:15', '13:45'], ['Tutorium', (i + 3) % 5, '14:00', '16:00']]) {
      for (let w = -8; w < 8; w++) {
        const d = new Date(); d.setDate(d.getDate() - ((d.getDay() + 6) % 7) + wd + w * 7);
        const date = d.toLocaleDateString('sv-SE'), past = date < day(0);
        sessions.push({ id: 's' + k++, moduleId: m.id, type, date, start, end, room: 'MI HS ' + (i + 1), seriesId: `${m.id}-${type}`, cancelled: false, prepared: past, attended: past, reviewed: past && w % 3 !== 0, reviewedAt: past ? date : null });
      }
    }
    for (let h = 0; h < 14; h++) homework.push({ id: `h${i}-${h}`, moduleId: m.id, title: 'Blatt ' + (h + 1), due: day(-60 + h * 7 + i), status: h < 8 ? 'abgegeben' : 'ausgegeben', points: h < 8 ? 7 : null, maxPoints: 10 });
    for (let t = 0; t < 12; t++) topics.push({ id: `t${i}-${t}`, moduleId: m.id, title: 'Kapitel ' + (t + 1), state: ['nicht begonnen', 'gelernt', 'geübt', 'sicher'][t % 4] });
    for (let n = 0; n < 25; n++) notes.push({ id: `n${i}-${n}`, moduleId: m.id, title: `${m.name}: Vorlesung ${n + 1}`, date: day(-50 + n * 2), text: '## Abschnitt\nEin Graph ist ein Paar $G=(V,E)$.\n\n- Punkt eins\n- Punkt zwei mit **fett**\n\n```java\nint x = 1;\n```\n'.repeat(4) });
    for (let c = 0; c < 80; c++) cards.push({ id: `c${i}-${c}`, moduleId: m.id, topicId: `t${i}-${c % 12}`, front: `Frage ${c} zu ${m.name}: Was gilt für $x^${c}$?`, back: 'Eine Antwort, die länger ist als ein Wort und $\\sum_i i$ enthält.', due: day((c % 30) - 10), interval: c % 20, reps: c % 7, stability: (c % 9) + 1, difficulty: 5, lastReview: day(-(c % 20)), tags: 'tag' + (c % 5) });
    exams.push({ id: 'e' + i, moduleId: m.id, date: day(90 + i * 3), kind: 'Klausur' });
  });
  for (let l = 0; l < 600; l++) logs.push({ id: 'l' + l, moduleId: 'm' + (l % 8), date: day(-Math.floor(l / 8)), minutes: 25 + (l % 4) * 15, kind: 'Nacharbeiten' });
  return { version: 3, settings: { name: 'Test', program: 'Informatik', university: 'TUM', mensa: 'mensa-garching', weeklyGoal: 20, defaultsRev: 2 }, meta: { lastBackup: day(-1) }, modules, sessions, homework, topics, logs, notes, cards, exams, blocks: [], deleted: [] };
}

const MENSA = { days: [0, 1, 2, 3, 4, 5, 6].map((n) => { const d = new Date(); d.setDate(d.getDate() + n); return { date: d.toLocaleDateString('sv-SE'), dishes: [{ name: 'Testpasta', dish_type: 'Pasta', labels: ['VEGAN'], prices: { students: { base_price: 0, price_per_unit: 0.9, unit: '100g' } } }] }; }) };

/* läuft in der Seite: Zeitpunkt merken, an dem „Heute“ Inhalt zeigt (Lernzeit-Zeile), dazu FCP und lange Aufgaben */
const probe = () => {
  const m = window.__startzeit = { lt: 0, after: 0 };
  /* gemalt ist es nach dem nächsten Frame: requestAnimationFrame, dann eine Nachricht hinterher */
  const painted = () => requestAnimationFrame(() => { const ch = new MessageChannel(); ch.port1.onmessage = () => { m.heute = performance.now(); }; ch.port2.postMessage(0); });
  new MutationObserver(() => { if (!m.dom && document.querySelector('.minis')) { m.dom = performance.now(); painted(); } }).observe(document, { childList: true, subtree: true });
  new PerformanceObserver((l) => { for (const e of l.getEntries()) if (e.name === 'first-contentful-paint') m.fcp = e.startTime; }).observe({ type: 'paint', buffered: true });
  new PerformanceObserver((l) => { for (const e of l.getEntries()) { if (!m.heute || e.startTime < m.heute) m.lt += e.duration; else if (e.startTime < m.heute + 3000) m.after = (m.after || 0) + e.duration; } }).observe({ type: 'longtask', buffered: true });
};

async function main() {
  const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
  const data = semester();
  console.log(`Daten: ${Math.round(JSON.stringify(data).length / 1024)} KB · ${data.sessions.length} Termine · ${data.notes.length} Notizen · ${data.cards.length} Karten · ${data.logs.length} Lerneinheiten`);
  /* ein Stand je Port; mit VERGLEICH=<port> wechseln sich die Durchläufe ab (gleiche Bedingungen für beide) */
  const targets = [[`localhost:${PORT}`, URL], ...(process.env.VERGLEICH ? [[`localhost:${process.env.VERGLEICH}`, `http://localhost:${process.env.VERGLEICH}/`]] : [])];

  async function prepare(url) {
    const ctx = await browser.newContext({ ...devices['Pixel 7'], locale: 'de-DE', timezoneId: 'Europe/Berlin', serviceWorkers: 'allow' });
    /* Mensa und Wetter antworten nach 300 ms, wie ein echtes Netz */
    const slow = (body) => async (r) => { await new Promise((res) => setTimeout(res, 300)); await r.fulfill({ json: body }).catch(() => {}); };
    await ctx.route('https://tum-dev.github.io/**', slow(MENSA));
    await ctx.route('https://api.open-meteo.com/**', slow([]));
    await ctx.addInitScript(probe);
    const first = await ctx.newPage();
    await first.goto(url);
    await first.evaluate(async (d) => { await window.STUDYOS_ENV.save(d); await navigator.serviceWorker.ready; }, data);
    await first.waitForTimeout(1500);
    await first.close();
    return ctx;
  }
  async function once(ctx, url, { warm, net }) {
    const page = await ctx.newPage();
    const cdp = await ctx.newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    if (!warm) {
      await cdp.send('Network.enable');
      await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
      await cdp.send('Network.setBypassServiceWorker', { bypass: true });
      if (net) await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 40, downloadThroughput: 10e6 / 8, uploadThroughput: 5e6 / 8 });
    }
    await page.goto(url, { waitUntil: 'commit' });
    await page.waitForFunction(() => window.__startzeit && window.__startzeit.heute, null, { timeout: 60000 });
    await page.waitForTimeout(3000); /* Hauptthread in den drei Sekunden danach */
    const r = await page.evaluate(() => ({ ...window.__startzeit, js: performance.getEntriesByType('resource').filter((e) => /\.js$/.test(e.name) && e.startTime < window.__startzeit.heute).length }));
    await page.close();
    return r;
  }
  async function scenario(name, opts) {
    const ctxs = await Promise.all(targets.map(([, url]) => prepare(url)));
    const runs = targets.map(() => []);
    for (let i = 0; i < RUNS; i++) for (let t = 0; t < targets.length; t++) runs[t].push(await once(ctxs[t], targets[t][1], opts));
    await Promise.all(ctxs.map((c) => c.close()));
    targets.forEach(([label], t) => {
      const med = (k) => { const v = runs[t].map((r) => r[k] || 0).sort((a, b) => a - b); return Math.round(v[Math.floor(v.length / 2)]); };
      console.log(`${name.padEnd(26)} ${targets.length > 1 ? label + '  ' : ''}erstes Bild ${String(med('fcp')).padStart(5)} ms · Heute da ${String(med('heute')).padStart(5)} ms · lange Aufgaben davor ${String(med('lt')).padStart(4)} ms, danach ${String(med('after')).padStart(4)} ms · JS-Dateien ${med('js')}`);
    });
  }

  await scenario('warm (Service Worker)', { warm: true });
  await scenario('kalt (localhost)', { warm: false });
  await scenario('kalt (4G, 10 Mbit/40 ms)', { warm: false, net: true });
  await browser.close();
}
/* nur beim direkten Aufruf messen; semester() ist auch für andere Werkzeuge nutzbar */
if (process.argv[1] && process.argv[1].endsWith('startzeit.mjs')) await main();
