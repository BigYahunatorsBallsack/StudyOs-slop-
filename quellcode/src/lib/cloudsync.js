/* Cloud-Sync: holt den Cloud-Stand, führt ihn mit dem lokalen zusammen und schreibt zurück.
   Das Backend ist austauschbar (`remote`), damit sich alles ohne Server testen lässt.

   remote.get()                  → { version, payload } | null
   remote.insert(payload)        → true | false (false = es gab schon einen Datensatz)
   remote.update(payload, ver)   → true | false (false = jemand anderes hat zwischendurch geschrieben) */
import { COLLS } from "./constants.js";
import { decryptWithKey, encryptWithKey } from "./crypto.js";
import { normalizeImport } from "./data.js";
import { mergeData } from "./sync.js";

/** Kurzer Fingerabdruck des synchronisierten Inhalts: ändert sich, sobald ein Eintrag, eine Löschung
    oder die Einstellungen sich ändern. */
export function fingerprint(d) {
  const parts = COLLS.map((c) => c + ":" + (d[c] || []).map((x) => `${x.id}@${x.updated || ""}`).sort().join(","));
  parts.push("del:" + (d.deleted || []).map((t) => `${t.c}/${t.id}@${t.at}`).sort().join(","));
  parts.push("set:" + (d.meta?.settingsUpdated || ""));
  return parts.join("|");
}

/* Nur synchronisierte Felder hochladen; gerätebezogene Metadaten bleiben lokal. */
const forCloud = (d) => ({ ...d, meta: { settingsUpdated: d.meta?.settingsUpdated || null, lastBackup: d.meta?.lastBackup || null } });

export async function syncOnce({ remote, key, getLocal, applyLocal, now = () => new Date().toISOString(), maxAttempts = 4 }) {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const row = await remote.get();
    const base = getLocal();
    let remoteData = null;
    if (row) remoteData = normalizeImport(await decryptWithKey(row.payload, key));

    let merged = base, stats = { added: 0, updated: 0, removed: 0 };
    if (remoteData) ({ data: merged, stats } = mergeData(base, remoteData, now()));

    const pulled = !!remoteData && fingerprint(merged) !== fingerprint(base);
    if (pulled) applyLocal(merged, base);
    else merged = base;

    if (remoteData && fingerprint(merged) === fingerprint(remoteData)) return { pulled, pushed: false, stats, fingerprint: fingerprint(merged) };

    const payload = await encryptWithKey(forCloud(merged), key);
    const ok = row ? await remote.update(payload, row.version) : await remote.insert(payload);
    if (ok) return { pulled, pushed: true, stats, fingerprint: fingerprint(merged) };
    /* Konflikt: ein anderes Gerät war schneller. Neu holen und nochmals zusammenführen. */
  }
  throw new Error("Die Cloud wurde mehrfach gleichzeitig geändert. Bitte gleich nochmal versuchen.");
}

/** Prüft eine Passphrase gegen einen vorhandenen Cloud-Datensatz. */
export async function checkKey(row, key) {
  await decryptWithKey(row.payload, key);
  return true;
}
