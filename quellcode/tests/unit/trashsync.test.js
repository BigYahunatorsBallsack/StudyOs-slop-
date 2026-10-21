import { describe, it, expect } from "vitest";
import { syncOnce, fingerprint } from "../../src/lib/cloudsync.js";
import { createFakeCloud } from "../../src/cloud/fake.js";
import { deriveSyncKey, newSalt } from "../../src/lib/crypto.js";
import { emptyData, normalizeImport } from "../../src/lib/data.js";
import { mergeData, stampChanges } from "../../src/lib/sync.js";
import { addTrash, mergeTrash, purgeTrash, restoreTrash, trashEntry, trashOf } from "../../src/lib/trash.js";

/* Supabase-Ersatz aus src/cloud/fake.js mit einem Backend im Speicher (eine Zeile pro Nutzer, mit Version) */
function fakeCloud() {
  const store = new Map();
  globalThis.localStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
  const rows = new Map();
  const call = async (op, uid, payload, version) => {
    if (op === "verifyCode") return true;
    if (op === "get") return rows.has(uid) ? structuredClone(rows.get(uid)) : null;
    if (op === "insert") { if (rows.has(uid)) return false; rows.set(uid, { version: 1, payload }); return true; }
    if (op === "update") { const r = rows.get(uid); if (!r || r.version !== version) return false; rows.set(uid, { version: version + 1, payload }); return true; }
    return null;
  };
  return createFakeCloud(call);
}

/* Ein Gerät wie in der App: jede Änderung mit Zeitstempeln (stampChanges), Löschen über den Papierkorb */
function device() {
  const dev = { data: emptyData() };
  dev.edit = (fn, at) => { dev.data = stampChanges(dev.data, fn(dev.data), at); };
  dev.remove = (coll, id, at) => dev.edit((d) => { const next = { ...d, [coll]: d[coll].filter((x) => x.id !== id) }; return addTrash(next, trashEntry(d, next, { at })); }, at);
  dev.opts = (remote, key, at) => ({ remote, key, now: () => at, getLocal: () => dev.data, applyLocal: (merged) => { dev.data = merged; } });
  return dev;
}
const keyFor = async () => deriveSyncKey("geheim-123", newSalt(), 20000);
const mod = (id, name) => (d) => ({ ...d, modules: [...d.modules, { id, name, color: "#38bdf8", bonusPct: null }] });
const note = (id, title) => (d) => ({ ...d, notes: [...d.notes, { id, moduleId: "m1", sessionId: "", title, text: "x" }] });

describe("Papierkorb geräteübergreifend", () => {
  it("vereint nach id, ohne Grabsteine und Abgelaufenes", () => {
    const e = (id, at) => ({ id, at, label: id, coll: "notes", count: 1, removed: {}, changed: {} });
    const now = new Date("2026-10-20T12:00:00Z");
    const a = [e("t1", "2026-10-19T10:00:00.000Z"), e("t2", "2026-10-18T10:00:00.000Z"), e("alt", "2026-09-01T10:00:00.000Z")];
    const b = [e("t2", "2026-10-18T10:00:00.000Z"), e("t3", "2026-10-20T10:00:00.000Z"), null, { id: 5 }];
    expect(mergeTrash(a, b, new Set(["t1"]), now).map((t) => t.id)).toEqual(["t3", "t2"]);
  });

  it("Papierkorb-Einträge werden über die Cloud übertragen und auf Gerät B wiederhergestellt, ohne dass A sie wieder löscht", async () => {
    const cloud = fakeCloud(), key = await keyFor();
    await cloud.verifyCode("a@b.de", "123456");
    const remote = cloud.remote;
    const a = device(), b = device();
    a.edit((d) => note("n1", "Graphen")(mod("m1", "DS")(d)), "2026-10-17T10:00:00.000Z");
    await syncOnce(a.opts(remote, key, "2026-10-17T10:01:00.000Z"));
    await syncOnce(b.opts(remote, key, "2026-10-17T10:02:00.000Z"));
    expect(b.data.notes.map((n) => n.id)).toEqual(["n1"]);

    // A löscht die Notiz: Grabstein und Papierkorb-Eintrag gehen in die Cloud
    a.remove("notes", "n1", "2026-10-18T09:00:00.000Z");
    expect(trashOf(a.data, new Date("2026-10-18T10:00:00Z"))).toHaveLength(1);
    await syncOnce(a.opts(remote, key, "2026-10-18T09:01:00.000Z"));
    const rb = await syncOnce(b.opts(remote, key, "2026-10-18T09:02:00.000Z"));
    expect(rb.pulled).toBe(true);
    expect(b.data.notes).toEqual([]);
    const onB = trashOf(b.data, new Date("2026-10-18T10:00:00Z"));
    expect(onB.map((t) => t.label)).toEqual(["Graphen"]);

    // B stellt wieder her (Geräteuhr von B geht sogar nach): die Notiz gewinnt gegen den Grabstein von A
    b.edit((d) => restoreTrash(d, onB[0].id), "2026-10-18T08:00:00.000Z");
    expect(b.data.notes.map((n) => n.id)).toEqual(["n1"]);
    expect(b.data.deleted.some((t) => t.c === "trash" && t.id === onB[0].id)).toBe(true);
    await syncOnce(b.opts(remote, key, "2026-10-18T09:10:00.000Z"));

    // A holt ab: Notiz wieder da, Papierkorb leer, und A schreibt nichts zurück, das sie wieder löscht
    await syncOnce(a.opts(remote, key, "2026-10-18T09:11:00.000Z"));
    expect(a.data.notes.map((n) => [n.id, n.title])).toEqual([["n1", "Graphen"]]);
    expect(trashOf(a.data, new Date("2026-10-18T10:00:00Z"))).toEqual([]);
    await syncOnce(b.opts(remote, key, "2026-10-18T09:12:00.000Z"));
    expect(b.data.notes.map((n) => n.id)).toEqual(["n1"]);
    expect(fingerprint(a.data)).toBe(fingerprint(b.data));

    // auch ein alter Stand von A (vor dem Sync) bringt den Eintrag nicht zurück
    const stale = mergeData(a.data, b.data, "2026-10-18T09:13:00.000Z").data;
    expect(trashOf(stale, new Date("2026-10-18T10:00:00Z"))).toEqual([]);
  });

  it("Leeren auf einem Gerät leert den Papierkorb auch auf dem anderen", async () => {
    const cloud = fakeCloud(), key = await keyFor();
    await cloud.verifyCode("a@b.de", "123456");
    const a = device(), b = device();
    a.edit(mod("m1", "DS"), "2026-10-17T10:00:00.000Z");
    a.remove("modules", "m1", "2026-10-17T11:00:00.000Z");
    await syncOnce(a.opts(cloud.remote, key, "2026-10-17T11:01:00.000Z"));
    await syncOnce(b.opts(cloud.remote, key, "2026-10-17T11:02:00.000Z"));
    expect(trashOf(b.data, new Date("2026-10-18T00:00:00Z"))).toHaveLength(1);
    b.edit((d) => purgeTrash(d), "2026-10-17T12:00:00.000Z");
    await syncOnce(b.opts(cloud.remote, key, "2026-10-17T12:01:00.000Z"));
    await syncOnce(a.opts(cloud.remote, key, "2026-10-17T12:02:00.000Z"));
    expect(trashOf(a.data, new Date("2026-10-18T00:00:00Z"))).toEqual([]);
    expect(a.data.modules).toEqual([]);
  });

  it("Grabsteine des Papierkorbs überstehen das Einlesen (Cloud, Sicherung)", () => {
    const d = normalizeImport({ ...emptyData(), deleted: [{ c: "trash", id: "t1", at: "2026-10-18T00:00:00.000Z" }, { c: "quatsch", id: "x", at: "2026-10-18T00:00:00.000Z" }] });
    expect(d.deleted.map((t) => t.c)).toEqual(["trash"]);
  });
});
