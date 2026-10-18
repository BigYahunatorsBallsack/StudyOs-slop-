"""Meldet Utility-Klassen aus src/**/*.jsx, für die es in src/style.css keine Regel gibt."""
import re, glob, sys

root = sys.argv[1]
css = open(f'{root}/src/style.css', encoding='utf-8').read() + open(f'{root}/src/design.css', encoding='utf-8').read()
own = set(re.findall(r'\.([a-zA-Z][\w-]*)', css))
# Klassen, die per <style> in App.jsx definiert werden
app = open(f'{root}/src/App.jsx', encoding='utf-8').read()
own |= set(re.findall(r'\.([a-zA-Z][\w-]*)\{', app))


def esc(t):
    return re.sub(r'([^a-zA-Z0-9_-])', lambda m: '\\' + m.group(1), t)


tokens = set()
for f in glob.glob(f'{root}/src/**/*.js*', recursive=True):
    s = open(f, encoding='utf-8').read()
    chunks = re.findall(r'className=\{?["`]([^"`]*)["`]', s)
    chunks += re.findall(r'className=\{`([^`]*)`\}', s)
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
