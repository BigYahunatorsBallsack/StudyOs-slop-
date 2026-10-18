import { describe, it, expect } from "vitest";
import { schedule, hasCloze, renderCloze, parseTags, allTags, parseCsv, parseCardsCsv, cardsToCsv } from "../../src/lib/cards.js";
import { buildPlan, effortOf } from "../../src/lib/plan.js";
import { parseICS, buildICS } from "../../src/lib/ics.js";
import { migrate, emptyData, normalizeImport, moduleStats, streakOf } from "../../src/lib/data.js";
import { stampChanges, mergeData } from "../../src/lib/sync.js";
import { encryptBackup, decryptBackup, isEncryptedBackup } from "../../src/lib/crypto.js";
import { heatmap, minutesBySemester, gradeTimeline, examDeadlines } from "../../src/lib/stats.js";
import { addDays, iso, wdIdx } from "../../src/lib/util.js";
import { DATA_VERSION } from "../../src/lib/constants.js";

const T = "2026-10-19"; /* ein Montag */

describe("schedule (SM-2)", () => {
  it("setzt bei 'Nochmal' zurück und senkt die Leichtigkeit", () => {
    const r = schedule({ ease: 2.5, interval: 10, reps: 4 }, 0, T);
    expect(r).toMatchObject({ interval: 0, reps: 0, ease: 2.3, due: T, lastReview: T });
  });
  it("wächst bei 'Gut' mit der Leichtigkeit", () => {
    let c = { ease: 2.5, interval: 0, reps: 0 };
    c = { ...c, ...schedule(c, 2, T) }; expect(c.interval).toBe(1);
    c = { ...c, ...schedule(c, 2, T) }; expect(c.interval).toBe(3);
    c = { ...c, ...schedule(c, 2, T) }; expect(c.interval).toBe(8);
    expect(c.due).toBe(addDays(T, 8));
  });
  it("hält die Leichtigkeit bei mindestens 1,3", () => {
    let c = { ease: 1.35, interval: 5, reps: 3 };
    for (let i = 0; i < 5; i++) c = { ...c, ...schedule(c, 1, T) };
    expect(c.ease).toBe(1.3);
  });
});

describe("Lückentext und Tags", () => {
  it("erkennt und rendert Lücken", () => {
    const f = "Die Laufzeit von Mergesort ist {{c1::O(n log n)::Landau}}.";
    expect(hasCloze(f)).toBe(true);
    expect(hasCloze("ohne Lücke")).toBe(false);
    expect(renderCloze(f, false)).toBe("Die Laufzeit von Mergesort ist **[Landau]**.");
    expect(renderCloze(f, true)).toBe("Die Laufzeit von Mergesort ist **O(n log n)**.");
  });
  it("normalisiert Tags", () => {
    expect(parseTags("Graphen, BFS ;graphen, Kürzeste Wege")).toEqual(["graphen", "bfs", "kürzeste-wege"]);
    expect(allTags([{ tags: "b, a" }, { tags: "a" }, {}])).toEqual(["a", "b"]);
  });
});

describe("CSV", () => {
  it("parst Anführungszeichen, Umbrüche und erkennt das Trennzeichen", () => {
    expect(parseCsv('a;"b;c"\n"x ""y""";"mehr\nzeilen"\n')).toEqual([["a", "b;c"], ['x "y"', "mehr\nzeilen"]]);
    expect(parseCsv("a,b\r\nc,d")).toEqual([["a", "b"], ["c", "d"]]);
    expect(parseCsv("a\tb")).toEqual([["a", "b"]]);
  });
  it("liest Karten, überspringt Kopfzeile und ungültige Zeilen", () => {
    const { cards, skipped } = parseCardsCsv("Vorderseite;Rückseite;Tags\nFrage;Antwort;x, y\nnur vorne;\n{{c1::Lücke}};;z");
    expect(cards).toEqual([{ front: "Frage", back: "Antwort", tags: "x, y" }, { front: "{{c1::Lücke}}", back: "", tags: "z" }]);
    expect(skipped).toEqual([2]);
  });
  it("übersteht einen Export-Import-Durchlauf", () => {
    const src = [{ front: 'Was ist "P"?', back: "Klasse;\nmit Umbruch", tags: "komplexität", moduleId: "m" }];
    const { cards } = parseCardsCsv(cardsToCsv(src, () => "Theo"));
    expect(cards[0]).toEqual({ front: src[0].front, back: src[0].back, tags: "komplexität" });
  });
});

describe("Lernplan", () => {
  const data = { topics: [
    { id: "a", moduleId: "m", title: "A", state: "nicht begonnen", effort: 3, order: 1 },
    { id: "b", moduleId: "m", title: "B", state: "gelernt", effort: 1, order: 2 },
    { id: "c", moduleId: "m", title: "C", state: "sicher", order: 3 },
    { id: "d", moduleId: "m", title: "D", state: "nicht begonnen", effort: 1, order: 4 },
  ] };
  it("lässt sichere Themen weg, legt die Gesamtwiederholung auf den Vortag", () => {
    const plan = buildPlan(data, { moduleId: "m", date: addDays(T, 5) }, T);
    expect(plan).toHaveLength(5);
    expect(plan.at(-1)).toMatchObject({ date: addDays(T, 4), final: true });
    expect(plan.flatMap((d) => d.topics.map((x) => x.id)).sort()).toEqual(["a", "b", "d"]);
  });
  it("lässt freie Wochentage frei", () => {
    const plan = buildPlan(data, { moduleId: "m", date: addDays(T, 8), freeWeekdays: [5, 6] }, T);
    const weekend = plan.filter((d) => !d.final && wdIdx(d.date) >= 5);
    expect(weekend.length).toBeGreaterThan(0);
    weekend.forEach((d) => { expect(d.free).toBe(true); expect(d.topics).toEqual([]); });
  });
  it("verteilt das Tagesbudget nach Aufwand", () => {
    const plan = buildPlan(data, { moduleId: "m", date: addDays(T, 2), dailyMinutes: 120 }, T);
    const day = plan[0];
    expect(day.topics.map((x) => [x.id, x.minutes])).toEqual([["a", 70], ["d", 25], ["b", 25]]);
    expect(effortOf({})).toBe(2);
  });
  it("liefert nichts für vergangene Prüfungen", () => {
    expect(buildPlan(data, { moduleId: "m", date: T }, T)).toEqual([]);
  });
});

describe("ICS", () => {
  it("löst BYDAY, COUNT und EXDATE auf", () => {
    const ics = "BEGIN:VCALENDAR\nBEGIN:VEVENT\nSUMMARY:Algo\nDTSTART:20261019T100000\nDTEND:20261019T113000\nRRULE:FREQ=WEEKLY;BYDAY=MO,WE;COUNT=4\nEXDATE:20261021T100000\nEND:VEVENT\nEND:VCALENDAR";
    expect(parseICS(ics).map((e) => e.date)).toEqual(["2026-10-19", "2026-10-26", "2026-10-28"]);
  });
  it("respektiert UNTIL und INTERVAL", () => {
    const ics = "BEGIN:VEVENT\nSUMMARY:Ü\nDTSTART:20261020T080000\nRRULE:FREQ=WEEKLY;INTERVAL=2;UNTIL=20261201T000000Z\nEND:VEVENT";
    expect(parseICS(ics).map((e) => e.date)).toEqual(["2026-10-20", "2026-11-03", "2026-11-17", "2026-12-01"]);
  });
  it("exportiert gültige Termine mit Escaping", () => {
    const d = { ...emptyData(), modules: [{ id: "m", name: "Lineare Algebra, Teil 1" }], homework: [{ id: "h", moduleId: "m", title: "Blatt; 3", due: "2026-11-02", status: "ausgegeben" }] };
    const out = buildICS(d);
    expect(out).toContain("SUMMARY:Abgabe: Blatt\\; 3 (Lineare Algebra\\, Teil 1)");
    expect(out.split("\r\n").filter((l) => l === "BEGIN:VEVENT")).toHaveLength(1);
    expect(out.endsWith("END:VCALENDAR\r\n")).toBe(true);
  });
});

describe("Datenformat", () => {
  it("migriert alte Stände und ergänzt Standardwerte", () => {
    const d = migrate({ version: 1, modules: [{ id: "m", name: "X" }], cards: [{ id: "c" }], exams: [{ id: "e" }], junk: 1, sessions: [null, { id: "s" }] });
    expect(d.version).toBe(DATA_VERSION);
    expect(d.modules[0].color).toBeTruthy();
    expect(d.cards[0]).toMatchObject({ ease: 2.5, reps: 0 });
    expect(d.exams[0]).toMatchObject({ attempt: 1, freeWeekdays: [] });
    expect(d.sessions).toHaveLength(1);
    expect(d.deleted).toEqual([]);
  });
  it("lehnt neuere Datenversionen und kaputte Dateien ab", () => {
    expect(() => normalizeImport({ version: DATA_VERSION + 1, modules: [] })).toThrow(/neueren/);
    expect(() => normalizeImport({ foo: 1 })).toThrow(/modules/);
  });
  it("berechnet Modulquoten", () => {
    const d = { ...emptyData(), modules: [{ id: "m" }], homework: [
      { id: "1", moduleId: "m", status: "bewertet", points: 8, maxPoints: 10 },
      { id: "2", moduleId: "m", status: "ausgegeben" },
    ] };
    const s = moduleStats(d, "m");
    expect(s.hwQuote).toBe(0.5);
    expect(s.pointsQuote).toBe(0.8);
  });
  it("zählt die Lernserie", () => {
    const t = iso();
    expect(streakOf([{ date: t, minutes: 10 }, { date: addDays(t, -1), minutes: 5 }, { date: addDays(t, -3), minutes: 5 }])).toBe(2);
  });
});

describe("Sync", () => {
  const base = () => ({ ...emptyData(), modules: [{ id: "m1", name: "A" }, { id: "m2", name: "B" }] });
  it("stempelt geänderte Einträge und legt Grabsteine an", () => {
    const prev = base();
    const next = { ...prev, modules: [{ ...prev.modules[0], name: "A2" }] };
    const out = stampChanges(prev, next, "2026-10-17T10:00:00.000Z");
    expect(out.modules[0].updated).toBe("2026-10-17T10:00:00.000Z");
    expect(out.deleted).toEqual([{ c: "modules", id: "m2", at: "2026-10-17T10:00:00.000Z" }]);
    expect(stampChanges(prev, prev)).toBe(prev);
  });
  it("lässt unveränderte Einträge unangetastet", () => {
    const prev = base();
    const next = { ...prev, modules: [prev.modules[0], { ...prev.modules[1], name: "B2" }] };
    const out = stampChanges(prev, next, "2026-10-17T10:00:00.000Z");
    expect(out.modules[0]).toBe(prev.modules[0]);
  });
  it("führt zusammen: Neuere Änderung gewinnt, Löschung gewinnt, Neues kommt dazu", () => {
    const a = { ...base(), modules: [
      { id: "m1", name: "A-alt", updated: "2026-10-01T00:00:00.000Z" },
      { id: "m2", name: "B", updated: "2026-10-01T00:00:00.000Z" },
    ], logs: [{ id: "l1", minutes: 10, updated: "2026-10-02T00:00:00.000Z" }] };
    const b = { ...base(), modules: [
      { id: "m1", name: "A-neu", updated: "2026-10-05T00:00:00.000Z" },
      { id: "m3", name: "C", updated: "2026-10-05T00:00:00.000Z" },
    ], deleted: [{ c: "modules", id: "m2", at: "2026-10-03T00:00:00.000Z" }] };
    const { data, stats } = mergeData(a, b, "2026-10-17T00:00:00.000Z");
    expect(data.modules.map((m) => m.name).sort()).toEqual(["A-neu", "C"]);
    expect(data.logs).toHaveLength(1);
    expect(stats).toEqual({ added: 1, updated: 1, removed: 1 });
  });
  it("Änderung nach einer Löschung gewinnt gegen die Löschung", () => {
    const a = { ...base(), modules: [{ id: "m1", name: "lebt", updated: "2026-10-09T00:00:00.000Z" }] };
    const b = { ...base(), modules: [], deleted: [{ c: "modules", id: "m1", at: "2026-10-08T00:00:00.000Z" }] };
    expect(mergeData(a, b).data.modules).toHaveLength(1);
  });
  it("ist kommutativ bei den Einträgen", () => {
    const a = { ...base(), modules: [{ id: "x", name: "1", updated: "2026-10-02T00:00:00.000Z" }] };
    const b = { ...base(), modules: [{ id: "x", name: "2", updated: "2026-10-03T00:00:00.000Z" }, { id: "y", updated: "2026-10-01T00:00:00.000Z" }] };
    const ab = mergeData(a, b).data.modules.map((m) => m.id + m.name).sort();
    const ba = mergeData(b, a).data.modules.map((m) => m.id + m.name).sort();
    expect(ab).toEqual(ba);
  });
});

describe("Verschlüsselung", () => {
  it("verschlüsselt und entschlüsselt verlustfrei", async () => {
    const obj = { modules: [{ id: "m", name: "Ümlaut ✓" }] };
    const env = await encryptBackup(obj, "geheim", 20000);
    expect(isEncryptedBackup(env)).toBe(true);
    expect(JSON.stringify(env)).not.toContain("Ümlaut");
    expect(await decryptBackup(env, "geheim")).toEqual(obj);
  });
  it("lehnt falsche Passphrasen und manipulierte Daten ab", async () => {
    const env = await encryptBackup({ a: 1 }, "richtig", 20000);
    await expect(decryptBackup(env, "falsch")).rejects.toThrow(/Falsche Passphrase/);
    const tampered = { ...env, data: env.data.slice(0, -4) + (env.data.endsWith("AAAA") ? "BBBB" : "AAAA") };
    await expect(decryptBackup(tampered, "richtig")).rejects.toThrow();
    await expect(decryptBackup({ ...env, iterations: 5 }, "richtig")).rejects.toThrow(/Schlüsselparameter/);
  });
});

describe("Statistik", () => {
  it("baut ein Aktivitätsraster bis heute", () => {
    const h = heatmap([{ date: T, minutes: 45 }, { date: addDays(T, -1), minutes: 150 }], 4, T);
    expect(h).toHaveLength(4);
    expect(h[3][0]).toMatchObject({ date: T, minutes: 45, level: 2 });
    expect(h[2][6]).toMatchObject({ minutes: 150, level: 4 });
    expect(h[3][1].future).toBe(true);
  });
  it("summiert Lernzeit je Semester und den Notenverlauf", () => {
    const d = { modules: [
      { id: "a", semester: 1, status: "bestanden", grade: 1.0, ects: 6 },
      { id: "b", semester: 2, status: "bestanden", grade: 3.0, ects: 6 },
      { id: "c", semester: 2, status: "belegt", ects: 8 },
    ], logs: [{ moduleId: "a", minutes: 30 }, { moduleId: "c", minutes: 20 }, { moduleId: "", minutes: 99 }] };
    expect(minutesBySemester(d)).toEqual([{ semester: 1, minutes: 30 }, { semester: 2, minutes: 20 }]);
    expect(gradeTimeline(d)).toEqual([{ semester: 1, ects: 6, avg: 1 }, { semester: 2, ects: 12, avg: 2 }]);
  });
  it("meldet anstehende Prüfungsfristen", () => {
    const d = { exams: [
      { id: "1", registerBy: addDays(T, 3) },
      { id: "2", registerBy: addDays(T, 3), registered: true },
      { id: "3", retakeDate: addDays(T, 10), result: "nicht bestanden" },
      { id: "4", registerBy: addDays(T, 30) },
    ] };
    expect(examDeadlines(d, T).map((x) => [x.exam.id, x.kind])).toEqual([["1", "anmeldung"], ["3", "wiederholung"]]);
  });
});

describe("Lernplan mit Altklausuren", () => {
  it("legt offene Altklausuren auf die letzten Lerntage, eine pro Tag", () => {
    const T2 = "2026-10-19";
    const plan = buildPlan({ topics: [] }, { moduleId: "m", date: addDays(T2, 6), oldExams: [
      { id: "a", title: "WS 24/25", status: "offen" }, { id: "b", title: "SS 25", status: "gerechnet" }, { id: "c", title: "WS 25/26", status: "offen" },
    ] }, T2);
    const withExam = plan.filter((d) => d.oldExam).map((d) => [d.date, d.oldExam.id]);
    expect(withExam).toEqual([[addDays(T2, 3), "a"], [addDays(T2, 4), "c"]]);
    expect(plan.at(-1).final).toBe(true);
  });
  it("mehr Altklausuren als Tage: nur so viele wie Platz ist", () => {
    const plan = buildPlan({ topics: [] }, { moduleId: "m", date: "2026-10-21", oldExams: [1, 2, 3, 4].map((i) => ({ id: "x" + i, title: "K" + i })) }, "2026-10-19");
    expect(plan.filter((d) => d.oldExam).length).toBe(1);
  });
});
