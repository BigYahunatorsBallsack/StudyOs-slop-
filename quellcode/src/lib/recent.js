/* Zuletzt geöffnete Notizen und Module für die Suche (Strg + K), nur auf diesem Gerät */
const KEY = "studyos-recent";
export const RECENT_MAX = 6;

/** Neuen Eintrag vorne einreihen; doppelte fallen weg, höchstens RECENT_MAX. */
export function pushRecent(list, kind, id, max = RECENT_MAX) {
  const rest = (Array.isArray(list) ? list : []).filter((x) => x && !(x.kind === kind && x.id === id));
  return [{ kind, id }, ...rest].slice(0, max);
}

/** Gemerkte Einträge als Suchtreffer; gelöschte Notizen und Module fallen weg. */
export function recentResults(data, list) {
  const mod = (id) => data.modules.find((m) => m.id === id);
  const out = [];
  for (const r of Array.isArray(list) ? list : []) {
    if (r?.kind === "note") {
      const n = data.notes.find((x) => x.id === r.id);
      if (n) out.push({ kind: "note", label: "Zuletzt geöffnet", item: n, key: "recent-note" + n.id, title: n.title || "Notiz", sub: mod(n.moduleId)?.name || "Allgemein" });
    } else if (r?.kind === "module") {
      const m = mod(r.id);
      if (m) out.push({ kind: "module", label: "Zuletzt geöffnet", item: m, key: "recent-module" + m.id, title: m.name, sub: "Modul" });
    }
  }
  return out;
}

export const readRecent = () => { try { const v = JSON.parse(localStorage.getItem(KEY) || "[]"); return Array.isArray(v) ? v : []; } catch { return []; } };

export const rememberOpened = (kind, id) => { if (!id) return; try { localStorage.setItem(KEY, JSON.stringify(pushRecent(readRecent(), kind, id))); } catch { /* egal */ } };
