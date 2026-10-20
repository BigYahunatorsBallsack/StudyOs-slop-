/* Fristen für den Erinnerungsdienst. Nur Titel, Modulname und Datum verlassen das Gerät unverschlüsselt. */
import { DONE_HW } from "./constants.js";
import { addDays, fmtMin, fmtShort, iso, sum, wdIdx } from "./util.js";
import { describeChange } from "./feed.js";
import { withoutArchived } from "./study.js";
import { blockReminders } from "./blocks.js";
import { commuteIncomplete, commuteOf, firstSessionOn, isOnline } from "./transit.js";

/* Uhrzeit der Abendfrage „Heute besucht?“ (vor der Nachbereitungs-Erinnerung um 20 Uhr) */
export const ATTEND_TIME = "19:00";

export function deadlinesFromData(all, today = iso()) {
  const data = withoutArchived(all);
  const mod = (id) => data.modules.find((m) => m.id === id)?.name || "";
  const out = [];
  data.homework.forEach((h) => { if (h.due && h.due >= addDays(today, -1) && !h.missed && !DONE_HW.has(h.status)) out.push({ id: h.id, kind: "homework", title: h.title, module: mod(h.moduleId), date: h.due, ...(h.dueTime ? { time: h.dueTime } : {}) }); });
  data.exams.forEach((e) => {
    if (e.date >= today && e.result !== "bestanden") out.push({ id: e.id, kind: "exam", title: "Prüfung", module: mod(e.moduleId), date: e.date, time: e.time || "" });
    if (e.registerBy && !e.registered && e.registerBy >= today) out.push({ id: e.id, kind: "register", title: "Anmeldung", module: mod(e.moduleId), date: e.registerBy });
    if (e.retakeDate && e.result === "nicht bestanden" && e.retakeDate >= today) out.push({ id: e.id, kind: "retake", title: "Wiederholungsprüfung", module: mod(e.moduleId), date: e.retakeDate });
  });
  const settings = all.settings || {};
  if (settings.pushBlocks !== false) out.push(...blockReminders(data, mod, today));
  /* Abends: noch nicht nachbereitete Termine des Tages (für die nächsten 14 Tage vorab, damit es auch klappt, wenn die App an dem Tag nicht geöffnet wird) */
  if (settings.pushReviews !== false) {
    const byDay = new Map();
    data.sessions.forEach((s) => {
      if (s.cancelled || s.reviewed || s.date < today || s.date > addDays(today, 14) || (s.end || s.start || "") > "20:00") return;
      if (!byDay.has(s.date)) byDay.set(s.date, []);
      byDay.get(s.date).push(s);
    });
    for (const [date, list] of byDay) {
      const names = [...new Set(list.map((s) => `${mod(s.moduleId) || "Termin"} (${s.type})`))];
      out.push({ id: `review-${date}`, kind: "review", title: `${list.length} ${list.length === 1 ? "Termin" : "Termine"}`, date, body: names.join(", ") });
    }
  }
  /* Abends: Termine des Tages, die noch nicht als besucht abgehakt sind, mit Knopf „Alle besucht“ (14 Tage vorab wie oben) */
  if (settings.pushAttended !== false) {
    const byDay = new Map();
    data.sessions.forEach((s) => {
      if (s.cancelled || s.attended || s.date < today || s.date > addDays(today, 14) || !s.start || (s.end || s.start) > ATTEND_TIME) return;
      if (!byDay.has(s.date)) byDay.set(s.date, []);
      byDay.get(s.date).push(s);
    });
    for (const [date, list] of byDay) {
      const names = list.sort((a, b) => a.start.localeCompare(b.start)).map((s) => `${s.start} ${mod(s.moduleId) || "Termin"} (${s.type})`);
      out.push({ id: `attend-${date}`, kind: "attend", title: `${list.length} ${list.length === 1 ? "Termin" : "Termine"}`, date, time: ATTEND_TIME, body: names.join(", ") });
    }
  }
  /* Sonntags: Rückblick (Lernzeit, fällige Karten) und Ausblick auf die kommende Woche.
     Lernzeit und Kartenzahl verlassen das Gerät dafür als Zahlen im Nachrichtentext. */
  if (settings.pushWeekly !== false) {
    const sunday = addDays(today, (7 - wdIdx(today) - 1 + 7) % 7);
    const from = addDays(sunday, 1), to = addDays(sunday, 7);
    const hw = data.homework.filter((h) => h.due && h.due >= from && h.due <= to && !DONE_HW.has(h.status)).length;
    const ex = data.exams.filter((e) => e.date >= from && e.date <= to).map((e) => mod(e.moduleId) || "Prüfung");
    const ses = data.sessions.filter((s) => !s.cancelled && s.date >= from && s.date <= to).length;
    const parts = [hw ? `${hw} ${hw === 1 ? "Abgabe" : "Abgaben"}` : "keine Abgaben", ex.length ? `Prüfung: ${ex.join(", ")}` : null, ses ? `${ses} ${ses === 1 ? "Termin" : "Termine"}` : null].filter(Boolean);
    const minutes = (a, b) => sum(data.logs.filter((l) => l.date >= a && l.date <= b), (l) => Number(l.minutes) || 0);
    const now = minutes(addDays(sunday, -6), sunday), prev = minutes(addDays(sunday, -13), addDays(sunday, -7));
    const cards = data.cards.filter((c) => (c.due || "") <= from).length;
    const back = [now ? `${fmtMin(now)} gelernt${prev ? ` (Vorwoche ${fmtMin(prev)})` : ""}` : "diese Woche noch nichts eingetragen", cards ? `${cards} ${cards === 1 ? "Karte" : "Karten"} fällig` : null].filter(Boolean);
    out.push({ id: `weekly-${sunday}`, kind: "weekly", title: "Wochenausblick", date: sunday, body: `Nächste Woche: ${parts.join(", ")}. Rückblick: ${back.join(", ")}.` });
  }
  /* Morgens: Termine, Abgaben und Prüfungen des Tages und fällige Karten in einer Nachricht (für die nächsten 7 Tage vorab) */
  if (settings.pushMorning !== false) {
    const time = /^\d{2}:\d{2}$/.test(settings.morningTime || "") ? settings.morningTime : "07:00";
    for (let i = 0; i < 7; i++) {
      const day = addDays(today, i), body = morningBody(data, day, mod);
      if (body) out.push({ id: `morning-${day}`, kind: "morning", title: "Dein Tag", date: day, time, body });
    }
  }
  /* Stundenplan-Abo: geänderte oder ausfallende Termine gleich melden (an alle Geräte, auch wenn es hier entdeckt wurde) */
  if (settings.pushChanges !== false) {
    data.sessions.forEach((s) => {
      if (!s.change?.at || s.date < today) return;
      const at = new Date(s.change.at);
      if (Number.isNaN(at.getTime()) || Date.now() - at.getTime() > 12 * 3600 * 1000) return;
      const hm = `${String(at.getHours()).padStart(2, "0")}:${String(at.getMinutes()).padStart(2, "0")}`;
      out.push({ id: `${s.id}-${s.change.at}`, kind: "change", title: `${mod(s.moduleId) || s.type || "Termin"}, ${fmtShort(s.date)} ${s.start || ""}`.trim(), date: iso(at), time: hm, body: describeChange(s) });
    });
  }
  /* Weg zur Uni: erste Veranstaltung der nächsten 7 Tage mit Haltestellen und Zeiten, damit der Server vor
     der Abfahrt die Echtzeit prüfen kann (nur wenn eingeschaltet) */
  const c = commuteOf(settings);
  const transit = !!c && c.mode !== "car" && !commuteIncomplete(c); /* mit dem Auto gibt es keinen Fahrplan zu prüfen, ohne Haltestelle nichts abzufragen */
  const pick = (l) => ({ station: { id: l.station.id }, line: l.line || "", towards: l.towards || "", avoid: l.avoid || "", travel: Number(l.travel) || 0 });
  const commute = transit ? { ...pick(c), walk: Number(c.walk) || 0, buffer: Number(c.buffer) || 0, feeder: c.feeder ? { ...pick(c.feeder), transfer: Number(c.feeder.transfer) || 0 } : null } : null;
  if (settings.pushCommute && transit) {
    for (let i = 0; i < 7; i++) {
      const day = addDays(today, i), first = firstSessionOn(data.sessions, day);
      if (first) out.push({ id: `weg-${day}`, kind: "commute", title: mod(first.moduleId) || first.type || "Vorlesung", date: day, time: first.start, commute });
    }
  }
  /* „Jetzt losgehen“: an Tagen, deren erster Termin vor Ort ist, rechnet der Server kurz vorher mit Echtzeit bzw.
     Verkehrslage aus, wann man los muss (an, sobald „Weg zur Uni“ eingerichtet ist). Mit dem Auto gehen Start und Ziel mit. */
  if (c && settings.pushLeave !== false && !commuteIncomplete(c)) {
    const how = c.mode === "car"
      ? { mode: "car", buffer: Number(c.buffer) || 0, car: { from: String(c.car.from).trim(), to: String(c.car.to).trim(), park: Number(c.car.park) || 0 } }
      : { mode: "transit", ...commute };
    for (let i = 0; i < 7; i++) {
      const day = addDays(today, i), first = firstSessionOn(data.sessions, day);
      if (first && !isOnline(first)) out.push({ id: `los-${day}`, kind: "leave", title: mod(first.moduleId) || first.type || "Vorlesung", date: day, time: first.start, commute: how });
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
}

/** Text des Tagesüberblicks oder "" (dann gibt es keine Nachricht) */
export function morningBody(data, day, mod) {
  const ses = data.sessions.filter((s) => s.date === day && !s.cancelled && s.start).sort((a, b) => a.start.localeCompare(b.start));
  const hw = data.homework.filter((h) => h.due === day && !h.missed && !DONE_HW.has(h.status));
  const ex = data.exams.filter((e) => e.date === day && e.result !== "bestanden");
  const cards = data.cards.filter((c) => (c.due || "") <= day).length;
  const parts = [
    ex.length ? `Prüfung: ${ex.map((e) => `${mod(e.moduleId) || "Prüfung"}${e.time ? ` um ${e.time}` : ""}`).join(", ")}` : "",
    ses.length ? ses.map((s) => `${s.start} ${mod(s.moduleId) || s.type}`).join(", ") : "",
    hw.length ? `Abgabe: ${hw.map((h) => `${h.title}${h.dueTime ? ` bis ${h.dueTime}` : ""}`).join(", ")}` : "",
  ].filter(Boolean);
  if (!parts.length) return "";
  return parts.join(". ") + (cards ? `. ${cards} ${cards === 1 ? "Karte" : "Karten"} fällig.` : ".");
}

export const deadlinesKey = (list) => JSON.stringify(list);

/** base64url → Uint8Array (für applicationServerKey) */
export function keyBytes(b64url) {
  const s = b64url.replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(s + "===".slice((s.length + 3) % 4)), (c) => c.charCodeAt(0));
}

/** Kann dieses Gerät überhaupt Push? Liefert null oder einen Grund. */
export function pushBlocker() {
  if (typeof window === "undefined") return "Kein Browser.";
  const ios = /iPhone|iPad|iPod/i.test(navigator.userAgent || "") || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const standalone = window.matchMedia?.("(display-mode: standalone)").matches || navigator.standalone === true;
  if (ios && !standalone) return "Auf iPhone und iPad gehen Erinnerungen nur in der installierten App: in Safari auf Teilen, dann „Zum Home-Bildschirm“, und StudyOS von dort öffnen.";
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return "Dieser Browser unterstützt keine Push-Benachrichtigungen.";
  if (Notification.permission === "denied") return "Benachrichtigungen sind für StudyOS blockiert. Erlaube sie in den Browser- bzw. System-Einstellungen.";
  return null;
}
