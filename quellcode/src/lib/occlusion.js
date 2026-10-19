/* Bild-Karteikarten mit Verdecken (Image Occlusion): Auf einem Bild liegen Rechtecke, jedes Rechteck wird eine
   eigene Karte mit eigenem FSRS-Lernstand. Alle Karten eines Bildes tragen dasselbe `occ` bis auf `target`:
   occ = { img: { id, type, size, w, h, cloud }, boxes: [{ id, x, y, w, h }], target, mode: "all" | "one" }
   Koordinaten sind Anteile von Breite und Höhe (0–1), damit sie bei jeder Bildgröße passen.
   Das Bild selbst liegt wie Anhänge in IndexedDB und mit Cloud-Sync verschlüsselt im Supabase-Speicher. */

export const MIN_BOX = 0.02; /* kleinere Rechtecke gelten als Antippen */
export const MAX_SIDE = 2000; /* größere Bilder werden verkleinert */
export const KEEP_BYTES = 1.5 * 1024 * 1024; /* kleinere Bilder bleiben unverändert */
export const MAX_BOXES = 60;

export const isOcc = (c) => !!(c && c.occ && c.occ.img && c.occ.img.id);
export const occGroup = (cards, imgId) => cards.filter((c) => isOcc(c) && c.occ.img.id === imgId);

const clamp01 = (v) => Math.min(1, Math.max(0, Number(v) || 0));
const r4 = (v) => Math.round(v * 10000) / 10000;

/** Rechteck aus zwei Eckpunkten (beliebige Reihenfolge), auf das Bild begrenzt. */
export function boxFrom(x0, y0, x1, y1) {
  const ax = clamp01(Math.min(x0, x1)), bx = clamp01(Math.max(x0, x1));
  const ay = clamp01(Math.min(y0, y1)), by = clamp01(Math.max(y0, y1));
  return { x: r4(ax), y: r4(ay), w: r4(bx - ax), h: r4(by - ay) };
}
export const bigEnough = (b) => b.w >= MIN_BOX && b.h >= MIN_BOX;

/** Rechteck um dx/dy verschieben bzw. (resize) vergrößern, ohne das Bild zu verlassen. */
export function nudge(b, dx, dy, resize = false) {
  if (resize) {
    const w = Math.min(1 - b.x, Math.max(MIN_BOX, b.w + dx)), h = Math.min(1 - b.y, Math.max(MIN_BOX, b.h + dy));
    return { ...b, w: r4(w), h: r4(h) };
  }
  return { ...b, x: r4(Math.min(1 - b.w, Math.max(0, b.x + dx))), y: r4(Math.min(1 - b.h, Math.max(0, b.y + dy))) };
}

/** Lesereihenfolge (zeilenweise von oben links), damit „Bereich 1, 2, 3 …“ nachvollziehbar nummeriert ist. */
export function sortBoxes(boxes) {
  return [...boxes].sort((a, b) => (Math.abs(a.y - b.y) > Math.min(a.h, b.h) / 2 ? a.y - b.y : a.x - b.x));
}

/** „Titel · Bereich 2 von 5“ für Listen und Suche */
export function occLabel(c) {
  if (!isOcc(c)) return String(c?.front || "");
  const boxes = sortBoxes(c.occ.boxes || []);
  const i = boxes.findIndex((b) => b.id === c.occ.target);
  return `${c.front || "Bild-Karte"} · Bereich ${i + 1} von ${boxes.length}`;
}

/** Zielgröße beim Verkleinern: längste Seite höchstens `max`. */
export function fitSize(w, h, max = MAX_SIDE) {
  const k = Math.min(1, max / Math.max(w, h, 1));
  return { w: Math.max(1, Math.round(w * k)), h: Math.max(1, Math.round(h * k)) };
}

/**
 * Karten eines Bildes neu aufbauen: ein Rechteck = eine Karte. Karten zu Rechtecken, die bleiben, behalten Id und
 * Lernstand; neue Rechtecke werden neue (fällige) Karten, Karten zu entfernten Rechtecken fallen weg.
 * @param {any[]} cards alle Karten
 * @param {{ img: any, boxes: any[], mode?: string, front: string, tags?: string, moduleId: string, topicId?: string }} v
 * @returns {any[]} neue Kartenliste
 */
export function applyOcclusion(cards, v, today, makeId) {
  const old = new Map(occGroup(cards, v.img.id).map((c) => [c.occ.target, c]));
  const boxes = sortBoxes(v.boxes).slice(0, MAX_BOXES).map((b) => ({ id: b.id, x: b.x, y: b.y, w: b.w, h: b.h }));
  const shared = { moduleId: v.moduleId, topicId: v.topicId || "", front: String(v.front || "").trim() || "Bild-Karte", back: "", tags: v.tags || "" };
  const group = boxes.map((b) => {
    const occ = { img: v.img, boxes, target: b.id, mode: v.mode === "one" ? "one" : "all" };
    const prev = old.get(b.id);
    return prev ? { ...prev, ...shared, occ } : { ...shared, occ, id: makeId(), created: today, ease: 2.5, interval: 0, reps: 0, due: today };
  });
  const rest = cards.filter((c) => !(isOcc(c) && c.occ.img.id === v.img.id));
  /* Die Gruppe bleibt an der Stelle der ersten alten Karte, damit sich die Reihenfolge der übrigen nicht verschiebt */
  const at = cards.findIndex((c) => isOcc(c) && c.occ.img.id === v.img.id);
  if (at < 0) return [...rest, ...group];
  const before = cards.slice(0, at).filter((c) => !(isOcc(c) && c.occ.img.id === v.img.id)).length;
  return [...rest.slice(0, before), ...group, ...rest.slice(before)];
}

/** Nach dem Hochladen: `cloud: true` an allen Karten dieses Bildes vermerken. */
export const markUploaded = (cards, imgId) => cards.map((c) => (isOcc(c) && c.occ.img.id === imgId && !c.occ.img.cloud ? { ...c, occ: { ...c.occ, img: { ...c.occ.img, cloud: true } } } : c));
