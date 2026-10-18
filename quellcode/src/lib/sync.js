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
