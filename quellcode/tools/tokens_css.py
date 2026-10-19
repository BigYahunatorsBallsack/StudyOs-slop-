"""Stellt die Farb-Utilities in src/style.css auf Design-Tokens (CSS-Variablen) um.

Die Basisregeln (z. B. .bg-slate-900) bleiben stehen; am Ende von style.css wird ein generierter Block
angehängt, der dieselben Selektoren mit var(--…) überschreibt. Hell und Dunkel unterscheiden sich danach
nur noch in den Variablen (src/design.css). Idempotent: ersetzt den eigenen Block bei jedem Lauf.

Aufruf: python3 tools/tokens_css.py src/style.css"""
import re, sys

path = sys.argv[1]
css = open(path, encoding='utf-8').read()
for marker in ('\n/* === StudyOS 2.0', '\n/* === StudyOS Tokens'):
    css = css.split(marker)[0]
MARK = '/* === StudyOS Tokens: generiert von tools/tokens_css.py, nicht von Hand ändern === */'

# Zusätzliche Utilities, die im Basis-CSS fehlen
EXTRA = {
    'bg-emerald-500\\/15': 'background-color:rgba(16,185,129,.15)', 'bg-rose-500\\/20': 'background-color:rgba(244,63,94,.2)',
    'border-rose-500\\/30': 'border-color:rgba(244,63,94,.3)', 'border-sky-500\\/60': 'border-color:rgba(14,165,233,.6)',
    'text-emerald-200': 'color:#a7f3d0', 'text-rose-100\\/90': 'color:rgba(255,228,230,.9)',
    'gap-\\[3px\\]': 'gap:3px', 'h-\\[11px\\]': 'height:11px', 'w-\\[11px\\]': 'width:11px', 'h-\\[13px\\]': 'height:13px',
    'leading-\\[11px\\]': 'line-height:11px', 'leading-\\[13px\\]': 'line-height:13px', 'rounded-\\[2px\\]': 'border-radius:2px',
    'text-\\[9px\\]': 'font-size:9px', 'inline-flex': 'display:inline-flex', 'items-baseline': 'align-items:baseline',
    'mr-1': 'margin-right:.25rem', 'mt-10': 'margin-top:2.5rem', 'pt-4': 'padding-top:1rem',
    'pointer-events-none': 'pointer-events:none', 'tracking-widest': 'letter-spacing:.1em',
    'divide-slate-800 > :not([hidden]) ~ :not([hidden])': 'border-color:#1e293b',
}
extra_rules = [f'.{sel}{{{decl}}}' for sel, decl in EXTRA.items() if f'.{sel.split(" ")[0]}{{' not in css and f'.{sel.split(" ")[0]} ' not in css]

# Zuordnung Tailwind-Farbe → Token
ROLE = {'sky': 'accent', 'amber': 'warn', 'rose': 'danger', 'emerald': 'ok'}


def mix(var, alpha):
    return f'var(--{var})' if alpha is None else f'color-mix(in srgb, var(--{var}) {int(alpha)}%, transparent)'


def token(kind, fam, shade, alpha):
    if fam == 'slate':
        if kind == 'bg':
            v = {950: 'bg', 900: 'surface', 800: 'surface-2', 700: 'surface-3', 600: 'surface-3', 200: 'text-2', 100: 'ink', 50: 'ink'}.get(shade)
        elif kind in ('text', 'placeholder'):
            v = {50: 'text', 100: 'text', 200: 'text', 300: 'text-2', 400: 'muted', 500: 'faint', 600: 'faint', 700: 'faint', 900: 'on-ink', 950: 'on-ink'}.get(shade)
        elif kind in ('border', 'divide'):
            v = 'line-strong' if shade <= 700 else 'line'
            return f'var(--{v})' if alpha is None else mix(v, alpha)
        elif kind == 'ring-offset':
            v = 'surface'
        else:
            v = None
        return mix(v, alpha) if v else None
    role = ROLE.get(fam)
    if not role:
        return None
    if kind == 'text':
        return mix(f'{role}-text', alpha) if shade <= 300 else mix(f'{role}-strong', alpha)
    if kind == 'bg':
        if shade in (400, 500, 600) and alpha is None:
            return f'var(--{role})'
        return mix(role, alpha if alpha is not None else 100)
    if kind in ('border', 'ring', 'divide', 'accent'):
        return mix(role, alpha)
    return None


rule = re.compile(r'(?<![\w\\-])\.((?:[a-z-]+\\:)*)(bg|text|border|ring|ring-offset|divide|placeholder|accent)-(slate|sky|amber|rose|emerald)-(\d+)(?:\\/(\d+))?((?::[a-z-]+)*(?:\s*>[^{]*)?)\{([^}]*)\}')
out_rules, seen = [], set()
for m in rule.finditer(css + '\n' + '\n'.join(extra_rules)):
    variant, kind, fam, shade, alpha, pseudo, body = m.groups()
    t = token(kind, fam, int(shade), int(alpha) if alpha else None)
    if not t:
        continue
    new = re.sub(r'(#[0-9a-fA-F]{3,8}|rgba?\([^)]*\))', t, body)
    sel = '.' + variant + kind + '-' + fam + '-' + shade + ('\\/' + alpha if alpha else '') + pseudo
    if new != body and sel not in seen:
        seen.add(sel)
        out_rules.append(f'{sel}{{{new}}}')
# ring-white und ring-offset werden zu Token-Farben
out_rules.append('.ring-white{--tw-ring-color:var(--text)}')

open(path, 'w', encoding='utf-8').write(css.rstrip('\n') + '\n' + MARK + '\n' + '\n'.join(extra_rules + out_rules) + '\n')
print(len(extra_rules), 'Zusatz-Utilities,', len(out_rules), 'Farbregeln auf Tokens umgestellt')
