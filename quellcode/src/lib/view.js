/* Zuletzt geöffnete Ansicht (Bereich, Unterreiter, Modulseite), pro Gerät in localStorage.
   Nach dem Neustart öffnet StudyOS dort; App-Verknüpfungen und Teilen-Ziele setzen danach ihren eigenen Bereich. */
export const VIEW_KEY = "studyos-view";

/* Nur bekannte Werte übernehmen, damit eine alte oder kaputte Angabe nie zu einer leeren Seite führt */
const ALLOWED = {
  tab: ["heute", "module", "woche", "lernen", "mehr"],
  learn: ["timer", "einheiten", "karten", "pruefungen"],
  more: ["rueckblick", "erfolge", "hausaufgaben", "studium", "daten"],
  moduleSub: ["uebersicht", "termine", "ha", "themen", "lernzeit", "notizen", "karten"],
};

/** Gespeicherte Ansicht, bereinigt: { tab?, learn?, more?, moduleSub?, moduleId? } */
export function readView(storage = globalThis.localStorage) {
  try {
    const v = JSON.parse(storage.getItem(VIEW_KEY) || "null");
    if (!v || typeof v !== "object") return {};
    const out = {};
    for (const [k, list] of Object.entries(ALLOWED)) if (list.includes(v[k])) out[k] = v[k];
    if (typeof v.moduleId === "string" && /^[\w-]{1,40}$/.test(v.moduleId)) out.moduleId = v.moduleId;
    return out;
  } catch { return {}; }
}

/** Teile der Ansicht merken (übrige Angaben bleiben). */
export function saveView(patch, storage = globalThis.localStorage) {
  try {
    const cur = readView(storage);
    const next = { ...cur, ...patch };
    for (const k of Object.keys(next)) if (next[k] === null || next[k] === undefined) delete next[k];
    storage.setItem(VIEW_KEY, JSON.stringify(next));
  } catch { /* privates Fenster, voller Speicher: dann eben nicht */ }
}
