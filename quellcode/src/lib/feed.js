/* Stundenplan-Abo: Termine aus einem Kalender-Link (z. B. TUMonline) mit den StudyOS-Terminen abgleichen.
   Jeder übernommene Termin trägt `feedKey` (UID + ursprüngliches Datum), damit er beim nächsten Abruf
   wiedererkannt wird. Eigene Häkchen (vorbereitet, besucht, nachbereitet) bleiben dabei erhalten. */
import { guessType } from "./ics.js";
import { PALETTE } from "./constants.js";
import { iso, uid as newId } from "./util.js";
import { baseName } from "./modules.js";

export const SKIP = "__skip";
export const NEW = "__new";

/** Veranstaltungen (nach Titel), die noch keinem Modul zugeordnet sind */
export const unmappedSummaries = (events, map = {}) => [...new Set(events.map((e) => e.summary))].filter((s) => !(s in map)).sort((a, b) => a.localeCompare(b, "de"));

/** Vorschlag: gleicher Namenskern wie ein vorhandenes Modul, oder Titel enthält Modulnummer bzw. -namen */
export function guessMapping(summaries, modules) {
  const out = {};
  for (const s of summaries) {
    const low = s.toLowerCase(), base = baseName(s);
    const hit = modules.find((m) => baseName(m.name) === base)
      || modules.find((m) => (m.code && low.includes(m.code.toLowerCase())) || (baseName(m.name).length > 3 && low.includes(baseName(m.name))));
    out[s] = hit ? hit.id : NEW;
  }
  return out;
}

/* Lesbarer Modulname aus einem Veranstaltungstitel: ohne „Übungen zu“, „VO“, „Tutorübung“ usw. */
function moduleNameFrom(summary) {
  const base = baseName(summary);
  const idx = summary.toLowerCase().indexOf(base);
  return (idx >= 0 ? summary.slice(idx, idx + base.length) : summary).trim() || summary;
}

/** Legt Module für „neu“-Zuordnungen an (Veranstaltungen mit gleichem Namenskern teilen sich eines). */
export function resolveNewModules(data, map) {
  const modules = [...data.modules];
  const resolved = { ...map };
  const byBase = new Map(modules.map((m) => [baseName(m.name), m]));
  for (const [summary, target] of Object.entries(map)) {
    if (target !== NEW) continue;
    const base = baseName(summary);
    let m = byBase.get(base);
    if (!m) {
      m = { id: newId(), name: moduleNameFrom(summary), code: "", ects: 6, semester: 1, status: "belegt", grade: null, color: PALETTE[modules.length % PALETTE.length], created: iso() };
      modules.push(m);
      byBase.set(base, m);
    }
    resolved[summary] = m.id;
  }
  return { modules, map: resolved };
}

const touched = (s, notes) => s.prepared || s.attended || s.reviewed || notes.some((n) => n.sessionId === s.id);

/* Ab dieser Version werden parallele Säle zusammengeführt; ältere Abos werden einmal sofort neu abgeglichen */
export const FEED_VERSION = 2;

/**
 * Fasst Termine zusammen, die dasselbe Modul, dieselbe Art und dieselbe Zeit haben,
 * z. B. eine Vorlesung, die wegen vieler Teilnehmer in zwei Sälen parallel läuft.
 */
export function groupParallel(events, map) {
  const groups = new Map();
  for (const e of events) {
    const moduleId = map[e.summary];
    if (!moduleId || moduleId === SKIP || moduleId === NEW) continue;
    const k = [moduleId, guessType(e.summary), e.date, e.start, e.end].join("|");
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(e);
  }
  return [...groups.values()].map((list) => {
    const live = list.filter((e) => !e.cancelled);
    const rooms = [...new Set((live.length ? live : list).map((e) => (e.room || "").trim()).filter(Boolean))];
    return {
      ...list[0],
      moduleId: map[list[0].summary],
      room: rooms.join(" / "),
      cancelled: live.length === 0,
      keys: [...new Set(list.map((e) => `${e.uid}|${e.occurrence || e.date}`))].sort(),
    };
  });
}

/**
 * Gleicht Kalender-Termine mit den vorhandenen Terminen ab.
 * Parallele Säle werden zu einem Termin; früher doppelt importierte Termine werden dabei zusammengelegt
 * (Häkchen bleiben erhalten, Notizen wandern mit).
 * @returns {{ sessions, notes, stats: { added, updated, cancelled, removed, merged } }}
 */
export function applyFeed(data, events, map, today = iso()) {
  const stats = { added: 0, updated: 0, cancelled: 0, removed: 0, merged: 0 };
  const byKey = new Map(), created = [];
  data.sessions.forEach((s) => { if (s.feedKey) byKey.set(s.feedKey, s); });
  const seen = new Set(), drop = new Set(), remap = new Map();
  const result = data.sessions.map((s) => s);
  const indexOf = new Map(result.map((s, i) => [s.id, i]));
  const put = (s) => { result[indexOf.get(s.id)] = s; };

  for (const g of groupParallel(events, map)) {
    g.keys.forEach((k) => seen.add(k));
    const fields = { moduleId: g.moduleId, date: g.date, start: g.start, end: g.end, room: g.room, cancelled: g.cancelled };
    const existing = [...new Set(g.keys.map((k) => byKey.get(k)).filter(Boolean))].map((s) => result[indexOf.get(s.id)]);

    if (!existing.length) {
      /* früher manuell importierter Termin an gleicher Stelle: übernehmen statt doppelt anlegen */
      const manual = result.find((s) => !s.feedKey && !drop.has(s.id) && s.moduleId === g.moduleId && s.date === g.date && s.start === g.start);
      if (manual) { put({ ...manual, ...fields, feedKey: g.keys[0] }); stats.updated++; continue; }
      if (g.cancelled) continue;
      created.push({ id: newId(), feedKey: g.keys[0], type: guessType(g.summary), ...fields, prepared: false, attended: false, reviewed: false, reviewedAt: null, created: today });
      stats.added++;
      continue;
    }

    /* Mehrere vorhandene Termine für dieselbe Veranstaltung: zu einem zusammenlegen */
    let cur = existing.find((s) => touched(s, data.notes)) || existing[0];
    if (existing.length > 1) {
      const others = existing.filter((s) => s !== cur);
      const reviewedAt = existing.map((s) => s.reviewedAt).filter(Boolean).sort()[0] || null;
      cur = { ...cur, prepared: existing.some((s) => s.prepared), attended: existing.some((s) => s.attended), reviewed: existing.some((s) => s.reviewed), reviewedAt };
      others.forEach((o) => { drop.add(o.id); remap.set(o.id, cur.id); });
      stats.merged += others.length;
    }
    /* Vom Nutzer geänderte Felder (z. B. Raum) bleiben, wie er sie gesetzt hat */
    const own = new Set(cur.locked || []);
    const apply = Object.fromEntries(Object.entries(fields).filter(([k]) => !own.has(k)));
    const changed = Object.keys(apply).some((k) => (cur[k] ?? "") !== (apply[k] ?? ""));
    if (changed) {
      if (apply.cancelled && !cur.cancelled) stats.cancelled++; else stats.updated++;
      cur = { ...cur, ...apply };
    }
    if (changed || existing.length > 1) put(cur);
  }

  /* Termine, die aus dem Kalender verschwunden sind: künftige entfernen, mit eigenen Häkchen als „fällt aus“ markieren */
  const final = [];
  for (const s of result) {
    if (drop.has(s.id)) continue;
    /* Schutz: Ein leerer Kalender (z. B. Störung beim Anbieter) löscht nichts */
    if (events.length && s.feedKey && !seen.has(s.feedKey) && s.date >= today) {
      if (touched(s, data.notes)) { if (!s.cancelled) { final.push({ ...s, cancelled: true }); stats.cancelled++; continue; } }
      else { stats.removed++; continue; }
    }
    final.push(s);
  }
  const notes = remap.size ? data.notes.map((n) => (remap.has(n.sessionId) ? { ...n, sessionId: remap.get(n.sessionId) } : n)) : data.notes;
  return { sessions: [...final, ...created], notes, stats };
}
