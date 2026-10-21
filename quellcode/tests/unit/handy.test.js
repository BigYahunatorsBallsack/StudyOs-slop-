import { describe, expect, it } from "vitest";
import { LEVEL, createBackStack } from "../../src/lib/backstack.js";
import { isSideSwipe, sheetDragCloses, swipeStep } from "../../src/lib/gestures.js";

/* Verlauf wie im Browser: Einträge mit Zustand, go() meldet popstate erst später (asynchron) */
function fakeHistory(initial = null) {
  const h = {
    entries: [initial], index: 0, listeners: [], queue: [],
    get state() { return h.entries[h.index]; },
    pushState(s) { h.entries = h.entries.slice(0, h.index + 1); h.entries.push(s); h.index++; },
    go(n) { h.queue.push(() => { h.index = Math.max(0, Math.min(h.entries.length - 1, h.index + n)); h.fire(); }); },
    back() { h.go(-1); },
    fire() { h.listeners.forEach((f) => f({ state: h.state })); },
    addEventListener(_, f) { h.listeners.push(f); },
    removeEventListener(_, f) { h.listeners = h.listeners.filter((x) => x !== f); },
    flushNav() { while (h.queue.length) h.queue.shift()(); },
  };
  return h;
}

function setup(opts = {}) {
  const h = fakeHistory(opts.initial);
  const tasks = [];
  const s = createBackStack({ history: h, target: h, defer: (f) => tasks.push(f), timer: () => 0, clearTimer: () => {}, ...opts });
  /* alles abarbeiten, bis Ruhe ist: Abgleich und Navigation im Wechsel */
  const settle = () => { for (let i = 0; i < 20 && (tasks.length || h.queue.length); i++) { while (tasks.length) tasks.shift()(); h.flushNav(); } };
  settle.tasksOnly = () => { while (tasks.length) tasks.shift()(); };
  return { h, s, settle };
}

describe("Zurück-Geste schließt Fenster (lib/backstack.js)", () => {
  it("Fenster öffnen legt einen Verlaufseintrag an, Zurück schließt es", () => {
    const { h, s, settle } = setup();
    let closed = 0;
    let off = s.add(LEVEL.FENSTER, () => { closed++; off(); });
    settle();
    expect(h.entries.length).toBe(2);
    h.back(); settle();
    expect(closed).toBe(1);
    expect(h.index).toBe(0);
    expect(s.size()).toBe(0);
  });

  it("Öffnen legt den Eintrag sofort an, damit ein schnelles Zurück das Fenster trifft", () => {
    const { h, s, settle } = setup();
    const log = [];
    s.add(LEVEL.BEREICH, () => log.push("bereich"));
    let off;
    off = s.add(LEVEL.FENSTER, () => { log.push("fenster"); off(); });
    expect(h.index).toBe(2); /* ohne den Abgleich abzuwarten */
    h.back(); settle();
    expect(log).toEqual(["fenster"]);
  });

  it("per Knopf schließen entfernt den Eintrag wieder, ohne doppelt zurückzugehen", () => {
    const { h, s, settle } = setup();
    let closed = 0;
    const offTab = s.add(LEVEL.BEREICH, () => closed++);
    const off = s.add(LEVEL.FENSTER, () => closed++);
    settle();
    expect(h.index).toBe(2);
    off(); settle();
    expect(h.index).toBe(1); /* nur ein Schritt zurück, der Bereich bleibt */
    expect(closed).toBe(0);
    offTab(); settle();
    expect(h.index).toBe(0);
    expect(closed).toBe(0);
  });

  it("Schließen und gleich wieder Öffnen behält den Eintrag (Notiz → Bearbeiten)", () => {
    const { h, s, settle } = setup();
    const off = s.add(LEVEL.FENSTER, () => {});
    settle();
    off(); s.add(LEVEL.FENSTER, () => {});
    settle();
    expect(h.queue.length).toBe(0);
    expect(h.index).toBe(1);
    expect(h.entries.length).toBe(2);
  });

  it("Zurück schließt die oberste Ebene: erst das Fenster, dann den Bereich", () => {
    const { h, s, settle } = setup();
    const log = [];
    let offWin;
    const offTab = s.add(LEVEL.BEREICH, () => { log.push("bereich"); offTab(); });
    settle();
    offWin = s.add(LEVEL.FENSTER, () => { log.push("fenster"); offWin(); });
    settle();
    h.back(); settle();
    expect(log).toEqual(["fenster"]);
    h.back(); settle();
    expect(log).toEqual(["fenster", "bereich"]);
    expect(h.index).toBe(0);
  });

  it("die Stufe zählt, nicht die Reihenfolge: ein Bereichswechsel unter offenem Fenster bleibt darunter", () => {
    const { h, s, settle } = setup();
    const log = [];
    s.add(LEVEL.FENSTER, () => log.push("fenster"));
    s.add(LEVEL.BEREICH, () => log.push("bereich"));
    settle();
    h.back(); settle();
    expect(log).toEqual(["fenster"]);
  });

  it("zwei Fenster übereinander: Zurück schließt nur das obere", () => {
    const { h, s, settle } = setup();
    const log = [];
    let offA, offB;
    offA = s.add(LEVEL.FENSTER, () => { log.push("a"); offA(); });
    offB = s.add(LEVEL.FENSTER, () => { log.push("b"); offB(); });
    settle();
    expect(h.index).toBe(2);
    h.back(); settle();
    expect(log).toEqual(["b"]);
    expect(s.size()).toBe(1);
  });

  it("schließt sich die Ebene erst später (React rendert nach popstate), legt der Abgleich keinen neuen Eintrag an", () => {
    const { h, s, settle } = setup();
    let off;
    off = s.add(LEVEL.FENSTER, () => {}); /* meldet sich nicht sofort ab */
    settle();
    h.back(); settle();
    expect(h.index).toBe(0);
    expect(h.entries.length).toBe(2);
    off(); settle(); /* spätes Abmelden ändert nichts mehr */
    expect(h.index).toBe(0);
  });

  it("kommt das eigene Zurück unter Last spät an, schließt es nicht die gerade geöffnete Ebene", () => {
    const timers = [];
    const { h, s, settle } = setup({ timer: (f) => { timers.push(f); return timers.length; } });
    const log = [];
    s.add(LEVEL.BEREICH, () => log.push("bereich"));
    const off = s.add(LEVEL.FENSTER, () => log.push("formular"));
    settle();
    off();
    /* nur den Abgleich laufen lassen, die Navigation (history.go) hängt noch */
    const tasks = () => { for (let i = 0; i < 5; i++) settle.tasksOnly(); };
    tasks();
    s.add(LEVEL.FENSTER, () => log.push("karte"));
    tasks();
    for (let i = 0; i < 3; i++) timers.shift()(); /* drei Sekunden ohne popstate */
    tasks();
    h.flushNav(); settle();
    expect(log).toEqual([]);
    expect(s.size()).toBe(2);
    expect(h.state).toEqual({ studyosBack: 2 }); /* der Eintrag der Karte steht */
  });

  it("ohne bisherige Interaktion wird mit dem Eintrag gewartet (Chrome überspringt ihn sonst)", () => {
    let active = false, wake = null;
    const { h, s, settle } = setup({ activated: () => active, onActivate: (f) => { wake = f; } });
    s.add(LEVEL.BEREICH, () => {});
    settle();
    expect(h.entries.length).toBe(1);
    active = true; wake(); settle();
    expect(h.entries.length).toBe(2);
  });

  it("nach dem Neuladen auf einem alten Eintrag zählt dieser als Boden", () => {
    const { h, s, settle } = setup({ initial: { studyosBack: 2 } });
    let closed = 0;
    let off;
    off = s.add(LEVEL.BEREICH, () => { closed++; off(); });
    settle();
    expect(h.state).toEqual({ studyosBack: 3 });
    h.back(); settle();
    expect(closed).toBe(1);
    expect(h.index).toBe(0);
  });
});

describe("Wischgesten (lib/gestures.js)", () => {
  it("Fenster schließt ab einem Viertel der Höhe (mind. 90 px) oder bei schnellem Schnippen", () => {
    expect(sheetDragCloses({ dy: 60, ms: 400, height: 600 })).toBe(false);
    expect(sheetDragCloses({ dy: 150, ms: 600, height: 600 })).toBe(true);
    expect(sheetDragCloses({ dy: 95, ms: 600, height: 200 })).toBe(true);
    expect(sheetDragCloses({ dy: 80, ms: 600, height: 200 })).toBe(false);
    expect(sheetDragCloses({ dy: 60, ms: 80, height: 600 })).toBe(true); /* geschnippt */
    expect(sheetDragCloses({ dy: 30, ms: 20, height: 600 })).toBe(false); /* zu kurz */
    expect(sheetDragCloses({ dy: -200, ms: 100, height: 600 })).toBe(false);
  });

  it("seitlicher Wisch: kurz, weit genug und deutlich waagerecht", () => {
    expect(isSideSwipe({ dx: -120, dy: 10, ms: 200 })).toBe(true);
    expect(isSideSwipe({ dx: 60, dy: 0, ms: 200 })).toBe(false);
    expect(isSideSwipe({ dx: 100, dy: 60, ms: 200 })).toBe(false);
    expect(isSideSwipe({ dx: 200, dy: 0, ms: 900 })).toBe(false);
  });

  it("Reiterwechsel: links der nächste, rechts der vorige, am Rand nichts", () => {
    expect(swipeStep(0, 7, -100)).toBe(1);
    expect(swipeStep(3, 7, 100)).toBe(2);
    expect(swipeStep(0, 7, 100)).toBe(null);
    expect(swipeStep(6, 7, -100)).toBe(null);
    expect(swipeStep(-1, 7, -100)).toBe(null);
  });
});
