import { COLLS, DATA_VERSION, DEFAULT_SETTINGS, DONE_HW, PALETTE } from "./constants.js";
import { addDays, diffDays, fmt, fmtMin, fmtShort, isHeld, iso, sum, uid, weekStart } from "./util.js";

export function buildWeeklySeries(base, repeatUntil) {
  const seriesId = uid(); const items = []; let date = base.date;
  while (date <= repeatUntil && items.length < 52) {
    items.push({ ...base, date, id: uid(), seriesId, cancelled: false, prepared: false, attended: false, reviewed: false, reviewedAt: null });
    date = addDays(date, 7);
  }
  return items;
}

export function repairCollapsedWeeklySeries(sessions) {
  const groups = new Map();
  sessions.forEach((session) => {
    if (!session.seriesId) return;
    if (!groups.has(session.seriesId)) groups.set(session.seriesId, []);
    groups.get(session.seriesId).push(session);
  });
  for (const items of groups.values()) {
    if (items.length < 2 || !items[0].date || !items.every((item) => item.date === items[0].date)) continue;
    const firstDate = items[0].date;
    items.forEach((item, index) => { item.date = addDays(firstDate, index * 7); });
  }
  return sessions;
}

export const emptyData = () => ({ version: DATA_VERSION, settings: { ...DEFAULT_SETTINGS }, meta: { lastBackup: null, lastModule: "" }, modules: [], sessions: [], homework: [], topics: [], logs: [], notes: [], cards: [], exams: [], deleted: [] });

/* Ältere Sicherungen auf das aktuelle Datenformat bringen */
export function migrate(obj) {
  const base = emptyData();
  const out = { ...base, settings: { ...base.settings, ...(obj.settings || {}) }, meta: { ...base.meta, ...(obj.meta || {}) }, version: DATA_VERSION };
  COLLS.forEach((k) => { out[k] = Array.isArray(obj[k]) ? obj[k].filter((x) => x && typeof x === "object" && x.id) : []; });
  out.sessions = repairCollapsedWeeklySeries(out.sessions.map((s) => ({ cancelled: false, prepared: false, attended: false, reviewed: false, reviewedAt: null, ...s })));
  out.modules = out.modules.map((m, i) => ({ color: PALETTE[i % PALETTE.length], bonusPct: null, ...m }));
  out.cards = out.cards.map((c) => ({ ease: 2.5, interval: 0, reps: 0, due: iso(), ...c }));
  out.exams = out.exams.map((e) => ({ attempt: 1, freeWeekdays: [], ...e }));
  out.deleted = Array.isArray(obj.deleted) ? obj.deleted.filter((t) => t && COLLS.includes(t.c) && t.id && typeof t.at === "string") : [];
  return out;
}

export const isActive = (s) => !s.cancelled;

export const countsOf = (d) => `${d.modules.length} Module, ${d.sessions.length} Termine, ${d.homework.length} Hausaufgaben, ${d.topics.length} Themen, ${d.logs.length} Lerneinheiten, ${d.notes.length} Notizen, ${d.cards.length} Karten, ${d.exams.length} Prüfungen`;

export function streakOf(logs) {
  const days = new Set(logs.filter((l) => Number(l.minutes) > 0).map((l) => l.date));
  let d = iso(), n = 0;
  if (!days.has(d)) d = addDays(d, -1);
  while (days.has(d)) { n++; d = addDays(d, -1); }
  return n;
}

export function dueInfo(due, done) {
  if (!due) return { text: "ohne Frist", cls: "text-slate-500" };
  const t = iso(), n = diffDays(t, due);
  if (done) return { text: `Abgabe ${fmtShort(due)}`, cls: "text-slate-500" };
  if (n < 0) return { text: `überfällig seit ${-n} T.`, cls: "text-rose-400 font-medium" };
  if (n === 0) return { text: "heute fällig", cls: "text-amber-300 font-medium" };
  if (n === 1) return { text: "morgen fällig", cls: "text-amber-200" };
  return { text: `in ${n} Tagen`, cls: "text-slate-400" };
}

export function moduleStats(data, mid) {
  const t = iso();
  const ses = data.sessions.filter((s) => s.moduleId === mid && isActive(s));
  const held = ses.filter(isHeld);
  const reviewed = held.filter((s) => s.reviewed).length;
  const hw = data.homework.filter((h) => h.moduleId === mid && (!h.issued || h.issued <= t));
  const hwDone = hw.filter((h) => DONE_HW.has(h.status)).length;
  const graded = data.homework.filter((h) => h.moduleId === mid && h.status === "bewertet" && Number(h.maxPoints) > 0);
  const pts = sum(graded, (h) => h.points), maxPts = sum(graded, (h) => h.maxPoints);
  const tp = data.topics.filter((x) => x.moduleId === mid);
  const tpDone = tp.filter((x) => x.state === "geübt" || x.state === "sicher").length;
  const minutes = sum(data.logs.filter((l) => l.moduleId === mid), (l) => l.minutes);
  const reviewQuote = held.length ? reviewed / held.length : null;
  const hwQuote = hw.length ? hwDone / hw.length : null;
  const topicQuote = tp.length ? tpDone / tp.length : null;
  const parts = [reviewQuote, hwQuote, topicQuote].filter((x) => x !== null);
  const bonusPct = Number(data.modules.find((m) => m.id === mid)?.bonusPct) || 0;
  return {
    held: held.length, reviewed, openReviews: held.length - reviewed, hwTotal: hw.length, hwDone, topicsTotal: tp.length, topicsDone: tpDone,
    reviewQuote, hwQuote, topicQuote, minutes, pointsQuote: maxPts ? pts / maxPts : null, pts, maxPts, bonusPct,
    overall: parts.length ? parts.reduce((a, b) => a + b, 0) / parts.length : null,
  };
}

export function normalizeImport(obj) {
  if (!obj || typeof obj !== "object" || !Array.isArray(obj.modules)) throw new Error("Keine gültige StudyOS-Sicherung: Das Feld „modules“ fehlt.");
  if (Number(obj.version) > DATA_VERSION) throw new Error("Diese Sicherung stammt aus einer neueren StudyOS-Version. Aktualisiere die App, bevor du sie importierst.");
  return migrate(obj);
}

/* ---------------- Beispieldaten ---------------- */
export function demoData() {
  const d = emptyData(), t = iso(), ws = weekStart(t);
  const m = [
    { id: uid(), name: "Einführung in die Informatik (Beispiel)", code: "", ects: 6, semester: 1, status: "belegt", grade: null, color: PALETTE[0] },
    { id: uid(), name: "Diskrete Strukturen (Beispiel)", code: "", ects: 6, semester: 1, status: "belegt", grade: null, color: PALETTE[1] },
    { id: uid(), name: "Lineare Algebra (Beispiel)", code: "", ects: 6, semester: 1, status: "belegt", grade: null, color: PALETTE[2] },
    { id: uid(), name: "Praktikum (Beispiel)", code: "", ects: 6, semester: 1, status: "bestanden", grade: 1.7, color: PALETTE[4] },
  ];
  d.modules = m;
  const slots = [[0, 0, "Vorlesung", "10:00", "12:00"], [1, 1, "Vorlesung", "14:00", "16:00"], [2, 3, "Übung", "12:00", "14:00"], [0, 3, "Übung", "16:00", "18:00"]];
  [-7, 0, 7].forEach((w) => slots.forEach(([mi, day, type, start, end]) => {
    const date = addDays(ws, w + day), past = date < t;
    d.sessions.push({ id: uid(), moduleId: m[mi].id, type, date, start, end, room: "(Beispiel)", prepared: past, attended: past, reviewed: past && mi !== 2, reviewedAt: past && mi !== 2 ? date : null });
  }));
  d.homework = [
    { id: uid(), moduleId: m[0].id, title: "Übungsblatt 1 (Beispiel)", issued: addDays(t, -7), due: addDays(t, 2), status: "in Arbeit", points: null, maxPoints: null, feedback: "" },
    { id: uid(), moduleId: m[1].id, title: "Übungsblatt 1 (Beispiel)", issued: addDays(t, -10), due: addDays(t, -2), status: "bewertet", points: 8, maxPoints: 10, feedback: "", doneAt: addDays(t, -3) },
    { id: uid(), moduleId: m[2].id, title: "Übungsblatt 1 (Beispiel)", issued: addDays(t, -1), due: addDays(t, 5), status: "ausgegeben", points: null, maxPoints: null, feedback: "" },
  ];
  const mk = (mi, titles, states) => titles.forEach((title, i) => d.topics.push({ id: uid(), moduleId: m[mi].id, title, order: i + 1, state: states[i], rating: [1, 3, 2, 0][i] }));
  mk(0, ["Grundbegriffe", "Rekursion", "Datenstrukturen", "Sortieren"], ["sicher", "geübt", "gelernt", "nicht begonnen"]);
  mk(1, ["Aussagenlogik", "Mengen und Relationen", "Kombinatorik", "Graphen"], ["geübt", "gelernt", "nicht begonnen", "nicht begonnen"]);
  d.logs = [
    { id: uid(), date: addDays(t, -1), minutes: 50, moduleId: m[0].id, topicId: "", kind: "Nacharbeiten", note: "" },
    { id: uid(), date: addDays(t, -3), minutes: 75, moduleId: m[1].id, topicId: "", kind: "Übung/Hausaufgabe", note: "" },
    { id: uid(), date: addDays(t, -9), minutes: 40, moduleId: m[2].id, topicId: "", kind: "Nacharbeiten", note: "" },
  ];
  d.cards = [
    { front: "Was ist eine Äquivalenzrelation?", back: "Eine reflexive, symmetrische und transitive Relation." },
    { front: "Wie viele Teilmengen hat eine n-elementige Menge?", back: "2^n" },
    { front: "Was ist ein Baum (Graphentheorie)?", back: "Ein zusammenhängender, kreisfreier Graph." },
  ].map((c) => ({ ...c, id: uid(), moduleId: m[1].id, topicId: "", ease: 2.5, interval: 0, reps: 0, due: t }));
  d.exams = [{ id: uid(), moduleId: m[1].id, date: addDays(t, 24), time: "09:00", room: "(Beispiel)", dailyMinutes: 90, notes: "" }];
  d.notes = [{ id: uid(), moduleId: m[0].id, sessionId: "", title: "Beispielnotiz", text: "Rekursion: Basisfall + Rekursionsschritt.\n\nint fak(int n) {\n  return n <= 1 ? 1 : n * fak(n - 1);\n}", updated: t }];
  return d;
}

/* Volltextsuche über alle Einträge */
export function searchAll(data, q) {
  const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return [];
  const hit = (...parts) => { const s = parts.filter(Boolean).join(" ").toLowerCase(); return terms.every((t) => s.includes(t)); };
  const mod = (id) => data.modules.find((m) => m.id === id);
  const out = [];
  data.modules.forEach((m) => hit(m.name, m.code) && out.push({ kind: "module", label: "Modul", item: m, title: m.name, sub: `${m.ects} ECTS · ${m.status}` }));
  data.homework.forEach((h) => hit(h.title, h.feedback, mod(h.moduleId)?.name) && out.push({ kind: "homework", label: "Hausaufgabe", item: h, title: h.title, sub: `${mod(h.moduleId)?.name || ""} · ${h.status}` }));
  data.topics.forEach((x) => hit(x.title, mod(x.moduleId)?.name) && out.push({ kind: "topic", label: "Thema", item: x, title: x.title, sub: `${mod(x.moduleId)?.name || ""} · ${x.state}` }));
  data.notes.forEach((n) => hit(n.title, n.text) && out.push({ kind: "note", label: "Notiz", item: n, title: n.title, sub: mod(n.moduleId)?.name || "Allgemein" }));
  data.cards.forEach((c) => hit(c.front, c.back) && out.push({ kind: "card", label: "Karte", item: c, title: c.front, sub: mod(c.moduleId)?.name || "" }));
  data.exams.forEach((e) => hit("prüfung klausur", mod(e.moduleId)?.name, e.room, e.notes) && out.push({ kind: "exam", label: "Prüfung", item: e, title: `Prüfung ${mod(e.moduleId)?.name || ""}`, sub: fmt(e.date) }));
  data.logs.forEach((l) => l.note && hit(l.note, l.kind) && out.push({ kind: "log", label: "Lerneinheit", item: l, title: l.note, sub: `${fmt(l.date)} · ${fmtMin(l.minutes)}` }));
  return out.slice(0, 60);
}
