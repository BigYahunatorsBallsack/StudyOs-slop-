/* Großer Datenstand „nach vier Jahren Studium“ für Skalierungstests: 8 Semester, 60 Module (die ersten 6 Semester archiviert),
   3000 Termine, 20000 Lerneinheiten, 8000 Karten mit Wiederholungsverlauf, 1500 verlinkte Notizen, 400 Hausaufgaben,
   voller Papierkorb. Deterministisch (fester Zufall), Datumswerte relativ zu `today` (JJJJ-MM-TT). */
export function bigData(today, scale = 1) {
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  const day = (n) => { const d = new Date(today + 'T12:00:00'); d.setDate(d.getDate() + n); return d.toLocaleDateString('sv-SE'); };
  const n = (x) => Math.round(x * scale);
  const stamp = (d) => d + 'T10:00:00.000Z';
  const words = ['Graph', 'Baum', 'Matrix', 'Vektor', 'Integral', 'Reihe', 'Gruppe', 'Ring', 'Körper', 'Automat', 'Sprache', 'Turing', 'Heap', 'Hash', 'Sortieren', 'Rekursion', 'Induktion', 'Beweis', 'Lemma', 'Satz'];
  const kinds = ['Nacharbeiten', 'Vorbereiten', 'Übung/Hausaufgabe', 'Klausurvorbereitung', 'Karteikarten', 'Aufzeichnung', 'Besucht', 'Sonstiges'];
  const colors = ['#38bdf8', '#34d399', '#fbbf24', '#fb7185', '#a78bfa', '#2dd4bf', '#fb923c', '#a3e635', '#f472b6', '#60a5fa'];
  /* Semester s (1–8) beginnt (8 - s) * 26 Wochen vor heute; Semester 8 läuft gerade */
  const semStart = (s) => -(8 - s) * 182 - 14;
  const modules = [];
  for (let i = 0; i < 60; i++) {
    const sem = 1 + Math.floor(i / 7.5);
    const old = sem <= 6;
    modules.push({ id: 'm' + i, name: `${pick(words)} und ${pick(words)} ${i + 1}`, code: 'IN' + (1000 + i), ects: pick([5, 6, 8, 10]), semester: sem,
      status: old ? (rnd() < 0.9 ? 'bestanden' : 'nicht bestanden') : sem === 7 ? 'bestanden' : 'belegt', grade: old ? pick([1.0, 1.3, 1.7, 2.0, 2.3, 2.7, 3.0]) : null,
      color: colors[i % colors.length], bonusPct: null, archived: old, updated: stamp(day(semStart(sem))) });
  }
  const modOf = (sem) => modules.filter((m) => m.semester === sem);
  const sessions = [];
  const types = ['Vorlesung', 'Übung', 'Tutorium', 'Zentralübung'];
  for (let i = 0; i < n(3000); i++) {
    const sem = 1 + (i % 8), m = pick(modOf(sem));
    const date = day(semStart(sem) + Math.floor(rnd() * 120));
    const past = date < today;
    const h = 8 + 2 * Math.floor(rnd() * 5);
    sessions.push({ id: 's' + i, moduleId: m.id, type: pick(types), date, start: `${String(h).padStart(2, '0')}:15`, end: `${String(h + 1).padStart(2, '0')}:45`, room: 'MI HS ' + (1 + (i % 3)),
      seriesId: 'ser' + (i % 400), cancelled: rnd() < 0.03, prepared: past, attended: past && rnd() < 0.8, reviewed: past && rnd() < 0.6, reviewedAt: past ? date : null, updated: stamp(date) });
  }
  const homework = [];
  for (let i = 0; i < n(400); i++) {
    const sem = 1 + (i % 8), m = pick(modOf(sem)), issued = day(semStart(sem) + Math.floor(rnd() * 110)), due = day(semStart(sem) + Math.floor(rnd() * 110) + 7);
    const done = due < today;
    homework.push({ id: 'h' + i, moduleId: m.id, title: `Übungsblatt ${1 + (i % 12)}`, issued, due, status: done ? pick(['abgegeben', 'bewertet']) : pick(['ausgegeben', 'in Arbeit']),
      points: done ? Math.floor(rnd() * 20) : null, maxPoints: 20, feedback: done ? 'Gut gemacht' : '', doneAt: done ? due : undefined,
      subtasks: [{ id: 'st' + i + 'a', title: 'Aufgabe 1', done }, { id: 'st' + i + 'b', title: 'Aufgabe 2', done: false }], updated: stamp(issued) });
  }
  const topics = [];
  for (let i = 0; i < n(1200); i++) topics.push({ id: 't' + i, moduleId: 'm' + (i % 60), title: `${pick(words)} ${i}`, order: i, state: pick(['nicht begonnen', 'gelernt', 'geübt', 'sicher']), rating: Math.floor(rnd() * 4) });
  const logs = [];
  for (let i = 0; i < n(20000); i++) {
    const back = Math.floor(rnd() * 1470);
    const m = modules[Math.min(59, Math.floor((1470 - back) / 1470 * 60))];
    logs.push({ id: 'l' + i, date: day(-back), minutes: 15 + Math.floor(rnd() * 90), moduleId: m.id, topicId: rnd() < 0.3 ? 't' + (i % 1200) : '', kind: pick(kinds), note: rnd() < 0.2 ? `${pick(words)} wiederholt` : '', updated: stamp(day(-back)) });
  }
  const notes = [];
  const noteCount = n(1500);
  for (let i = 0; i < noteCount; i++) {
    const links = [0, 1, 2].map(() => `[[Notiz ${Math.floor(rnd() * noteCount)}]]`).join(', ');
    notes.push({ id: 'n' + i, moduleId: 'm' + (i % 60), sessionId: '', title: `Notiz ${i}`, text: `# ${pick(words)}\n\nSiehe ${links}.\n\n${'Lorem ipsum dolor sit amet. '.repeat(8)}\n\n- ${pick(words)}\n- ${pick(words)}`, updated: day(-Math.floor(rnd() * 1400)) });
  }
  const cards = [];
  for (let i = 0; i < n(8000); i++) {
    const last = -Math.floor(rnd() * 400), ivl = 1 + Math.floor(rnd() * 200), m = modules[i % 60];
    cards.push({ id: 'c' + i, moduleId: m.id, topicId: '', front: `Was ist ${pick(words)} ${i}?`, back: `${pick(words)} ist ${pick(words)}.`, tags: pick(['', 'klausur', 'definition, satz']),
      ease: 2.5, interval: ivl, reps: 1 + Math.floor(rnd() * 12), lapses: Math.floor(rnd() * 3), reviews: 2 + Math.floor(rnd() * 20), stability: Math.round(rnd() * 300 * 1000) / 1000,
      difficulty: Math.round((1 + rnd() * 9) * 1000) / 1000, lastReview: day(last), due: day(last + ivl), updated: stamp(day(last)) });
  }
  const exams = modules.map((m, i) => ({ id: 'e' + i, moduleId: m.id, date: day(semStart(m.semester) + 130), time: '09:00', room: 'MW 0001', dailyMinutes: 60, notes: '', attempt: 1, freeWeekdays: [] }));
  const blocks = [];
  for (let i = 0; i < n(300); i++) blocks.push({ id: 'b' + i, moduleId: 'm' + (52 + (i % 8)), date: day(-150 + Math.floor(rnd() * 160)), start: '14:00', end: '15:30', title: 'Lernblock' });
  /* Papierkorb: 200 Einträge (Höchstzahl) aus den letzten 30 Tagen, je mit ein paar gelöschten Lerneinheiten */
  const trash = [];
  for (let i = 0; i < 200; i++) {
    const at = new Date(Date.now() - (i + 1) * 3 * 3600000).toISOString();
    const removed = { logs: [0, 1, 2, 3, 4].map((k) => ({ id: `tl${i}-${k}`, date: today, minutes: 30, moduleId: 'm55', topicId: '', kind: 'Nacharbeiten', note: 'gelöscht' })) };
    trash.push({ id: 'tr' + i, at, label: `Gelöscht ${i}`, named: true, coll: 'logs', count: 5, removed, changed: {} });
  }
  const deleted = [];
  for (let i = 0; i < 2000; i++) deleted.push({ c: 'logs', id: 'old' + i, at: new Date(Date.now() - (i % 80) * 86400000).toISOString() });
  return {
    version: 3, settings: { defaultsRev: 2, name: 'Test', university: 'TUM', program: 'Informatik', targetEcts: 180 },
    meta: { lastBackup: new Date().toISOString(), lastModule: 'm55', trash },
    modules, sessions, homework, topics, logs, notes, cards, exams, blocks, deleted,
  };
}
