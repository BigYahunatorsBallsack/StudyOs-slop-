/* Verschlüsselte Sicherungen: Passphrase → PBKDF2-SHA256 → AES-256-GCM (WebCrypto, keine Bibliothek) */
const enc = new TextEncoder();
const dec = new TextDecoder();
export const KDF_ITERATIONS = 600000; /* OWASP-Empfehlung für PBKDF2-SHA256 */

const toB64 = (buf) => {
  const bytes = new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
};
const fromB64 = (b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

async function deriveKey(pass, salt, iterations) {
  const base = await crypto.subtle.importKey("raw", enc.encode(pass), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "PBKDF2", salt, iterations, hash: "SHA-256" }, base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}

export function isEncryptedBackup(obj) {
  return !!obj && typeof obj === "object" && obj.studyosEncrypted === 1 && typeof obj.data === "string" && typeof obj.salt === "string" && typeof obj.iv === "string";
}

export async function encryptBackup(obj, pass, iterations = KDF_ITERATIONS) {
  if (!pass) throw new Error("Bitte eine Passphrase eingeben.");
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(pass, salt, iterations);
  const data = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, enc.encode(JSON.stringify(obj)));
  return { studyosEncrypted: 1, kdf: "PBKDF2-SHA256", iterations, salt: toB64(salt), iv: toB64(iv), data: toB64(data) };
}

export async function decryptBackup(envelope, pass) {
  if (!isEncryptedBackup(envelope)) throw new Error("Keine verschlüsselte StudyOS-Sicherung.");
  const iterations = Number(envelope.iterations);
  if (!Number.isInteger(iterations) || iterations < 10000 || iterations > 5000000) throw new Error("Ungültige Schlüsselparameter in der Sicherung.");
  try {
    const key = await deriveKey(pass || "", fromB64(envelope.salt), iterations);
    const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromB64(envelope.iv) }, key, fromB64(envelope.data));
    return JSON.parse(dec.decode(plain));
  } catch {
    throw new Error("Falsche Passphrase oder beschädigte Datei.");
  }
}

/* ---- Schlüssel für den Cloud-Sync ----
   Der Schlüssel wird einmal aus der Passphrase abgeleitet und als nicht exportierbarer CryptoKey
   gespeichert. Das Salz liegt im Cloud-Datensatz, damit alle Geräte denselben Schlüssel ableiten. */
export const newSalt = () => toB64(crypto.getRandomValues(new Uint8Array(16)));

export async function deriveSyncKey(pass, salt, iterations = KDF_ITERATIONS) {
  if (!pass) throw new Error("Bitte eine Passphrase eingeben.");
  return { key: await deriveKey(pass, fromB64(salt), iterations), salt, iterations };
}

export async function encryptWithKey(obj, k) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, k.key, enc.encode(JSON.stringify(obj)));
  return { studyosEncrypted: 1, kdf: "PBKDF2-SHA256", iterations: k.iterations, salt: k.salt, iv: toB64(iv), data: toB64(data) };
}

export class KeyMismatchError extends Error {}

export async function decryptWithKey(envelope, k) {
  if (!isEncryptedBackup(envelope)) throw new Error("Der Cloud-Datensatz ist nicht verschlüsselt oder beschädigt.");
  if (envelope.salt !== k.salt || Number(envelope.iterations) !== k.iterations) throw new KeyMismatchError("Die Passphrase wurde auf einem anderen Gerät geändert. Bitte neu eingeben.");
  try {
    const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromB64(envelope.iv) }, k.key, fromB64(envelope.data));
    return JSON.parse(dec.decode(plain));
  } catch {
    throw new KeyMismatchError("Falsche Passphrase oder beschädigte Cloud-Daten.");
  }
}
