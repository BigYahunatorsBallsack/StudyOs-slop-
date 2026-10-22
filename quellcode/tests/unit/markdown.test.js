import { describe, expect, test } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Markdown } from '../../src/ui/markdown.jsx';
import { PlaceLinks } from '../../src/ui/links.jsx';

/* Notizen und Karten kommen auch aus geteilten Stapeln, Importen und dem Sync: nichts davon darf als HTML oder Skript wirken */
const html = (text) => renderToStaticMarkup(React.createElement(Markdown, { text }));

describe('Markdown ist gegen HTML-Injection sicher', () => {
  test('rohes HTML bleibt Text', () => {
    const out = html('<img src=x onerror=alert(1)> <script>alert(2)</script>\n# <b>Titel</b>\n- <iframe src="javascript:alert(3)">');
    expect(out).not.toMatch(/<img|<script|<iframe|<b>/i);
    expect(out).toContain('&lt;img src=x onerror=alert(1)&gt;');
  });
  test('nur http(s)-Links werden zu Links', () => {
    expect(html('[klick](javascript:alert(1))')).not.toContain('<a');
    expect(html('[klick](data:text/html,<script>alert(1)</script>)')).not.toContain('<a');
    expect(html('[klick](vbscript:msgbox)')).not.toContain('<a');
    const ok = html('[TUM](https://www.tum.de/a?b=1&c="x")');
    expect(ok).toContain('<a href="https://www.tum.de/a?b=1&amp;c=&quot;x&quot;" target="_blank" rel="noopener noreferrer">TUM</a>');
  });
  test('Anführungszeichen im Link brechen nicht aus dem Attribut aus', () => {
    const out = html('[x](https://a.de/"onmouseover="alert(1))');
    expect(out).not.toMatch(/\sonmouseover=/i);
  });
  test('Formeln und Code ohne geladene Darstellung als Text', () => {
    const out = html('$<img src=x onerror=alert(1)>$\n```\n<script>alert(1)</script>\n```');
    expect(out).not.toMatch(/<img|<script/i);
  });
  test('Bild-Anhang nur mit harmloser Kennung', () => {
    expect(html('![a](att:abc-123)')).toContain('md-img-missing');
    expect(html('![a](att:"onerror=alert(1))')).not.toContain('md-img');
  });
});

describe('mit geladener Formel- und Code-Darstellung', () => {
  test('KaTeX ohne \\href und \\url, highlight.js maskiert', async () => {
    globalThis.window = { dispatchEvent() {} };
    try {
      await import('../../src/vendor/extras.js');
      const out = html('$\\href{javascript:alert(1)}{x}$ und $\\url{javascript:alert(2)}$\n$$\\htmlId{a}{b}$$\n```js\n</code><img src=x onerror=alert(3)>\n```');
      expect(out).toContain('katex');
      expect(out).toContain('hljs');
      expect(out).not.toMatch(/href="javascript|<img|\sid="a"/i);
    } finally { delete globalThis.window; }
  });
});

describe('Aufzeichnungs-Link', () => {
  const links = (live) => renderToStaticMarkup(React.createElement(PlaceLinks, { room: '', live }));
  test('nur Web-Links werden verlinkt', () => {
    expect(links('javascript:alert(1)')).toBe('');
    expect(links('data:text/html,x')).toBe('');
    expect(links('https://live.rbg.tum.de/w/x')).toContain('href="https://live.rbg.tum.de/w/x"');
  });
});
