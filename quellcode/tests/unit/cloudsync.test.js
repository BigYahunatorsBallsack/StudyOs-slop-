import { describe, it, expect } from "vitest";
import { syncOnce, fingerprint } from "../../src/lib/cloudsync.js";
import { deriveSyncKey, newSalt, KeyMismatchError } from "../../src/lib/crypto.js";
import { emptyData } from "../../src/lib/data.js";
import { stampChanges } from "../../src/lib/sync.js";

/* Simuliertes Supabase: eine Zeile mit Versionsnummer, optional mit eingeschobenem Fremd-Schreibzugriff */
function fakeRemote() {
  const r = { row: null, writes: 0, beforeWrite: null };
  r.get = async () => (r.row ? structuredClone(r.row) : null);
  r.insert = async (payload) => { if (r.beforeWrite) await r.beforeWrite(); if (r.row) return false; r.row = { version: 1, payload }; r.writes++; return true; };
  r.update = async (payload, version) => { if (r.beforeWrite) await r.beforeWrite(); if (!r.row || r.row.version !== version) return false; r.row = { version: version + 1, payload }; r.writes++; return true; };
  return r;
}

/* Ein "Gerät": lokaler Datenstand plus Bearbeiten wie in der App (mit Zeitstempeln) */
function device(initial = emptyData()) {
  const dev = { data: initial };
  dev.edit = (fn, at) => { dev.data = stampChanges(dev.data, fn(dev.data), at); };
  dev.opts = (remote, key) => ({ remote, key, getLocal: () => dev.data, applyLocal: (merged) => { dev.data = merged; } });
  return dev;
}
const addModule = (id, name) => (d) => ({ ...d, modules: [...d.modules, { id, name }] });

const ITER = 20000;
const keyFor = async (pass = "geheim-123", salt) => deriveSyncKey(pass, salt || newSalt(), ITER);

describe("Cloud-Sync", () => {
  it("lädt beim ersten Gerät hoch, verschlüsselt", async () => {
    const remote = fakeRemote(), key = await keyFor();
    const a = device();
    a.edit(addModule("m1", "Analysis"), "2026-10-17T10:00:00.000Z");
    const res = await syncOnce(a.opts(remote, key));
    expect(res).toMatchObject({ pushed: true, pulled: false });
    expect(remote.row.version).toBe(1);
    expect(JSON.stringify(remote.row.payload)).not.toContain("Analysis");
  });

  it("führt zwei Geräte zusammen und schreibt nur bei Änderungen", async () => {
    const remote = fakeRemote(), key = await keyFor();
    const a = device(), b = device();
    a.edit(addModule("m1", "Analysis"), "2026-10-17T10:00:00.000Z");
    b.edit(addModule("m2", "Algorithmen"), "2026-10-17T11:00:00.000Z");
    await syncOnce(a.opts(remote, key));
    const rb = await syncOnce(b.opts(remote, key));
    expect(rb).toMatchObject({ pulled: true, pushed: true });
    const ra = await syncOnce(a.opts(remote, key));
    expect(ra).toMatchObject({ pulled: true, pushed: false });
    expect(a.data.modules.map((m) => m.id).sort()).toEqual(["m1", "m2"]);
    expect(fingerprint(a.data)).toBe(fingerprint(b.data));
    const writes = remote.writes;
    expect(await syncOnce(a.opts(remote, key))).toMatchObject({ pulled: false, pushed: false });
    expect(remote.writes).toBe(writes);
  });

  it("überträgt Löschungen auf das andere Gerät", async () => {
    const remote = fakeRemote(), key = await keyFor();
    const a = device(), b = device();
    a.edit(addModule("m1", "X"), "2026-10-17T10:00:00.000Z");
    await syncOnce(a.opts(remote, key));
    await syncOnce(b.opts(remote, key));
    expect(b.data.modules).toHaveLength(1);
    a.edit((d) => ({ ...d, modules: [] }), "2026-10-17T12:00:00.000Z");
    await syncOnce(a.opts(remote, key));
    await syncOnce(b.opts(remote, key));
    expect(b.data.modules).toHaveLength(0);
  });

  it("löst einen Schreibkonflikt durch erneutes Holen und Zusammenführen", async () => {
    const remote = fakeRemote(), key = await keyFor();
    const a = device(), b = device();
    a.edit(addModule("m1", "A"), "2026-10-17T10:00:00.000Z");
    await syncOnce(a.opts(remote, key));
    b.edit(addModule("m2", "B"), "2026-10-17T10:05:00.000Z");
    await syncOnce(b.opts(remote, key));
    // A ändert etwas; genau vor A's Schreibzugriff schreibt B dazwischen
    a.edit(addModule("m3", "C"), "2026-10-17T10:10:00.000Z");
    b.edit(addModule("m4", "D"), "2026-10-17T10:11:00.000Z");
    let once = true;
    remote.beforeWrite = async () => { if (once) { once = false; remote.beforeWrite = null; await syncOnce(b.opts(remote, key)); } };
    await syncOnce(a.opts(remote, key));
    await syncOnce(b.opts(remote, key));
    expect(a.data.modules.map((m) => m.id).sort()).toEqual(["m1", "m2", "m3", "m4"]);
    expect(b.data.modules.map((m) => m.id).sort()).toEqual(["m1", "m2", "m3", "m4"]);
  });

  it("erkennt eine falsche Passphrase und ein geändertes Salz", async () => {
    const remote = fakeRemote(), salt = newSalt();
    const a = device();
    a.edit(addModule("m1", "X"), "2026-10-17T10:00:00.000Z");
    await syncOnce(a.opts(remote, await keyFor("richtig-123", salt)));
    await expect(syncOnce(device().opts(remote, await keyFor("falsch-123", salt)))).rejects.toBeInstanceOf(KeyMismatchError);
    await expect(syncOnce(device().opts(remote, await keyFor("richtig-123")))).rejects.toThrow(/anderen Gerät geändert/);
  });

  it("lädt gerätebezogene Metadaten nicht hoch", async () => {
    const remote = fakeRemote(), key = await keyFor();
    const a = device({ ...emptyData(), meta: { lastBackup: null, lastModule: "geheim-lokal" } });
    a.edit(addModule("m1", "X"), "2026-10-17T10:00:00.000Z");
    await syncOnce(a.opts(remote, key));
    const b = device();
    await syncOnce(b.opts(remote, key));
    expect(b.data.meta.lastModule).toBe("");
  });

  it("gibt nach zu vielen Konflikten auf, statt endlos zu laufen", async () => {
    const remote = fakeRemote(), key = await keyFor();
    remote.update = async () => false;
    remote.row = null;
    remote.insert = async () => false;
    const a = device();
    a.edit(addModule("m1", "X"), "2026-10-17T10:00:00.000Z");
    await expect(syncOnce({ ...a.opts(remote, key), maxAttempts: 3 })).rejects.toThrow(/gleichzeitig/);
  });
});
