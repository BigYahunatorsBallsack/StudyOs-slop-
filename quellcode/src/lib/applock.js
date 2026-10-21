/* App-Sperre: Fingerabdruck / Face ID über WebAuthn (Plattform-Authenticator), pro Gerät, standardmäßig aus.
   Ohne Server: Beim Einschalten legt das Gerät einen Schlüssel an, gemerkt wird nur dessen Credential-ID
   (localStorage). Entsperrt ist, wenn das Gerät für genau diese ID die Nutzerprüfung bestätigt.
   Das ist eine Sichtsperre, keine Verschlüsselung: Die Daten liegen weiter unverschlüsselt im Browser.
   Ausschalten geht nur im entsperrten Zustand (in den Einstellungen). */

const KEY = "studyos-lock-v1";
export const LOCK_AFTER_MS = 5 * 60 * 1000; /* so lange darf die App im Hintergrund sein, ohne neu zu sperren */

/** Bytes ↔ base64url (für die Credential-ID im localStorage) */
export function toB64u(bytes) {
  let s = "";
  for (const b of new Uint8Array(bytes)) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
export function fromB64u(text) {
  const s = atob(String(text).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

/** Gespeicherte Sperre ({ id, created }) oder null */
export function lockConfig(storage = globalThis.localStorage) {
  try {
    const o = JSON.parse(storage.getItem(KEY) || "null");
    return o && typeof o.id === "string" && o.id ? o : null;
  } catch { return null; }
}
export function saveLockConfig(cfg, storage = globalThis.localStorage) {
  try { if (cfg) storage.setItem(KEY, JSON.stringify(cfg)); else storage.removeItem(KEY); return true; } catch { return false; }
}

/** Muss nach `hiddenAt` (ms) neu gesperrt werden? */
export const lockDue = (hiddenAt, now = Date.now(), after = LOCK_AFTER_MS) => Number.isFinite(hiddenAt) && now - hiddenAt >= after;

/** Gibt es hier einen Plattform-Authenticator mit Nutzerprüfung (Fingerabdruck, Face ID, Geräte-PIN)? */
export async function lockAvailable() {
  try {
    const P = globalThis.PublicKeyCredential;
    if (!P || !globalThis.isSecureContext || !navigator.credentials) return false;
    return !!(await P.isUserVerifyingPlatformAuthenticatorAvailable());
  } catch { return false; }
}

const random = (n) => crypto.getRandomValues(new Uint8Array(n));

/** Legt einen Schlüssel auf diesem Gerät an (fragt Fingerabdruck/Face ID ab) und liefert die Sperre zum Speichern. */
export async function registerLock(now = new Date()) {
  const cred = /** @type {PublicKeyCredential | null} */ (await navigator.credentials.create({
    publicKey: {
      rp: { name: "StudyOS" },
      user: { id: random(16), name: "studyos", displayName: "StudyOS" },
      challenge: random(32),
      pubKeyCredParams: [{ type: "public-key", alg: -7 }, { type: "public-key", alg: -257 }],
      authenticatorSelection: { authenticatorAttachment: "platform", userVerification: "required", residentKey: "discouraged" },
      timeout: 60000,
      attestation: "none",
    },
  }));
  if (!cred) throw new Error("Abgebrochen.");
  return { id: toB64u(cred.rawId), created: now.toISOString() };
}

/** Fragt Fingerabdruck/Face ID für den gespeicherten Schlüssel ab; true, wenn das Gerät bestätigt. */
export async function verifyLock(cfg) {
  if (!cfg) return true;
  const cred = /** @type {PublicKeyCredential | null} */ (await navigator.credentials.get({
    publicKey: {
      challenge: random(32),
      allowCredentials: [{ type: "public-key", id: fromB64u(cfg.id), transports: ["internal"] }],
      userVerification: "required",
      timeout: 60000,
    },
  }));
  if (!cred || toB64u(cred.rawId) !== cfg.id) return false;
  /* Flags im authenticatorData (Byte 32): Bit 2 = Nutzer geprüft */
  const auth = /** @type {AuthenticatorAssertionResponse} */ (cred.response).authenticatorData;
  return !auth || (new Uint8Array(auth)[32] & 4) === 4;
}
