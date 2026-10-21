/* Papierkorb: Gelöschtes bleibt 30 Tage wiederherstellbar.
   Liegt in `meta.trash`; der Cloud-Sync lädt ihn mit hoch (verschlüsselt, siehe forCloud) und führt die Papierkörbe
   beider Geräte nach id zusammen (mergeTrash). Wiederhergestellte oder endgültig gelöschte Papierkorb-Einträge
   bekommen einen Grabstein `{ c: "trash", id, at }` in `data.deleted` (setzt stampChanges), damit das andere Gerät
   sie nicht wieder einbringt. Wiederhergestellte Einträge gelten als neu angelegt und gewinnen so gegen ihre Grabsteine.
   Ein Eintrag merkt sich die entfernten Einträge jeder Sammlung und die Felder, die beim Löschen an anderen
   Einträgen geändert wurden (z. B. Lerneinheiten, die ihr Modul verloren haben). */
import { COLLS } from "./constants.js";
import { uid } from "./util.js";

export const TRASH_DAYS = 30;
const MAX_ENTRIES = 200;

const titleOf = (x) => String(x.title || x.name || x.front || x.type || "Eintrag").slice(0, 80);
const plain = (v) => v === null || typeof v !== "object";

/** Was zwischen `before` und `after` gelöscht wurde, als Papierkorb-Eintrag (null, wenn nichts fehlt) */
export function trashEntry(before, after, { label = "", at = new Date().toISOString() } = {}) {
  const removed = {}, changed = {};
  let count = 0, first = null, firstColl = "";
  for (const c of COLLS) {
    if (before[c] === after[c]) continue;
    const next = new Map((after[c] || []).map((x) => [x.id, x]));
    const gone = (before[c] || []).filter((x) => !next.has(x.id));
    if (gone.length) { removed[c] = gone; count += gone.length; if (!first) { first = gone[0]; firstColl = c; } }
    const diffs = [];
    for (const x of before[c] || []) {
      const y = next.get(x.id);
      if (!y || y === x) continue;
      const fields = {};
      /* auch Felder, die erst beim Löschen dazukamen (z. B. ein übernommenes Häkchen beim Aufräumen) */
      for (const k of new Set([...Object.keys(x), ...Object.keys(y)])) if (k !== "updated" && k !== "fu" && x[k] !== y[k] && plain(k in x ? x[k] : y[k])) fields[k] = [x[k], y[k]];
      if (Object.keys(fields).length) diffs.push({ id: x.id, fields });
    }
    if (diffs.length) changed[c] = diffs;
  }
  if (!count) return null;
  return { id: uid(), at, label: label || titleOf(first), named: !!label, coll: firstColl, count, removed, changed };
}

export const TRASH_TOMB = "trash"; /* Sammlung der Grabsteine für Papierkorb-Einträge in data.deleted */
const valid = (t) => t && typeof t === "object" && typeof t.id === "string" && typeof t.at === "string";

/** Papierkorb ohne abgelaufene Einträge, neueste zuerst */
export function pruneTrash(list = [], now = new Date()) {
  const limit = new Date(now.getTime() - TRASH_DAYS * 86400000).toISOString();
  return (Array.isArray(list) ? list : []).filter((t) => valid(t) && t.at >= limit).sort((a, b) => b.at.localeCompare(a.at) || a.id.localeCompare(b.id)).slice(0, MAX_ENTRIES);
}

/** Papierkörbe zweier Geräte nach id zusammenführen; Einträge mit Grabstein (wiederhergestellt/gelöscht) fallen weg.
    `gone`: Set der ids aus den Grabsteinen. Ein Eintrag ändert sich nach dem Anlegen nicht mehr, gleiche id = gleicher Inhalt. */
export function mergeTrash(a = [], b = [], gone = new Set(), now = new Date()) {
  const by = new Map();
  for (const t of [...(Array.isArray(a) ? a : []), ...(Array.isArray(b) ? b : [])]) if (valid(t) && !gone.has(t.id) && !by.has(t.id)) by.set(t.id, t);
  return pruneTrash([...by.values()], now);
}

/** ids, die seit `prev` aus dem Papierkorb verschwunden sind (für Grabsteine) */
export function trashRemoved(prev = [], next = []) {
  if (prev === next) return [];
  const keep = new Set((next || []).map((t) => t && t.id));
  return (prev || []).filter((t) => t && t.id && !keep.has(t.id)).map((t) => t.id);
}

/** Legt einen Eintrag in den Papierkorb von `data` */
export const addTrash = (data, entry) => (entry ? { ...data, meta: { ...data.meta, trash: pruneTrash([entry, ...(data.meta?.trash || [])]) } } : data);

export const trashOf = (data, now = new Date()) => pruneTrash(data.meta?.trash || [], now);

/** Holt einen Eintrag zurück: fehlende Einträge kommen wieder dazu, gelöste Verknüpfungen werden wiederhergestellt,
    sofern sie seitdem niemand anders gesetzt hat. Der Eintrag verschwindet aus dem Papierkorb. */
export function restoreTrash(data, id) {
  const entry = (data.meta?.trash || []).find((t) => t.id === id);
  if (!entry) return data;
  const out = { ...data };
  for (const [c, items] of Object.entries(entry.removed || {})) {
    if (!COLLS.includes(c)) continue;
    const have = new Set((out[c] || []).map((x) => x.id));
    /* `updated`/`fu` weg: der Eintrag gilt als neu angelegt und gewinnt so gegen den Grabstein der Löschung */
    const back = items.filter((x) => !have.has(x.id)).map(({ updated: _u, fu: _f, ...x }) => x);
    if (back.length) out[c] = [...(out[c] || []), ...back];
  }
  for (const [c, diffs] of Object.entries(entry.changed || {})) {
    if (!COLLS.includes(c) || !out[c]) continue;
    const byId = new Map(diffs.map((d) => [d.id, d.fields]));
    out[c] = out[c].map((x) => {
      const f = byId.get(x.id);
      if (!f) return x;
      const p = {};
      for (const [k, [was, now]] of Object.entries(f)) if (x[k] === now) p[k] = was;
      return Object.keys(p).length ? { ...x, ...p } : x;
    });
  }
  out.meta = { ...data.meta, trash: (data.meta.trash || []).filter((t) => t.id !== id) };
  return out;
}

/** Eintrag endgültig löschen (`id` weglassen: alles) */
export const purgeTrash = (data, id) => ({ ...data, meta: { ...data.meta, trash: id ? (data.meta?.trash || []).filter((t) => t.id !== id) : [] } });
