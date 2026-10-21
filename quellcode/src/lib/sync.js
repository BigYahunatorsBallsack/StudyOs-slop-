/* Änderungsverfolgung und Zusammenführen von Datenständen zweier Geräte (ohne Server).
   Jeder Eintrag trägt `updated` (jüngste Änderung) und, sobald er einmal bearbeitet wurde, `fu` mit den
   Zeitstempeln der einzelnen Felder ("*" = alle nicht aufgeführten Felder). Zusammengeführt wird pro Feld.
   Zeitstempel kommen aus einer hybriden Uhr: Geräteuhr plus Versatz zur Serverzeit, und nie älter als der
   Stand, der gerade bearbeitet wird. Löschungen landen als Grabsteine in `data.deleted`. */
import { COLLS, DATA_VERSION } from "./constants.js";

export const EPOCH = "1970-01-01T00:00:00.000Z";
const KEEP_DAYS = 365; /* so lange bleiben Grabsteine erhalten */
const stamp = (x) => x.updated || EPOCH;
const tombKey = (t) => `${t.c}:${t.id}`;

/* Versatz der Geräteuhr zur Serverzeit (ms), gesetzt vom Cloud-Sync. Kleine Abweichungen bleiben unberücksichtigt,
   damit die Zeitstempel nicht bei jeder Antwort hin und her springen. */
let clockOffset = 0;
export function setClockOffset(ms) { clockOffset = Number.isFinite(ms) && Math.abs(ms) > 2000 ? Math.round(ms) : 0; }
export const nowIso = () => new Date(Date.now() + clockOffset).toISOString();
export const clockOffsetMs = () => clockOffset;

/* Hybride Uhr: mindestens `now`, aber immer jünger als alles in `after` (z. B. die bisherige Fassung des Eintrags).
   So gewinnt eine Änderung auf einem Gerät mit nachgehender Uhr trotzdem gegen den Stand, den es bearbeitet hat. */
function hlc(now, ...after) {
  let t = now;
  for (const a of after) {
    if (!a || a < t) continue;
    const ms = Date.parse(a);
    t = Number.isFinite(ms) ? new Date(ms + 1).toISOString() : t;
  }
  return t;
}

/* Felder, die nur gemeinsam Sinn ergeben, werden wie ein Feld behandelt (z. B. der Lernstand einer Karte).
   Erledigt-Zeitpunkte reisen mit ihrem Schalter; die Gruppe heißt wie der Schalter, damit ältere Stempel weiter gelten.
   Bewusst nicht im Lernstand: `hard` (Karte als schwer markiert) und `pinned` (Notiz angeheftet) sind eigene Felder,
   damit Markieren auf einem Gerät und Abfragen auf einem anderen beide erhalten bleiben. */
const GROUPS = {
  cards: { srs: ["stability", "difficulty", "interval", "reps", "lapses", "due", "lastReview", "ease", "reviews"] },
  sessions: { attended: ["attended", "attendedAt"] },
  blocks: { done: ["done", "doneAt"] },
};
const META = new Set(["id", "updated", "fu"]);
function groupOf(c) {
  const byField = new Map();
  for (const [g, fields] of Object.entries(GROUPS[c] || {})) for (const f of fields) byField.set(f, g);
  return (k) => byField.get(k) || k;
}
const groupFields = (c) => (g) => GROUPS[c]?.[g] || [g];

/* Listen, deren Elemente eine eigene id tragen (Teilaufgaben einer Abgabe, Links eines Moduls), werden pro Element zusammengeführt:
   Für Stempel und Zusammenführen gilt jedes Element als eigenes Feld "liste:id", die Reihenfolge als "liste#".
   Die ganze Liste bleibt zusätzlich als Feld erhalten, damit ältere App-Versionen sie wie bisher als ein Feld behandeln. */
const LISTS = { homework: ["subtasks"], modules: ["links"] };
function flatten(c) {
  const lists = LISTS[c];
  if (!lists) return (x) => x;
  return (x) => {
    if (!x || !lists.some((l) => Array.isArray(x[l]))) return x;
    const out = { ...x };
    for (const l of lists) {
      if (!Array.isArray(x[l])) continue;
      out[l + "#"] = x[l].map((e) => e.id);
      for (const { id, ...rest } of x[l]) out[`${l}:${id}`] = rest;
    }
    return out;
  };
}
/* Gegenstück zu flatten: baut die Listen aus Reihenfolge und Elementen wieder zusammen (ändert `v`). */
function unflatten(c, v) {
  for (const l of LISTS[c] || []) {
    const pre = l + ":", order = v[l + "#"], items = new Map();
    for (const k of Object.keys(v)) if (k.startsWith(pre)) { items.set(k.slice(pre.length), v[k]); delete v[k]; }
    delete v[l + "#"];
    if (order === undefined && !items.size) continue;
    const ids = (Array.isArray(order) ? order : []).filter((id) => items.has(id));
    const rest = [...items.keys()].filter((id) => !ids.includes(id)).sort();
    v[l] = [...ids, ...rest].map((id) => ({ id, ...items.get(id) }));
  }
  return v;
}
/** JSON mit sortierten Schlüsseln: gleicher Inhalt ergibt denselben Text, egal in welcher Reihenfolge die Felder stehen. */
export function canonical(v) {
  if (Array.isArray(v)) return "[" + v.map((x) => (x === undefined ? "null" : canonical(x))).join(",") + "]";
  if (v && typeof v === "object") return "{" + Object.keys(v).sort().filter((k) => v[k] !== undefined).map((k) => JSON.stringify(k) + ":" + canonical(v[k])).join(",") + "}";
  return v === undefined ? "" : JSON.stringify(v);
}
const same = (a, b) => a === b || canonical(a) === canonical(b);
const groupVal = (obj, fields) => (fields.length === 1 ? obj[fields[0]] : fields.map((f) => obj[f]));

/* Feld-Zeitstempel eines Eintrags. Ohne `fu`, oder wenn eine ältere App-Version nur `updated` erneuert hat,
   gilt `updated` für alle Felder (wie früher: der ganze Eintrag). */
function fieldStamps(values, updated, fu) {
  const u = updated || EPOCH;
  if (!fu || typeof fu !== "object") return { star: u, of: () => u, listed: [] };
  const all = Object.values(fu).filter((v) => typeof v === "string");
  const max = all.length ? all.reduce((m, v) => (v > m ? v : m)) : EPOCH;
  if (u > max) return { star: u, of: () => u, listed: [] };
  const star = typeof fu["*"] === "string" ? fu["*"] : EPOCH;
  return { star, of: (g) => (typeof fu[g] === "string" ? fu[g] : star), listed: Object.keys(fu).filter((k) => k !== "*") };
}

/* Welche Feldgruppen unterscheiden sich zwischen zwei Fassungen? */
function changedGroups(a, b, gOf, gFields) {
  const keys = new Set([...Object.keys(a || {}), ...Object.keys(b || {})].filter((k) => !META.has(k)));
  const out = new Set();
  for (const k of keys) { const g = gOf(k); if (!out.has(g) && !same(groupVal(a || {}, gFields(g)), groupVal(b || {}, gFields(g)))) out.add(g); }
  return out;
}

/* Neue Feld-Zeitstempel nach einer lokalen Änderung: geänderte Gruppen bekommen `s`, der Rest bleibt. */
function restamp(prevUpdated, prevFu, groups, s) {
  const st = fieldStamps(null, prevUpdated, prevFu);
  const fu = { "*": st.star };
  for (const g of st.listed) fu[g] = st.of(g);
  for (const g of groups) fu[g] = s;
  return fu;
}

function pruneTombs(map, nowIso) {
  const limit = new Date(new Date(nowIso).getTime() - KEEP_DAYS * 86400000).toISOString();
  return [...map.values()].filter((t) => t.at >= limit);
}

/** Vergleicht zwei Datenstände per Objektidentität: neue Einträge bekommen `updated`, geänderte zusätzlich
    Zeitstempel für die geänderten Felder, entfernte einen Grabstein. Unveränderte Einträge bleiben dieselben Objekte. */
export function stampChanges(prev, next, now = nowIso()) {
  if (prev === next || !prev || !next) return next;
  const tombs = new Map((next.deleted || []).map((t) => [tombKey(t), t]));
  const out = { ...next };
  let changed = false;
  for (const c of COLLS) {
    if (prev[c] === next[c]) continue;
    const before = new Map((prev[c] || []).map((x) => [x.id, x]));
    const gOf = groupOf(c), gFields = groupFields(c), fl = flatten(c);
    const list = next[c] || [];
    let touched = false;
    const stamped = list.map((x) => {
      const p = before.get(x.id);
      if (p === x) return x;
      const tomb = tombs.get(`${c}:${x.id}`);
      if (!p) {
        touched = true;
        tombs.delete(`${c}:${x.id}`);
        const s = hlc(now, tomb?.at, x.updated);
        const fu = x.fu && restamp(x.updated, x.fu, changedGroups({}, fl(x), gOf, gFields), s);
        return fu ? { ...x, updated: s, fu } : { ...x, updated: s };
      }
      const groups = changedGroups(fl(p), fl(x), gOf, gFields);
      touched = true;
      if (!groups.size) return p; /* nur Zeitstempel oder Reihenfolge der Felder geändert: Stempel nicht zurücksetzen */
      tombs.delete(`${c}:${x.id}`);
      const s = hlc(now, stamp(p), tomb?.at);
      return { ...x, updated: s, fu: restamp(p.updated, p.fu, groups, s) };
    });
    const ids = new Set(list.map((x) => x.id));
    for (const [id, p] of before) if (!ids.has(id)) { tombs.set(`${c}:${id}`, { c, id, at: hlc(now, stamp(p)) }); changed = true; }
    if (touched) { out[c] = stamped; changed = true; }
  }
  if (next.settings !== prev.settings) {
    const groups = changedGroups(prev.settings, next.settings, (k) => k, (g) => [g]);
    if (groups.size) {
      const s = hlc(now, prev.meta?.settingsUpdated);
      out.meta = { ...next.meta, settingsUpdated: s, settingsFu: restamp(prev.meta?.settingsUpdated, prev.meta?.settingsFu, groups, s) };
      changed = true;
    }
  }
  if (!changed) return next;
  out.deleted = pruneTombs(tombs, now);
  return out;
}

/* Führt zwei Fassungen desselben Eintrags feldweise zusammen: pro Feldgruppe gewinnt der jüngere Zeitstempel,
   bei Gleichstand entscheidet der Inhalt (damit beide Geräte dasselbe Ergebnis bekommen). */
function mergeFields(x, xu, xfu, y, yu, yfu, gOf, gFields) {
  const sx = fieldStamps(x, xu, xfu), sy = fieldStamps(y, yu, yfu);
  const groups = new Set([...Object.keys(x), ...Object.keys(y)].filter((k) => !META.has(k)).map(gOf));
  for (const g of [...sx.listed, ...sy.listed]) groups.add(g);
  const star = sx.star > sy.star ? sx.star : sy.star;
  const values = {}, fu = { "*": star };
  for (const g of groups) {
    const fields = gFields(g), ax = sx.of(g), ay = sy.of(g);
    let fromY = ay > ax;
    if (ay === ax) { const jx = canonical(groupVal(x, fields)), jy = canonical(groupVal(y, fields)); fromY = jy > jx; }
    const src = fromY ? y : x, at = fromY ? ay : ax;
    for (const f of fields) if (f in src) values[f] = src[f];
    if (at !== star) fu[g] = at;
  }
  return { values, updated: xu > yu ? xu : yu, fu };
}

function mergeItem(x, y, c) {
  if (x === y) return x;
  const gOf = groupOf(c), gFields = groupFields(c), fl = flatten(c);
  const m = mergeFields(fl(x), stamp(x), x.fu, fl(y), stamp(y), y.fu, gOf, gFields);
  /** @type {Record<string, any>} */
  const out = { id: x.id, ...unflatten(c, m.values), updated: m.updated };
  if (Object.keys(m.fu).length > 1 || x.fu || y.fu) out.fu = m.fu;
  /* Gleicher Inhalt wie eine Seite: deren Objekt behalten (Identität zählt für Statistik und Konflikthinweis) */
  for (const side of [x, y]) if (!changedGroups(fl(side), fl(out), gOf, gFields).size && stamp(side) === out.updated && same(side.fu, out.fu)) return side;
  return out;
}

/** Führt zwei Datenstände zusammen: pro Feld gewinnt der jüngere Zeitstempel, eine Löschung gewinnt,
    wenn sie nach der letzten Änderung des Eintrags liegt. */
export function mergeData(local, remote, now = nowIso()) {
  const tombs = new Map();
  for (const t of [...(local.deleted || []), ...(remote.deleted || [])]) {
    const k = tombKey(t), o = tombs.get(k);
    if (!o || t.at > o.at) tombs.set(k, t);
  }
  const stats = { added: 0, updated: 0, removed: 0 };
  const out = { ...local, version: DATA_VERSION };
  for (const c of COLLS) {
    const map = new Map((local[c] || []).map((x) => [x.id, x]));
    for (const y of remote[c] || []) {
      const x = map.get(y.id);
      if (!x) { map.set(y.id, y); stats.added++; continue; }
      const m = mergeItem(x, y, c);
      if (m !== x) { map.set(y.id, m); stats.updated++; }
    }
    for (const [id, item] of [...map]) {
      const t = tombs.get(`${c}:${id}`);
      if (t && t.at >= stamp(item)) { map.delete(id); stats.removed++; }
    }
    out[c] = [...map.values()];
  }
  const lm = local.meta || {}, rm = remote.meta || {};
  const s = mergeFields(local.settings || {}, lm.settingsUpdated || EPOCH, lm.settingsFu, remote.settings || {}, rm.settingsUpdated || EPOCH, rm.settingsFu, (k) => k, (g) => [g]);
  out.settings = s.values;
  out.meta = { ...local.meta, settingsUpdated: s.updated };
  if (Object.keys(s.fu).length > 1 || lm.settingsFu || rm.settingsFu) out.meta.settingsFu = s.fu;
  else delete out.meta.settingsFu;
  out.meta.lastBackup = [local.meta?.lastBackup, remote.meta?.lastBackup].filter(Boolean).sort().pop() || null;
  out.deleted = pruneTombs(tombs, now);
  return { data: out, stats };
}

const titleOf = (x) => String(x.title || x.name || x.front || x.type || "Eintrag").slice(0, 60);

/** Zeitstempel aller Einträge ("sammlung:id" → updated), z. B. nach einem erfolgreichen Sync. */
export function stampMap(d) {
  const m = new Map();
  for (const c of COLLS) for (const x of d[c] || []) m.set(`${c}:${x.id}`, stamp(x));
  return m;
}

/** stampMap kompakt als Text, gruppiert nach Sammlung: {"u":nutzer,"s":{"notes":{"n1":"2026-…"}}}.
    Gespeichert, damit der erste Sync nach dem Neuladen Konflikte erkennt. */
export function encodeStamps(map, user) {
  const s = Object.create(null); /* keine Prototyp-Schlüssel, falls eine id "__proto__" heißt */
  for (const [k, v] of map || []) {
    const i = k.indexOf(":");
    const c = k.slice(0, i);
    if (!s[c]) s[c] = Object.create(null);
    s[c][k.slice(i + 1)] = v;
  }
  return JSON.stringify({ u: user, s });
}

/** Gegenstück zu encodeStamps; null bei fremdem Nutzer oder kaputtem Text (dann meldet der erste Sync nichts). */
export function decodeStamps(text, user) {
  try {
    const o = JSON.parse(text);
    if (!o || o.u !== user || typeof o.s !== "object" || !o.s) return null;
    const m = new Map();
    for (const [c, ids] of Object.entries(o.s)) for (const [id, v] of Object.entries(ids || {})) if (typeof v === "string") m.set(`${c}:${id}`, v);
    return m;
  } catch { return null; }
}

/** Was hat ein Zusammenführen auf diesem Gerät überschrieben? Nur Felder, die hier seit dem letzten Sync
    geändert wurden (Feld-Zeitstempel jünger als `synced`) und danach von einem anderen Gerät ersetzt wurden,
    oder hier geänderte Einträge, die anderswo gelöscht sind. Ohne `synced` (erster Sync nach dem Start) wird nichts gemeldet. */
export function findConflicts(local, merged, synced) {
  if (!synced) return [];
  const out = [];
  for (const c of COLLS) {
    const after = new Map((merged[c] || []).map((x) => [x.id, x]));
    const gOf = groupOf(c), gFields = groupFields(c), fl = flatten(c);
    for (const x of local[c] || []) {
      const was = synced.get(`${c}:${x.id}`);
      if (was === stamp(x)) continue;
      const y = after.get(x.id);
      if (!y) { out.push({ c, id: x.id, title: titleOf(x), kind: "deleted", local: x }); continue; }
      if (y === x) continue;
      const st = fieldStamps(x, x.updated, x.fu);
      /* die ganze Liste zählt nicht: sie ändert sich mit jedem Element, auch wenn dort nichts verloren ging */
      const lost = [...changedGroups(fl(x), fl(y), gOf, gFields)].filter((g) => !LISTS[c]?.includes(g) && st.of(g) > (was || EPOCH));
      if (lost.length) out.push({ c, id: x.id, title: titleOf(x), kind: "overwritten", local: x, fields: lost });
    }
  }
  return out;
}

/** Stellt die lokalen Fassungen aus findConflicts wieder her (werden danach neu gestempelt und synchronisiert).
    Bei überschriebenen Einträgen nur die betroffenen Felder, damit die übrigen Änderungen des anderen Geräts bleiben. */
export function restoreConflicts(d, conflicts) {
  const out = { ...d };
  for (const c of new Set(conflicts.map((k) => k.c))) {
    const gFields = groupFields(c), fl = flatten(c);
    const mine = new Map(conflicts.filter((k) => k.c === c).map((k) => [k.id, k]));
    const restore = (x, k) => {
      if (!k.fields) return { ...k.local };
      const y = { ...fl(x) }, local = fl(k.local);
      for (const g of k.fields) for (const f of gFields(g)) { if (f in local) y[f] = local[f]; else delete y[f]; }
      return unflatten(c, y);
    };
    const kept = (d[c] || []).map((x) => (mine.has(x.id) ? restore(x, mine.get(x.id)) : x));
    const present = new Set(kept.map((x) => x.id));
    out[c] = [...kept, ...[...mine.values()].filter((k) => !present.has(k.id)).map((k) => ({ ...k.local }))];
  }
  return out;
}
