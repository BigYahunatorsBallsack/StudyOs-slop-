/* Zurück-Geste für offene Ebenen (siehe lib/backstack.js) und Fenster nach unten wegwischen */
import { useEffect, useLayoutEffect, useRef } from "react";
import { LEVEL, createBackStack } from "../lib/backstack.js";
import { sheetDragCloses } from "../lib/gestures.js";

export { LEVEL };

/** „Bewegung aus“: Systemeinstellung oder im Retro-Look die Bewegung „aus“ */
export function motionOff() {
  try { if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return true; } catch { /* egal */ }
  return typeof document !== "undefined" && document.documentElement.dataset.motion === "off";
}

let stack = null;
function getStack() {
  if (stack || typeof window === "undefined" || !window.history?.pushState) return stack;
  /* Zurück über die eigenen Einträge darf die Seite nicht scrollen: Der Browser stellte sonst die alte Position her,
     und das Scrollen schlösse z. B. eine gerade geöffnete Termin-Karte */
  try { window.history.scrollRestoration = "manual"; } catch { /* egal */ }
  stack = createBackStack({
    history: window.history,
    target: window,
    activated: () => navigator.userActivation?.hasBeenActive ?? true,
    onActivate: (f) => {
      const go = () => { window.removeEventListener("pointerdown", go, true); window.removeEventListener("keydown", go, true); setTimeout(f, 0); };
      window.addEventListener("pointerdown", go, true); window.addEventListener("keydown", go, true);
    },
  });
  return stack;
}

/** Solange open gilt, schließt Zurück diese Ebene über onClose */
export function useBackClose(open, onClose, level = LEVEL.FENSTER) {
  const ref = useRef(onClose);
  ref.current = onClose;
  /* vor dem Zeichnen anmelden: Sobald das Fenster zu sehen ist, steht auch sein Verlaufseintrag */
  useLayoutEffect(() => {
    if (!open) return undefined;
    const s = getStack();
    return s ? s.add(level, () => ref.current && ref.current()) : undefined;
  }, [!!open, level]);
}

/* Felder, Schieberegler und Bild-Karten behalten ihre eigene Bedienung */
const OWN = "input, textarea, select, [role=slider], [contenteditable], .occ-stage, .no-sheetdrag";

/** Fenster (Bottom-Sheet) am Handy nach unten wegwischen. Nur wenn der Inhalt ganz oben steht;
    die Bewegung folgt nur dem Finger, beim Loslassen schnappt es (ohne „Bewegung aus“ kurz) zurück. */
export function useSheetDrag(ref, onClose) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    let st = null;
    /* steht zwischen Finger und Fenster etwas, das selbst nach oben gescrollt ist? */
    const scrolled = (n) => { for (; n && n !== el; n = n.parentElement) if (n.scrollTop > 0) return true; return el.scrollTop > 0; };
    const reset = (animate) => {
      el.style.transition = animate ? "transform .18s ease-out" : "";
      el.style.transform = "";
      if (animate) setTimeout(() => { el.style.transition = ""; }, 200);
    };
    const start = (e) => {
      st = e.touches.length === 1 && !e.target.closest(OWN) && !scrolled(e.target)
        ? { x: e.touches[0].clientX, y: e.touches[0].clientY, at: Date.now(), active: false, dy: 0 } : null;
    };
    const move = (e) => {
      if (!st) return;
      const t = e.touches[0], dx = t.clientX - st.x, dy = t.clientY - st.y;
      if (!st.active) {
        if (Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy)) { st = null; return; } /* seitlich: nicht unsere Geste */
        if (dy < -6) { st = null; return; } /* nach oben: Inhalt scrollen */
        if (dy < 10 || el.scrollTop > 0) return;
        st.active = true; st.y0 = t.clientY;
        el.style.transition = "none";
      }
      e.preventDefault(); /* kein Scrollen und kein Ziehen-zum-Aktualisieren dahinter */
      st.dy = Math.max(0, t.clientY - st.y0);
      el.style.transform = st.dy ? `translateY(${st.dy}px)` : "";
    };
    const end = () => {
      const s = st; st = null;
      if (!s || !s.active) return;
      if (sheetDragCloses({ dy: s.dy, ms: Date.now() - s.at, height: el.offsetHeight })) {
        closeRef.current();
        /* bleibt das Fenster doch offen (z. B. Rückfrage), steht es wieder an seinem Platz */
        setTimeout(() => { if (el.isConnected) reset(false); }, 0);
      } else reset(!motionOff());
    };
    el.addEventListener("touchstart", start, { passive: true });
    el.addEventListener("touchmove", move, { passive: false });
    el.addEventListener("touchend", end);
    el.addEventListener("touchcancel", end);
    return () => {
      el.removeEventListener("touchstart", start); el.removeEventListener("touchmove", move);
      el.removeEventListener("touchend", end); el.removeEventListener("touchcancel", end);
    };
  }, []);
}
