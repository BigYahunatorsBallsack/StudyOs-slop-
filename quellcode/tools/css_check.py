"""Meldet Utility-Klassen aus src/**/*.jsx, für die es in src/style.css keine Regel gibt.
Dazu als Hinweis (ohne Fehler): Klassen mit Regel in den CSS-Dateien, die im Quellcode nirgends mehr vorkommen."""
import re, glob, sys

root = sys.argv[1]
css = ''.join(open(f'{root}/src/{f}', encoding='utf-8').read() for f in ('style.css', 'design.css', 'retro.css'))
own = set(re.findall(r'\.([a-zA-Z][\w-]*)', css))
# Klassen, die per <style> in App.jsx definiert werden
app = open(f'{root}/src/App.jsx', encoding='utf-8').read()
own |= set(re.findall(r'\.([a-zA-Z][\w-]*)\{', app))


def esc(t):
    return re.sub(r'([^a-zA-Z0-9_-])', lambda m: '\\' + m.group(1), t)


tokens = set()
sources = ''
for f in glob.glob(f'{root}/src/**/*.js*', recursive=True):
    s = open(f, encoding='utf-8').read()
    sources += s + '\n'
    chunks = re.findall(r'className=\{?["`]([^"`]*)["`]', s)
    chunks += re.findall(r'className=\{`([^`]*)`\}', s)
    # Strings in ${…} eines Klassen-Templates, z. B. ${x.live ? "daystrip-live" : ""}
    for t in re.findall(r'className=\{`([^`]*)`\}', s):
        for e in re.findall(r'\$\{([^}]*)\}', t):
            chunks += re.findall(r'"([^"\n]*)"', e)
    # Strings in Ternaries und Konstanten, die wie Klassenlisten aussehen
    chunks += [x for x in re.findall(r'"([^"\n]{2,200})"', s) if re.search(r'\b(bg|text|border|rounded|px|py|p|m[trblxy]?|gap|flex|grid|w|h|ring|hover|font)-', x)]
    for c in chunks:
        c = re.sub(r'\$\{[^}]*\}', ' ', c)
        for t in c.split():
            if re.fullmatch(r'[a-z!][a-z0-9:\-\[\]/\.%#]*', t) and ('-' in t or t in ('flex', 'grid', 'hidden', 'block', 'truncate', 'relative', 'absolute', 'fixed', 'sticky', 'underline', 'italic', 'uppercase', 'contents', 'inline')):
                tokens.add(t)
missing = sorted(t for t in tokens if '.' + esc(t) not in css and t not in own and not t.startswith(('hm',)))
print(len(tokens), 'Klassen geprüft;', len(missing), 'ohne Regel:')
print(' '.join(missing))

# Hinweis: Klassen mit Regel, die im Quellcode (src/, index.html) nicht mehr vorkommen. Zusammengesetzte Namen
# (`px-${name}`, "hm" + n) gelten über ihren Anfang als benutzt; Code-Farben (hljs-*) setzt highlight.js.
sources += open(f'{root}/public/index.html', encoding='utf-8').read()
dyn = set(re.findall(r'([a-zA-Z][\w-]*)\$\{', sources)) | set(re.findall(r'["\']([a-zA-Z][\w-]*)["\']\s*\+', sources))
plain = re.sub(r'url\([^)]*\)', '', re.sub(r'/\*.*?\*/', '', css, flags=re.S))
defined = {re.sub(r'\\(.)', r'\1', c) for sel in re.findall(r'([^{}]+)\{', plain) if not sel.strip().startswith('@')
           for c in re.findall(r'\.((?:[a-zA-Z_-]|\\.)(?:[\w-]|\\.)*)', sel)}
unused = sorted(c for c in defined if not c.startswith(('hljs-', 'function_')) and not any(c.startswith(p) for p in dyn)
                and not re.search(r'(?<![\w\-/:.\[!])' + re.escape(c) + r'(?![\w\-/\[])', sources))
print(f'Hinweis: {len(unused)} Klassen mit Regel, aber ohne Verwendung im Quellcode' + (':' if unused else '.'))
if unused:
    print(' '.join(unused))
