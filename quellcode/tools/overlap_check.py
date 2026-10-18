"""Sucht in allen Bildschirmen nach Elementen, die sich sichtbar überlappen (Handy und Desktop, hell)."""
import sys, json
from playwright.sync_api import sync_playwright

JS = r"""() => {
  const out = [];
  const vis = (el) => { const s = getComputedStyle(el); return s.visibility !== 'hidden' && s.display !== 'none' && +s.opacity > 0; };
  const fixed = (el) => { for (let e = el; e; e = e.parentElement) { const p = getComputedStyle(e).position; if (p === 'fixed' || p === 'sticky') return true; } return false; };
  const scrolls = (el) => { for (let e = el.parentElement; e && e !== document.body; e = e.parentElement) { const o = getComputedStyle(e).overflowX; if ((o === 'auto' || o === 'scroll') && e.scrollWidth > e.clientWidth) return e; } return null; };
  for (const parent of document.querySelectorAll('main *')) { if (parent instanceof SVGElement) continue; {
    const kids = [...parent.children].filter((k) => !(k instanceof SVGElement) && vis(k) && !fixed(k) && !['absolute'].includes(getComputedStyle(k).position));
    for (let i = 0; i < kids.length; i++) for (let j = i + 1; j < kids.length; j++) {
      const a = kids[i].getBoundingClientRect(), b = kids[j].getBoundingClientRect();
      if (!a.width || !a.height || !b.width || !b.height) continue;
      const ox = Math.min(a.right, b.right) - Math.max(a.left, b.left), oy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
      if (ox > 2 && oy > 2) out.push({ a: kids[i].className || kids[i].tagName, b: kids[j].className || kids[j].tagName, ox: Math.round(ox), oy: Math.round(oy), text: (kids[j].textContent || '').slice(0, 40) });
    }
  } }
  /* Text, der über den Rand seines Containers hinausläuft (ohne Scroll-Container, ohne truncate) */
  for (const el of document.querySelectorAll('main *')) {
    if (!vis(el) || el.children.length) continue;
    const r = el.getBoundingClientRect(), p = el.parentElement.getBoundingClientRect();
    if (r.right > p.right + 2 && !scrolls(el) && getComputedStyle(el).textOverflow !== 'ellipsis' && getComputedStyle(el.parentElement).overflow === 'visible') out.push({ overflow: el.textContent.slice(0, 40), by: Math.round(r.right - p.right) });
  }
  if (document.documentElement.scrollWidth > innerWidth + 1) out.push({ pageScroll: document.documentElement.scrollWidth - innerWidth });
  return out;
}"""

res = {}
with sync_playwright() as p:
    b = p.chromium.launch()
    for w, h in [(390, 844), (815, 900), (1280, 900)]:
        pg = b.new_page(viewport={'width': w, 'height': h}, locale='de-DE')
        pg.goto('http://localhost:8099/'); pg.wait_for_selector('nav')
        nav = lambda n: pg.get_by_role('navigation', name='Hauptnavigation').get_by_role('button', name=n).click()
        nav('Mehr'); pg.get_by_role('tab', name='Daten & Einstellungen').click()
        pg.get_by_role('button', name='Beispieldaten laden').click(); pg.get_by_role('button', name='Aktuelle Daten ersetzen?').click()
        screens = [('Heute', None), ('Module', None), ('Woche', 'Raster'), ('Woche', 'Liste'), ('Lernen', 'Timer'), ('Lernen', 'Lerneinheiten'), ('Lernen', 'Karteikarten'), ('Lernen', 'Prüfungen & Lernplan'),
                   ('Mehr', 'Wochenrückblick'), ('Mehr', 'Alle Hausaufgaben'), ('Mehr', 'Studienfortschritt'), ('Mehr', 'Daten & Einstellungen')]
        for tab, sub in screens:
            nav(tab)
            if sub: pg.get_by_role('tab', name=sub).click()
            pg.wait_for_timeout(250)
            r = pg.evaluate(JS)
            if r: res[f'{w}px {tab}/{sub or ""}'] = r
        nav('Module'); pg.locator('.tile').first.click(); pg.wait_for_timeout(250)
        for sub in ['Übersicht', 'Termine (3)', 'Hausaufgaben (1)', 'Themen (2)', 'Notizen (1)', 'Karten (3)']:
            t = pg.get_by_role('tab', name=sub)
            if t.count(): t.click(); pg.wait_for_timeout(200); r = pg.evaluate(JS); r and res.setdefault(f'{w}px Modul/{sub}', r)
        pg.close()
    b.close()
print(json.dumps(res, ensure_ascii=False, indent=1) if res else 'keine Überlappungen')
