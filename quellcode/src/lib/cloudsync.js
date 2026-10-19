/* Cloud-Sync: holt den Cloud-Stand, führt ihn mit dem lokalen zusammen und schreibt zurück.
   Das Backend ist austauschbar (`remote`), damit sich alles ohne Server testen lässt.

   remote.get()                  → { version, payload } | null
   remote.insert(payload)        → true | false (false = es gab schon einen Datensatz)
   remote.update(payload, ver)   → true | false (false = jemand anderes hat zwischendurch geschrieben)
   remote.serverOffset           → optional: Versatz der Geräteuhr zur Serverzeit in ms (aus der letzten Antwort) */
import { COLLS } from "./constants.js";
import { decryptWithKey, encryptWithKey } from "./crypto.js";
import { normalizeImport } from "./data.js";
import { canonical, findConflicts, mergeData, setClockOffset, stampMap } from "./sync.js";

/* Kurze Prüfsumme (FNV-1a), damit zwei Fassungen mit gleichem Zeitstempel, aber anderem Inhalt auffallen */
function hash(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(36);
}

/** Kurzer Fingerabdruck des synchronisierten Inhalts: ändert sich, sobald ein Eintrag, eine Löschung
    oder die Einstellungen sich ändern. */
export function fingerprint(d) {
  const parts = COLLS.map((c) => c + ":" + (d[c] || []).map((x) => `${x.id}@${x.updated || ""}#${hash(canonical(x))}`).sort().join(","));
  parts.push("del:" + (d.deleted || []).map((t) => `${t.c}/${t.id}@${t.at}`).sort().join(","));
  parts.push("set:" + (d.meta?.settingsUpdated || "") + "#" + hash(canonical(d.settings || {})));
  return parts.join("|");
}

/* Nur synchronisierte Felder hochladen; gerätebezogene Metadaten bleiben lokal. */
const forCloud = (d) => ({ ...d, meta: { settingsUpdated: d.meta?.settingsUpdated || null, settingsFu: d.meta?.settingsFu || null, lastBackup: d.meta?.lastBackup || null } });

/* synced: Zeitstempel nach dem letzten erfolgreichen Sync (stampMap); damit werden überschriebene lokale
   Änderungen erkannt (conflicts). Das Ergebnis liefert die neuen Zeitstempel für den nächsten Lauf (stamps). */
export async function syncOnce({ remote, key, getLocal, applyLocal, now = () => new Date().toISOString(), maxAttempts = 4, synced = null }) {
  const conflicts = new Map();
  let merged;
  const done = (r) => ({ ...r, conflicts: [...conflicts.values()], stamps: stampMap(merged) });
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const row = await remote.get();
    if (Number.isFinite(remote.serverOffset)) setClockOffset(remote.serverOffset);
    const base = getLocal();
    let remoteData = null;
    if (row) remoteData = normalizeImport(await decryptWithKey(row.payload, key));

    merged = base;
    let stats = { added: 0, updated: 0, removed: 0 };
    if (remoteData) ({ data: merged, stats } = mergeData(base, remoteData, now()));

    const pulled = !!remoteData && fingerprint(merged) !== fingerprint(base);
    if (pulled) {
      for (const k of findConflicts(base, merged, synced)) conflicts.set(`${k.c}:${k.id}`, k);
      applyLocal(merged, base);
    } else merged = base;

    if (remoteData && fingerprint(merged) === fingerprint(remoteData)) return done({ pulled, pushed: false, stats, fingerprint: fingerprint(merged) });

    const payload = await encryptWithKey(forCloud(merged), key);
    const ok = row ? await remote.update(payload, row.version) : await remote.insert(payload);
    if (ok) return done({ pulled, pushed: true, stats, fingerprint: fingerprint(merged) });
    /* Konflikt: ein anderes Gerät war schneller. Neu holen und nochmals zusammenführen. */
  }
  throw new Error("Die Cloud wurde mehrfach gleichzeitig geändert. Bitte gleich nochmal versuchen.");
}

/** Prüft eine Passphrase gegen einen vorhandenen Cloud-Datensatz. */
export async function checkKey(row, key) {
  await decryptWithKey(row.payload, key);
  return true;
}
