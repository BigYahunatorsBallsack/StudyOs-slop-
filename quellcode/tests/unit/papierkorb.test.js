import { describe, it, expect, vi, afterEach } from "vitest";
import { addTrash, pruneTrash, purgeTrash, restoreTrash, trashEntry, trashOf } from "../../src/lib/trash.js";
import { dragTo, movePatch, slotAt } from "../../src/lib/gridmove.js";
import { emptyData, searchAll } from "../../src/lib/data.js";
import { stampChanges, mergeData } from "../../src/lib/sync.js";
import { dayOf } from "../../src/lib/util.js";

afterEach(() => vi.useRealTimers());

const base = () => ({ ...emptyData(),
  modules: [{ id: "m1", name: "Diskrete Strukturen", code: "IN0015", ects: 8 }],
  homework: [{ id: "h1", moduleId: "m1", title: "Blatt 3", due: "2026-10-23", status: "ausgegeben" }],
  logs: [{ id: "l1", moduleId: "m1", topicId: "", date: "2026-10-20", minutes: 30, kind: "Übung" }],
});

describe("Papierkorb", () => {
  it("merkt sich Gelöschtes samt gelöster Verknüpfungen und holt es zurück", () => {
    const before = base();
    const after = { ...before, modules: [], homework: [], logs: before.logs.map((l) => ({ ...l, moduleId: "" })) };
    const entry = trashEntry(before, after, { at: "2026-10-20T10:00:00.000Z" });
    expect(entry).toMatchObject({ label: "Diskrete Strukturen", coll: "modules", count: 2 });
    const withTrash = addTrash(after, entry);
    expect(trashOf(withTrash, new Date("2026-10-21T00:00:00Z"))).toHaveLength(1);
    const back = restoreTrash(withTrash, entry.id);
    expect(back.modules.map((m) => m.id)).toEqual(["m1"]);
    expect(back.homework.map((h) => h.id)).toEqual(["h1"]);
    expect(back.logs[0].moduleId).toBe("m1");
    expect(back.meta.trash).toEqual([]);
  });

  it("überschreibt beim Zurückholen keine Verknüpfung, die inzwischen neu gesetzt wurde", () => {
    const before = base();
    const after = { ...before, modules: [], logs: before.logs.map((l) => ({ ...l, moduleId: "" })) };
    const d = addTrash(after, trashEntry(before, after));
    const moved = { ...d, logs: d.logs.map((l) => ({ ...l, moduleId: "m2" })) };
    expect(restoreTrash(moved, d.meta.trash[0].id).logs[0].moduleId).toBe("m2");
  });

  it("legt nichts ab, wenn nichts fehlt, und vergisst nach 30 Tagen", () => {
    const d = base();
    expect(trashEntry(d, { ...d, homework: d.homework.map((h) => ({ ...h, title: "x" })) })).toBeNull();
    const list = [{ id: "a", at: "2026-09-01T00:00:00.000Z" }, { id: "b", at: "2026-10-15T00:00:00.000Z" }];
    expect(pruneTrash(list, new Date("2026-10-20T00:00:00Z")).map((t) => t.id)).toEqual(["b"]);
    expect(purgeTrash({ ...d, meta: { trash: list } }).meta.trash).toEqual([]);
  });

  it("ein zurückgeholter Eintrag gewinnt beim Sync gegen den Grabstein der Löschung", () => {
    const d0 = stampChanges(emptyData(), base(), "2026-10-20T10:00:00.000Z");
    const after = { ...d0, homework: [] };
    const del = stampChanges(d0, addTrash(after, trashEntry(d0, after)), "2026-10-20T11:00:00.000Z");
    expect(del.deleted.some((t) => t.id === "h1")).toBe(true);
    const back = stampChanges(del, restoreTrash(del, del.meta.trash[0].id), "2026-10-20T12:00:00.000Z");
    /* das andere Gerät kennt nur die Löschung */
    const { data } = mergeData(del, back, "2026-10-20T12:30:00.000Z");
    expect(data.homework.map((h) => h.id)).toEqual(["h1"]);
  });
});

describe("Wochenraster: Ziehen und freie Stelle", () => {
  it("rastet auf Viertelstunden und bleibt im Tag", () => {
    expect(slotAt(10 * 60 + 41)).toBe(10 * 60 + 30);
    expect(dragTo({ start: "10:00", end: "11:30" }, "move", 37)).toEqual({ start: "10:30", end: "12:00" });
    expect(dragTo({ start: "10:00", end: "11:30" }, "move", -900)).toEqual({ start: "00:00", end: "01:30" });
    expect(dragTo({ start: "22:00", end: "23:30" }, "move", 120)).toEqual({ start: "22:29", end: "23:59" });
    expect(dragTo({ start: "10:00", end: "11:30" }, "resize", 22)).toEqual({ start: "10:00", end: "11:45" });
    expect(dragTo({ start: "10:00", end: "11:30" }, "resize", -200)).toEqual({ start: "10:00", end: "10:15" });
  });

  it("Abo-Termine merken sich verschobene Felder", () => {
    expect(movePatch({ date: "2026-10-20", start: "10:00", end: "12:00" }, { date: "2026-10-21", start: "10:00", end: "12:00" })).toEqual({ date: "2026-10-21" });
    expect(movePatch({ feedKey: "x", locked: ["room"], date: "2026-10-20", start: "10:00", end: "12:00" }, { date: "2026-10-20", start: "10:15", end: "12:15" }))
      .toEqual({ start: "10:15", end: "12:15", locked: ["room", "start", "end"] });
    expect(movePatch({ date: "2026-10-20", start: "10:00", end: "12:00" }, { date: "2026-10-20", start: "10:00", end: "12:00" })).toEqual({});
  });
});

describe("Suche", () => {
  it("findet Termine nach Raum (die nächsten zuerst) und Anhänge nach Dateinamen", () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-21T12:00:00"));
    const d = { ...base(),
      sessions: [
        { id: "s-alt", moduleId: "m1", type: "Vorlesung", date: "2026-10-14", start: "10:00", end: "12:00", room: "MI HS 1" },
        { id: "s-neu", moduleId: "m1", type: "Vorlesung", date: "2026-10-28", start: "10:00", end: "12:00", room: "MI HS 1" },
        { id: "s-bald", moduleId: "m1", type: "Vorlesung", date: "2026-10-22", start: "10:00", end: "12:00", room: "MI HS 1" },
        { id: "s-anders", moduleId: "m1", type: "Übung", date: "2026-10-22", start: "14:00", end: "16:00", room: "MW 2001" },
      ],
      notes: [{ id: "n1", moduleId: "m1", title: "Skript", text: "", files: [{ id: "f1", name: "Folien_Kapitel3.pdf" }] }],
    };
    expect(searchAll(d, "hs 1").filter((r) => r.kind === "session").map((r) => r.item.id)).toEqual(["s-bald", "s-neu", "s-alt"]);
    const file = searchAll(d, "kapitel3");
    expect(file).toHaveLength(1);
    expect(file[0]).toMatchObject({ kind: "note", label: "Anhang", title: "Folien_Kapitel3.pdf" });
  });
});

describe("Datum nach Gerätezeit", () => {
  it("rechnet Zeitstempel kurz nach Mitternacht in den richtigen Tag um", () => {
    /* Tests laufen mit TZ=Europe/Berlin: 23:30 UTC ist schon der nächste Tag */
    expect(dayOf("2026-10-19T23:30:00.000Z")).toBe("2026-10-20");
    expect(dayOf("2026-10-19")).toBe("2026-10-19");
    expect(dayOf("")).toBe("");
  });
});
