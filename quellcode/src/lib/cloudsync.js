/* Cloud-Sync: holt den Cloud-Stand, führt ihn mit dem lokalen zusammen und schreibt zurück.
   Das Backend ist austauschbar (`remote`), damit sich alles ohne Server testen lässt.

   remote.get()                  → { version, payload } | null
   remote.insert(payload)        → true | false (false = es gab schon einen Datensatz)
   remote.update(payload, ver)   → true | false (false = jemand anderes hat zwischendurch geschrieben)
   remote.peek()                 → optional: Kennung des Cloud-Stands (rowTag) | null, ohne die Daten zu laden
   remote.serverOffset           → optional: Versatz der Geräteuhr zur Serverzeit in ms (aus der letzten Antwort) */
import { COLLS } from "./constants.js";
import { decryptWithKey, encryptWithKey } from "./crypto.js";
import { normalizeImport } from "./data.js";
import { EPOCH, canonical, findConflicts, mergeData, setClockOffset, stampMap } from "./sync.js";

/* Kurze Prüfsumme (FNV-1a), damit zwei Fassungen mit gleichem Zeitstempel, aber anderem Inhalt auffallen */
function hash(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(36);
}

/** Kurzer Fingerabdruck des synchronisierten Inhalts: ändert sich, sobald ein Eintrag, eine Löschung,
    die Einstellungen oder der Papierkorb sich ändern. */
export function fingerprint(d) {
  const parts = COLLS.map((c) => c + ":" + (d[c] || []).map((x) => `${x.id}@${x.updated || ""}#${hash(canonical(x))}`).sort().join(","));
  parts.push("del:" + (d.deleted || []).map((t) => `${t.c}/${t.id}@${t.at}`).sort().join(","));
  /* EPOCH heißt wie „fehlt“: nie geänderte Einstellungen, sonst gäbe es auf neuen Geräten einen überflüssigen Upload */
  const su = d.meta?.settingsUpdated;
  parts.push("set:" + (su && su !== EPOCH ? su : "") + "#" + hash(canonical(d.settings || {})));
  parts.push("trash:" + (Array.isArray(d.meta?.trash) ? d.meta.trash : []).map((t) => t && t.id).sort().join(","));
  return parts.join("|");
}

/* Nur synchronisierte Felder hochladen (dazu der Papierkorb); gerätebezogene Metadaten bleiben lokal. */
const forCloud = (d) => ({ ...d, meta: { settingsUpdated: d.meta?.settingsUpdated || null, settingsFu: d.meta?.settingsFu || null, lastBackup: d.meta?.lastBackup || null, trash: Array.isArray(d.meta?.trash) ? d.meta.trash : [] } });

/* synced: Zeitstempel nach dem letzten erfolgreichen Sync (stampMap); damit werden überschriebene lokale
   Änderungen erkannt (conflicts). Das Ergebnis liefert die neuen Zeitstempel für den nächsten Lauf (stamps). */
/** Kennung eines Cloud-Stands: Versionsnummer plus IV des Chiffrats. Der IV ist bei jedem Schreiben neu, die Kennung
    ändert sich also auch, wenn die Zeile gelöscht und neu angelegt wurde. null, wenn sie sich nicht bestimmen lässt. */
export const rowTag = (version, payload) => (payload && typeof payload.iv === "string" && payload.iv ? `${version}:${payload.iv}` : null);

/* known: { tag, fingerprint } nach dem letzten erfolgreichen Lauf. Hat sich weder die Cloud (remote.peek) noch der
   lokale Stand seitdem geändert, ist nichts zu tun: kein Herunterladen, Entschlüsseln und Zusammenführen.
   canWrite: wird vor dem Schreiben gefragt; false (z. B. Abmelden oder Cloud-Daten gelöscht) bricht ohne Schreiben ab. */
export async function syncOnce({ remote, key, getLocal, applyLocal, now = () => new Date().toISOString(), maxAttempts = 4, synced = null, known = null, canWrite = () => true }) {
  const conflicts = new Map();
  let merged;
  const done = (r) => ({ ...r, conflicts: [...conflicts.values()], stamps: stampMap(merged) });
  if (known && known.tag && typeof remote.peek === "function") {
    const tag = await remote.peek();
    if (Number.isFinite(remote.serverOffset)) setClockOffset(remote.serverOffset);
    const local = getLocal();
    if (tag === known.tag && fingerprint(local) === known.fingerprint) {
      merged = local;
      return done({ pulled: false, pushed: false, skipped: true, stats: { added: 0, updated: 0, removed: 0 }, fingerprint: known.fingerprint, tag });
    }
  }
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const row = await remote.get();
    if (Number.isFinite(remote.serverOffset)) setClockOffset(remote.serverOffset);
    const base = getLocal();
    let remoteData = null;
    if (row) remoteData = normalizeImport(await decryptWithKey(row.payload, key));

    merged = base;
    let stats = { added: 0, updated: 0, removed: 0 };
    if (remoteData) ({ data: merged, stats } = mergeData(base, remoteData, now()));

    const fpBase = fingerprint(base);
    let fp = merged === base ? fpBase : fingerprint(merged);
    const pulled = !!remoteData && fp !== fpBase;
    if (pulled) {
      for (const k of findConflicts(base, merged, synced)) conflicts.set(`${k.c}:${k.id}`, k);
      applyLocal(merged, base);
    } else { merged = base; fp = fpBase; }

    if (remoteData && fp === fingerprint(remoteData)) return done({ pulled, pushed: false, stats, fingerprint: fp, tag: rowTag(row.version, row.payload) });

    if (!canWrite()) return done({ pulled, pushed: false, cancelled: true, stats, fingerprint: fp, tag: null });
    const payload = await encryptWithKey(forCloud(merged), key);
    const ok = row ? await remote.update(payload, row.version) : await remote.insert(payload);
    if (ok) return done({ pulled, pushed: true, stats, fingerprint: fp, tag: rowTag(row ? row.version + 1 : 1, payload) });
    /* Konflikt: ein anderes Gerät war schneller. Neu holen und nochmals zusammenführen. */
  }
  throw new Error("Die Cloud wurde mehrfach gleichzeitig geändert. Bitte gleich nochmal versuchen.");
}

/** Prüft eine Passphrase gegen einen vorhandenen Cloud-Datensatz. */
export async function checkKey(row, key) {
  await decryptWithKey(row.payload, key);
  return true;
}
