/* Änderungsverfolgung und Zusammenführen von Datenständen zweier Geräte (ohne Server).
   Jeder Eintrag trägt `updated`; Löschungen landen als Grabsteine in `data.deleted`. */
import { COLLS, DATA_VERSION } from "./constants.js";

export const EPOCH = "1970-01-01T00:00:00.000Z";
const KEEP_DAYS = 365; /* so lange bleiben Grabsteine erhalten */
const stamp = (x) => x.updated || EPOCH;
const tombKey = (t) => `${t.c}:${t.id}`;

function pruneTombs(map, nowIso) {
  const limit = new Date(new Date(nowIso).getTime() - KEEP_DAYS * 86400000).toISOString();
  return [...map.values()].filter((t) => t.at >= limit);
}

/** Vergleicht zwei Datenstände per Objektidentität: neue oder geänderte Einträge bekommen `updated`,
    entfernte einen Grabstein. Unveränderte Einträge bleiben dieselben Objekte. */
export function stampChanges(prev, next, now = new Date().toISOString()) {
  if (prev === next || !prev || !next) return next;
  const tombs = new Map((next.deleted || []).map((t) => [tombKey(t), t]));
  const out = { ...next };
  let changed = false;
  for (const c of COLLS) {
    if (prev[c] === next[c]) continue;
    const before = new Map((prev[c] || []).map((x) => [x.id, x]));
    const list = next[c] || [];
    let touched = false;
    const stamped = list.map((x) => {
      if (before.get(x.id) === x) return x;
      touched = true;
      tombs.delete(`${c}:${x.id}`);
      return { ...x, updated: now };
    });
    const ids = new Set(list.map((x) => x.id));
    for (const id of before.keys()) if (!ids.has(id)) { tombs.set(`${c}:${id}`, { c, id, at: now }); changed = true; }
    if (touched) { out[c] = stamped; changed = true; }
  }
  if (next.settings !== prev.settings) { out.meta = { ...next.meta, settingsUpdated: now }; changed = true; }
  if (!changed) return next;
  out.deleted = pruneTombs(tombs, now);
  return out;
}

/** Führt zwei Datenstände zusammen: pro Eintrag gewinnt der jüngere `updated`-Zeitstempel,
    eine Löschung gewinnt, wenn sie nach der letzten Änderung des Eintrags liegt. */
export function mergeData(local, remote, now = new Date().toISOString()) {
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
      if (!x) { map.set(y.id, y); stats.added++; }
      else if (stamp(y) > stamp(x)) { map.set(y.id, y); stats.updated++; }
    }
    for (const [id, item] of [...map]) {
      const t = tombs.get(`${c}:${id}`);
      if (t && t.at >= stamp(item)) { map.delete(id); stats.removed++; }
    }
    out[c] = [...map.values()];
  }
  const ls = local.meta?.settingsUpdated || EPOCH, rs = remote.meta?.settingsUpdated || EPOCH;
  const useRemote = rs > ls;
  out.settings = { ...(useRemote ? remote.settings : local.settings) };
  out.meta = { ...local.meta, settingsUpdated: useRemote ? rs : ls };
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

/** Was hat ein Zusammenführen auf diesem Gerät überschrieben? Nur Einträge, die hier seit dem letzten Sync
    geändert wurden (Zeitstempel weicht von `synced` ab) und danach von einem anderen Gerät ersetzt oder gelöscht sind.
    Ohne `synced` (erster Sync nach dem Start) wird nichts gemeldet. */
export function findConflicts(local, merged, synced) {
  if (!synced) return [];
  const out = [];
  for (const c of COLLS) {
    const after = new Map((merged[c] || []).map((x) => [x.id, x]));
    for (const x of local[c] || []) {
      if (synced.get(`${c}:${x.id}`) === stamp(x)) continue;
      const y = after.get(x.id);
      if (!y) out.push({ c, id: x.id, title: titleOf(x), kind: "deleted", local: x });
      else if (y !== x && stamp(y) !== stamp(x)) out.push({ c, id: x.id, title: titleOf(x), kind: "overwritten", local: x });
    }
  }
  return out;
}

/** Stellt die lokalen Fassungen aus findConflicts wieder her (werden danach neu gestempelt und synchronisiert). */
export function restoreConflicts(d, conflicts) {
  const out = { ...d };
  for (const c of new Set(conflicts.map((k) => k.c))) {
    const mine = new Map(conflicts.filter((k) => k.c === c).map((k) => [k.id, k.local]));
    const kept = (d[c] || []).map((x) => (mine.has(x.id) ? { ...mine.get(x.id) } : x));
    const present = new Set(kept.map((x) => x.id));
    out[c] = [...kept, ...[...mine.values()].filter((x) => !present.has(x.id)).map((x) => ({ ...x }))];
  }
  return out;
}
