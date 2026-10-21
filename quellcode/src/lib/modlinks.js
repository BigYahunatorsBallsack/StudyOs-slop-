/* Links pro Modul (Moodle-Kurs, Artemis, Zulip, Skript …): frei wählbar, bekannte Seiten bekommen ihren Namen von selbst.
   Auf der Modulseite kommen Aufzeichnungs-Link und Artemis-Abo dazu, damit nichts doppelt eingetragen werden muss. */
import { uid } from "./util.js";

/* Bekannte Seiten: Muster auf den Hostnamen → Name */
/** @type {Array<[RegExp, string]>} */
const KNOWN = [
  [/(^|\.)moodle\./i, "Moodle"],
  [/(^|\.)artemis\./i, "Artemis"],
  [/(^|\.)zulip\.|\.zulipchat\.com$/i, "Zulip"],
  [/^live\.rbg\.tum\.de$/i, "TUM-Live"],
  [/^(campus|tumonline)\.tum\.de$/i, "TUMonline"],
  [/(^|\.)gitlab\./i, "GitLab"],
  [/(^|\.)github\.com$/i, "GitHub"],
  [/(^|\.)piazza\.com$/i, "Piazza"],
  [/(^|\.)discord\.(gg|com)$/i, "Discord"],
  [/(^|\.)sharelatex\.|(^|\.)overleaf\.com$/i, "Overleaf"],
];

/** Eingabe zu einer vollständigen Adresse: ohne Schema gilt https://; sonst null. */
export function normalizeUrl(raw) {
  const t = String(raw || "").trim();
  if (!t) return null;
  const withScheme = /^[a-z][a-z\d+.-]*:/i.test(t) ? t : "https://" + t;
  try {
    const u = new URL(withScheme);
    if (!/^https?:$/.test(u.protocol) || !u.hostname.includes(".")) return null;
    return u.href;
  } catch { return null; }
}

/** Name für eine Adresse: bekannte Seite, sonst der Hostname ohne „www.“. */
export function linkName(url) {
  let host = "";
  try { host = new URL(normalizeUrl(url) || "").hostname; } catch { return ""; }
  for (const [re, name] of KNOWN) if (re.test(host)) return name;
  return host.replace(/^www\./i, "");
}

/** Leere Zeile für das Formular */
export const newLink = () => ({ id: uid(), name: "", url: "" });

/** Fürs Speichern: leere Zeilen weg, Adressen vervollständigen, fehlende Namen ergänzen. Ungültige bleiben (für die Prüfung). */
export function cleanLinks(list) {
  return (Array.isArray(list) ? list : [])
    .map((l) => ({ ...l, name: String(l.name || "").trim(), url: String(l.url || "").trim() }))
    .filter((l) => l.url || l.name)
    .map((l) => { const url = normalizeUrl(l.url) || l.url; return { ...l, url, name: l.name || linkName(url) }; });
}

/** Fehlertext fürs Formular, sonst "". */
export function linksError(list) {
  const bad = (Array.isArray(list) ? list : []).find((l) => (String(l.url || "").trim() || String(l.name || "").trim()) && !normalizeUrl(l.url));
  return bad ? `Der Link „${bad.name || bad.url || "ohne Adresse"}“ ist keine gültige Adresse.` : "";
}

/** Kursseite aus einem Artemis-Kalender-Abo (…/courses/123/…) */
export function artemisCourseUrl(feedUrl) {
  try {
    const u = new URL(feedUrl), m = /\/courses\/(\d+)(?:\/|$)/.exec(u.pathname);
    return m ? `${u.origin}/courses/${m[1]}` : null;
  } catch { return null; }
}

const sameUrl = (a, b) => String(a || "").replace(/\/+$/, "").toLowerCase() === String(b || "").replace(/\/+$/, "").toLowerCase();

/** Alle Links eines Moduls für die Knopfzeile: eigene, dann Aufzeichnungen und Artemis-Kurs (sofern nicht schon eingetragen). */
export function moduleLinks(m, settings = {}) {
  const own = cleanLinks(m?.links).filter((l) => normalizeUrl(l.url));
  /** @type {Array<{ name: string, url: string, auto?: boolean }>} */
  const out = own.map((l) => ({ name: l.name, url: l.url }));
  const add = (name, url) => { if (url && !out.some((l) => sameUrl(l.url, url))) out.push({ name, url, auto: true }); };
  add("Aufzeichnungen", m?.liveUrl);
  const hasArtemis = own.some((l) => linkName(l.url) === "Artemis");
  if (!hasArtemis) for (const f of settings.artemisFeeds || []) if (f.moduleId === m?.id) add("Artemis", artemisCourseUrl(f.url));
  return out;
}
