/* Gruppenabgaben: Partner an einer Abgabe (`partners`: Namen), Zuständige je Teilaufgabe (`by`: "" = ich, sonst ein Partner).
   Gemerkt wird pro Modul über die Blätter selbst: das zuletzt angelegte Blatt mit Partner-Angabe gibt das Team fürs nächste vor. */

export const MAX_PARTNERS = 6;

/** Namen säubern: getrimmt, ohne Doppelte (Groß-/Kleinschreibung egal), höchstens MAX_PARTNERS. */
export function cleanPartners(list) {
  const seen = new Set(), out = [];
  for (const raw of Array.isArray(list) ? list : []) {
    const n = String(raw || "").trim().replace(/\s+/g, " ").slice(0, 40);
    if (!n || seen.has(n.toLowerCase())) continue;
    seen.add(n.toLowerCase()); out.push(n);
  }
  return out.slice(0, MAX_PARTNERS);
}

/** Eingabe „Max, Lea“ oder „Max und Lea“ zu Namen. */
export const splitNames = (text) => String(text || "").split(/\s*(?:,|;|\s\+\s|\sund\s|\s&\s)\s*/i);

const partnersOf = (h) => (Array.isArray(h?.partners) ? h.partners : []);
const recency = (h) => `${h.created || h.issued || h.due || ""}|${h.due || ""}`;
const sheetsWithTeam = (data, moduleId, exceptId) =>
  (data?.homework || []).filter((h) => h.moduleId === moduleId && h.id !== exceptId && !h.deleted && Array.isArray(h.partners)).sort((a, b) => recency(b).localeCompare(recency(a)));

/** Team fürs nächste Blatt: das des zuletzt angelegten Blatts des Moduls, bei dem Partner eingetragen oder bewusst leer gelassen wurden. */
export function lastPartners(data, moduleId, exceptId) {
  const last = sheetsWithTeam(data, moduleId, exceptId)[0];
  return last ? cleanPartners(last.partners) : [];
}

/** Alle bisherigen Partner im Modul, zuletzt genutzte zuerst (zum Antippen). */
export function partnerSuggestions(data, moduleId, exceptId) {
  return cleanPartners(sheetsWithTeam(data, moduleId, exceptId).flatMap(partnersOf));
}

/** „mit Max“, „mit Max und Lea“, „mit Max, Lea und Tom“; ohne Partner "". */
export function withText(list) {
  const p = cleanPartners(list);
  if (!p.length) return "";
  return "mit " + (p.length === 1 ? p[0] : `${p.slice(0, -1).join(", ")} und ${p[p.length - 1]}`);
}

/** Zuständige, die nicht (mehr) im Team sind, fallen auf „ich“ zurück. */
export function fixAssignees(subtasks, partners) {
  if (!Array.isArray(subtasks)) return subtasks;
  const ok = new Set(cleanPartners(partners));
  return subtasks.map((s) => {
    if (!s.by || ok.has(s.by)) return s;
    const { by, ...rest } = s; void by;
    return rest;
  });
}
