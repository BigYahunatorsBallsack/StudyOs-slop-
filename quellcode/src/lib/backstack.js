/* Zurück-Geste (Android-Zurück, Wischen vom Bildschirmrand, Zurück im Browser) schließt die oberste offene Ebene,
   statt die App bzw. den Bereich zu verlassen.

   Jede offene Ebene (Fenster, Termin-Karte, Vollbild, Modulseite, anderer Bereich als „Heute“) belegt einen eigenen
   Verlaufseintrag (pushState). Zurück entfernt ihn, popstate schließt dann die oberste Ebene. Schließt man eine Ebene
   per Knopf, geht der Stapel selbst zurück (history.go), und dieses popstate schließt nichts weiter.
   Abgeglichen wird gesammelt nach dem Rendern: Schließen und gleich wieder Öffnen (Notiz → Bearbeiten) behält den
   Eintrag, statt zurück- und wieder vorzugehen.

   Ebenen haben eine Stufe (BEREICH < SEITE < FENSTER); Zurück schließt immer die höchste, bei gleicher Stufe die zuletzt geöffnete. */

export const LEVEL = { BEREICH: 0, SEITE: 1, FENSTER: 2 };
const KEY = "studyosBack";

const depthOf = (state) => (state && typeof state[KEY] === "number" ? state[KEY] : 0);

/**
 * history: window.history (oder ein Ersatz im Test), target: Ziel für popstate (window).
 * activated(): hat der Nutzer schon mit der Seite interagiert? Chrome überspringt Einträge, die ohne Interaktion
 * angelegt wurden; dann warten wir mit dem Anlegen bis zum ersten Antippen (onActivate).
 * @param {{ history: any, target: any, defer?: (f: () => void) => void, timer?: (f: () => void, ms: number) => any, clearTimer?: (t: any) => void, activated?: () => boolean, onActivate?: (f: () => void) => void }} o
 */
export function createBackStack({ history, target, defer = (f) => { setTimeout(f, 0); }, timer = setTimeout, clearTimer = clearTimeout,
  activated = () => true, onActivate = (f) => { void f; } }) {
  /* base: Tiefe des Eintrags, auf dem die App gestartet ist (nach einem Neuladen können darunter alte Einträge liegen) */
  let base = depthOf(history.state), have = base, pending = null, late = null, pendingTimer = 0, scheduled = false, seq = 0, waiting = false;
  let layers = [];
  const ordered = () => layers.slice().sort((a, b) => a.level - b.level || a.seq - b.seq);

  const sync = () => {
    scheduled = false;
    if (pending !== null) return; /* erst das eigene Zurück abwarten */
    const want = base + layers.length;
    if (want > have) {
      if (!activated()) {
        if (!waiting) { waiting = true; onActivate(() => { waiting = false; schedule(); }); }
        return;
      }
      for (let d = have + 1; d <= want; d++) history.pushState({ [KEY]: d }, "");
      have = want;
    } else if (want < have) {
      pending = want;
      history.go(want - have);
      waitPop(10);
    }
  };
  /* Auf das popstate des eigenen Zurück warten. Unter Last kann es über eine Sekunde dauern; käme es nach dem Aufgeben
     als „Zurück des Nutzers“ an, schlösse es die nächste Ebene (z. B. die gerade geöffnete Termin-Karte). Darum nur
     aufgeben, wenn nach 10 s noch nichts kam (Verlauf schon am Anfang), und ein verspätetes popstate trotzdem als eigenes zählen. */
  const waitPop = (tries) => {
    pendingTimer = timer(() => {
      if (pending === null) return;
      const d = depthOf(history.state);
      if (d !== pending && tries > 0) { waitPop(tries - 1); return; }
      late = pending; pending = null;
      have = d; if (have < base) base = have;
      schedule();
    }, 1000);
  };
  const schedule = () => { if (!scheduled) { scheduled = true; defer(sync); } };

  const onPop = (e) => {
    const d = depthOf(e.state);
    const mine = (pending !== null && d === pending) || (late !== null && d === late);
    if (pending !== null) { clearTimer(pendingTimer); pending = null; }
    late = null;
    have = d;
    if (d < base) base = d;
    if (!mine) {
      /* Zurück (oder mehrere Schritte über das Verlaufsmenü): alles oberhalb schließen, oberste zuerst */
      const keep = Math.max(0, d - base), list = ordered(), gone = list.slice(keep);
      layers = layers.filter((l) => !gone.includes(l));
      gone.reverse().forEach((l) => { try { l.close(); } catch { /* eine Ebene darf die anderen nicht aufhalten */ } });
    }
    schedule();
  };
  target.addEventListener("popstate", onPop);

  return {
    /** Ebene öffnen; gibt die Funktion zum Abmelden zurück (beim Schließen per Knopf) */
    add(level, close) {
      const layer = { level, seq: ++seq, close };
      layers.push(layer);
      schedule();
      return () => { const n = layers.length; layers = layers.filter((l) => l !== layer); if (layers.length !== n) schedule(); };
    },
    size: () => layers.length,
    dispose: () => target.removeEventListener("popstate", onPop),
  };
}
