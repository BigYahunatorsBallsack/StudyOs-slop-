import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { RETRO_PALETTES, retroPaletteOf } from '../../src/app/useTheme.js';

/* Farbpaletten: „Papier“ ist wählbar und setzt jeden Farb-Token der Standardpalette; alle Textfarben ≥ 4,5:1 (WCAG AA) */
const css = readFileSync(new URL('../../src/retro.css', import.meta.url), 'utf8');
const block = (sel) => css.slice(css.indexOf(sel + ' {')).split('\n}')[0];
const tokens = (b) => Object.fromEntries([...b.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
const lum = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return [n >> 16, (n >> 8) & 255, n & 255].map((c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }).reduce((a, c, i) => a + c * [0.2126, 0.7152, 0.0722][i], 0);
};
const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };

describe('Palette Papier', () => {
  const base = tokens(block(':root[data-theme="retro"]'));
  const p = tokens(block(':root[data-theme="retro"][data-palette="papier"]'));

  it('ist wählbar und hat helle Browser-Leiste', () => {
    expect(retroPaletteOf('papier')).toBe('papier');
    expect(RETRO_PALETTES.find(([k]) => k === 'papier')?.[2]).toBe(p['--bg']);
  });

  it('setzt alle Farb-Tokens der Standardpalette', () => {
    const colors = Object.keys(base).filter((k) => !/^--(font|r-)/.test(k));
    expect(colors.filter((k) => !(k in p))).toEqual([]);
  });

  it('Text auf allen Flächen mindestens 4,5:1', () => {
    for (const fg of ['--text', '--text-2', '--muted', '--faint', '--accent', '--accent-text', '--accent-2', '--warn', '--warn-text', '--danger', '--danger-text', '--ok', '--ok-text']) {
      for (const bg of ['--bg', '--surface', '--surface-2']) expect(ratio(p[fg], p[bg]), `${fg} auf ${bg}`).toBeGreaterThanOrEqual(4.5);
    }
    expect(ratio(p['--on-accent'], p['--accent'])).toBeGreaterThanOrEqual(4.5);
    expect(ratio(p['--on-ink'], p['--ink'])).toBeGreaterThanOrEqual(4.5);
    // gedrückte Schritt-Knöpfe: Hintergrund in der Signalfarbe, Schrift in --bg
    for (const step of ['--warn', '--accent-2', '--ok']) expect(ratio(p['--bg'], p[step]), step).toBeGreaterThanOrEqual(4.5);
  });
});
