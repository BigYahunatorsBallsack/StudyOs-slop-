/* „Als Nächstes“: das eine Ding, das gerade am wichtigsten ist.
   Reihenfolge: laufender Termin > Prüfung heute/morgen > überfällige oder heute fällige Abgabe >
   nächster Termin heute > Abgabe morgen > nächster Termin in den kommenden Tagen > nichts Dringendes. */
import { isActive, isOpenHw } from "./data.js";
import { toMin } from "./blocks.js";
import { addDays, byTime, diffDays, iso, nowHM } from "./util.js";

export const inWords = (mins) => (mins < 1 ? "jetzt" : mins < 60 ? `in ${mins} min` : mins < 180 ? `in ${Math.floor(mins / 60)} h ${mins % 60 ? (mins % 60) + " min" : ""}`.trim() : null);

export function nextUp(data, today = iso(), now = nowHM()) {
  const nowMin = toMin(now);
  const ses = data.sessions.filter(isActive).sort(byTime);
  const running = ses.find((s) => s.date === today && toMin(s.start) <= nowMin && nowMin < toMin(s.end || s.start));
  if (running) return { type: "session", item: running, moduleId: running.moduleId, when: `Läuft gerade, noch ${toMin(running.end) - nowMin} min`, live: true };

  const exam = data.exams.filter((e) => e.date >= today && diffDays(today, e.date) <= 1 && (e.date > today || toMin(e.time || "23:59") >= nowMin)).sort((a, b) => (a.date + (a.time || "")).localeCompare(b.date + (b.time || "")))[0];
  if (exam) return { type: "exam", item: exam, moduleId: exam.moduleId, when: exam.date === today ? `Prüfung heute um ${exam.time || "–"}` : `Prüfung morgen um ${exam.time || "–"}` };

  const open = data.homework.filter((h) => h.due && isOpenHw(h)).sort((a, b) => a.due.localeCompare(b.due));
  const urgent = open.find((h) => h.due <= today);
  if (urgent) return { type: "homework", item: urgent, moduleId: urgent.moduleId, when: urgent.due < today ? `Überfällig seit ${diffDays(urgent.due, today)} ${diffDays(urgent.due, today) === 1 ? "Tag" : "Tagen"}` : `Abgabe heute${urgent.dueTime ? ` ${urgent.dueTime}` : ""}` };

  const laterToday = ses.find((s) => s.date === today && toMin(s.start) > nowMin);
  if (laterToday) {
    const mins = toMin(laterToday.start) - nowMin;
    return { type: "session", item: laterToday, moduleId: laterToday.moduleId, when: inWords(mins) || `Heute um ${laterToday.start}` };
  }

  const tomorrowHw = open.find((h) => h.due === addDays(today, 1));
  if (tomorrowHw) return { type: "homework", item: tomorrowHw, moduleId: tomorrowHw.moduleId, when: `Abgabe morgen${tomorrowHw.dueTime ? ` ${tomorrowHw.dueTime}` : ""}` };

  const soon = ses.find((s) => s.date > today && s.date <= addDays(today, 3));
  if (soon) {
    const d = diffDays(today, soon.date);
    return { type: "session", item: soon, moduleId: soon.moduleId, when: d === 1 ? `Morgen um ${soon.start}` : `In ${d} Tagen um ${soon.start}` };
  }
  return { type: "calm" };
}
