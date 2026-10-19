import { describe, it, expect } from "vitest";
import { syncOnce } from "../../src/lib/cloudsync.js";
import { deriveSyncKey, newSalt } from "../../src/lib/crypto.js";
import { emptyData } from "../../src/lib/data.js";
import { findConflicts, restoreConflicts, stampChanges, stampMap } from "../../src/lib/sync.js";

function fakeRemote() {
  const r = { row: null };
  r.get = async () => (r.row ? structuredClone(r.row) : null);
  r.insert = async (payload) => { if (r.row) return false; r.row = { version: 1, payload }; return true; };
  r.update = async (payload, version) => { if (!r.row || r.row.version !== version) return false; r.row = { version: version + 1, payload }; return true; };
  return r;
}
/* Gerät wie in der App: merkt sich die Zeitstempel nach jedem Sync */
function device() {
  const dev = { data: emptyData(), synced: null };
  dev.edit = (fn, at) => { dev.data = stampChanges(dev.data, fn(dev.data), at); };
  dev.sync = async (remote, key) => {
    const res = await syncOnce({ remote, key, getLocal: () => dev.data, applyLocal: (m) => { dev.data = m; }, synced: dev.synced });
    dev.synced = res.stamps;
    return res;
  };
  return dev;
}
const rename = (id, title) => (d) => ({ ...d, notes: d.notes.map((n) => (n.id === id ? { ...n, title } : n)) });
const T = (h) => `2026-10-17T${String(h).padStart(2, "0")}:00:00.000Z`;

describe("Konflikthinweis beim Sync", () => {
  it("meldet eine hier geänderte Notiz, die ein anderes Gerät später überschrieben hat, und stellt sie wieder her", async () => {
    const remote = fakeRemote(), key = await deriveSyncKey("geheim-123", newSalt(), 20000);
    const a = device(), b = device();
    a.edit((d) => ({ ...d, notes: [{ id: "n1", title: "Original" }] }), T(8));
    await a.sync(remote, key); await b.sync(remote, key);
    a.edit(rename("n1", "Meine Fassung"), T(9));
    b.edit(rename("n1", "Fassung von B"), T(10));
    await b.sync(remote, key);
    const res = await a.sync(remote, key);
    expect(res.conflicts.map((k) => [k.id, k.kind, k.title])).toEqual([["n1", "overwritten", "Meine Fassung"]]);
    expect(a.data.notes[0].title).toBe("Fassung von B");
    /* „Meine behalten“: wiederherstellen, neu stempeln, auf B ankommen */
    a.edit((d) => restoreConflicts(d, res.conflicts), T(11));
    expect(a.data.notes[0].title).toBe("Meine Fassung");
    expect((await a.sync(remote, key)).conflicts).toEqual([]);
    await b.sync(remote, key);
    expect(b.data.notes[0].title).toBe("Meine Fassung");
  });

  it("meldet nichts, wenn hier nichts geändert wurde oder beim ersten Sync", async () => {
    const remote = fakeRemote(), key = await deriveSyncKey("geheim-123", newSalt(), 20000);
    const a = device(), b = device();
    a.edit((d) => ({ ...d, notes: [{ id: "n1", title: "Original" }] }), T(8));
    expect((await a.sync(remote, key)).conflicts).toEqual([]);
    expect((await b.sync(remote, key)).conflicts).toEqual([]);
    b.edit(rename("n1", "Neu"), T(9));
    await b.sync(remote, key);
    expect((await a.sync(remote, key)).conflicts).toEqual([]);
    expect(a.data.notes[0].title).toBe("Neu");
  });

  it("meldet eine hier bearbeitete Notiz, die anderswo später gelöscht wurde", () => {
    const local = { ...emptyData(), notes: [{ id: "n1", title: "Bearbeitet", updated: T(9) }] };
    const synced = stampMap({ ...emptyData(), notes: [{ id: "n1", updated: T(8) }] });
    const merged = { ...emptyData(), notes: [] };
    const list = findConflicts(local, merged, synced);
    expect(list.map((k) => [k.id, k.kind])).toEqual([["n1", "deleted"]]);
    expect(restoreConflicts(merged, list).notes.map((n) => n.title)).toEqual(["Bearbeitet"]);
    expect(findConflicts(local, merged, null)).toEqual([]);
  });
});
