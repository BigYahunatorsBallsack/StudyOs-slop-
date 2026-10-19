/* Karteikarten-Stapel teilen: Inhalt wird im Browser mit einem Zufallsschlüssel (AES-GCM) verschlüsselt.
   Der Server bekommt nur Kennung und Chiffrat; der Schlüssel steht im #-Teil des Links und verlässt den
   Browser nie (Fragmente werden nicht an Server geschickt). */
const enc = new TextEncoder(), dec = new TextDecoder();
const b64u = (bytes) => { let s = ""; bytes.forEach((b) => { s += String.fromCharCode(b); }); return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); };
const unb64u = (s) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4)), (c) => c.charCodeAt(0));
const rand = (n) => crypto.getRandomValues(new Uint8Array(n));
const importKey = (raw) => crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);

export const SHARE_PARAM = "teilen";
export const MAX_SHARE_CARDS = 2000;

/** Stapel aus Karten bauen (ohne Lernfortschritt, nur Inhalt). */
export function deckFrom(cards, title, by = "") {
  return { v: 1, title: String(title || "Karteikarten").slice(0, 120), by: String(by || "").slice(0, 60), created: new Date().toISOString().slice(0, 10),
    cards: cards.slice(0, MAX_SHARE_CARDS).map((c) => ({ front: String(c.front || ""), back: String(c.back || ""), tags: String(c.tags || "") })) };
}

/** Verschlüsselt einen Stapel. Liefert `{ token, key, blob }`. */
export async function sealDeck(deck) {
  const raw = rand(16), iv = rand(12);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await importKey(raw), enc.encode(JSON.stringify(deck))));
  const all = new Uint8Array(iv.length + ct.length); all.set(iv); all.set(ct, iv.length);
  return { token: b64u(rand(18)), key: b64u(raw), blob: b64u(all) };
}

/** Entschlüsselt und prüft einen Stapel. */
export async function openDeck(blob, key) {
  let deck;
  try {
    const all = unb64u(blob), raw = unb64u(key);
    const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: all.subarray(0, 12) }, await importKey(raw), all.subarray(12));
    deck = JSON.parse(dec.decode(plain));
  } catch { throw new Error("Der Link ist unvollständig oder beschädigt."); }
  if (!deck || deck.v !== 1 || !Array.isArray(deck.cards)) throw new Error("Unbekanntes Format.");
  deck.cards = deck.cards.slice(0, MAX_SHARE_CARDS).filter((c) => c && typeof c.front === "string" && c.front.trim()).map((c) => ({ front: c.front.slice(0, 5000), back: String(c.back || "").slice(0, 5000), tags: String(c.tags || "").slice(0, 200) }));
  deck.title = String(deck.title || "Karteikarten").slice(0, 120);
  deck.by = String(deck.by || "").slice(0, 60);
  return deck;
}

export const shareUrl = (base, token, key) => `${base}?${SHARE_PARAM}=${token}#k=${key}`;

/** Liest Kennung und Schlüssel aus der aktuellen Adresse. */
export function parseShareLocation(loc) {
  const token = new URLSearchParams(loc.search).get(SHARE_PARAM);
  const key = new URLSearchParams(String(loc.hash || "").replace(/^#/, "")).get("k");
  return token && /^[\w-]{16,64}$/.test(token) ? { token, key: key || "" } : null;
}

/** Karten des Stapels einem Modul hinzufügen; doppelte Vorderseiten im Modul werden übersprungen. */
export function importDeck(data, deck, moduleId, today, makeId) {
  const have = new Set(data.cards.filter((c) => c.moduleId === moduleId).map((c) => c.front.trim()));
  const fresh = deck.cards.filter((c) => !have.has(c.front.trim())).map((c) => ({ ...c, id: makeId(), moduleId, topicId: "", created: today, ease: 2.5, interval: 0, reps: 0, due: today }));
  return { data: { ...data, cards: [...data.cards, ...fresh] }, added: fresh.length, skipped: deck.cards.length - fresh.length };
}
