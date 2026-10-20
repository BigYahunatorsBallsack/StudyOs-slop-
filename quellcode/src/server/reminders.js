/* Welche Erinnerungen sind fällig? Reine Logik, ohne Netz oder Datenbank. */

/** Zeitpunkt „Datum um Uhrzeit“ in einer Zeitzone als Date (berücksichtigt Sommer-/Winterzeit). */
export function zonedInstant(date, hm, tz = "Europe/Berlin") {
  const [y, mo, d] = date.split("-").map(Number);
  const [h, mi] = (hm || "00:00").split(":").map(Number);
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  const offset = (t) => {
    const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).formatToParts(new Date(t)).map((p) => [p.type, p.value]));
    return Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute) - t;
  };
  let t = guess - offset(guess);
  t = guess - offset(t);
  return new Date(t);
}

const addDays = (date, n) => { const d = new Date(date + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

/* Regeln je Art: [Tage vorher, Uhrzeit, Titel, Text] */
const RULES = {
  homework: [[1, "18:00", "Abgabe morgen", (x) => `${x.title}${x.module ? ` (${x.module})` : ""}${x.time ? `, bis ${x.time} Uhr` : ""}`], [0, "08:00", "Abgabe heute", (x) => `${x.title}${x.module ? ` (${x.module})` : ""}${x.time ? `, bis ${x.time} Uhr` : ""}`]],
  exam: [[7, "18:00", "Prüfung in einer Woche", (x) => x.module || x.title], [1, "18:00", "Prüfung morgen", (x) => `${x.module || x.title}${x.time ? ` um ${x.time}` : ""}`]],
  register: [[3, "18:00", "Anmeldeschluss in 3 Tagen", (x) => `Prüfung ${x.module || x.title}`], [0, "08:00", "Anmeldeschluss heute", (x) => `Prüfung ${x.module || x.title}`]],
  retake: [[7, "18:00", "Wiederholungsprüfung in einer Woche", (x) => x.module || x.title], [1, "18:00", "Wiederholungsprüfung morgen", (x) => x.module || x.title]],
  review: [[0, "20:00", "Noch nachzubereiten", (x) => x.body || x.title]],
  weekly: [[0, "18:00", "Deine nächste Woche", (x) => x.body || x.title]],
  /* Lernblock: 10 Minuten vor Beginn, höchstens 20 Minuten verspätet */
  /* Stundenplan geändert: sofort, höchstens 2 Stunden verspätet */
  change: [[0, (x) => x.time, "Stundenplan geändert", (x) => `${x.title}: ${x.body || "geändert"}`, 2 * 3600000]],
  block: [[0, (x) => minus(x.time, 10), "Gleich: Lernblock", (x) => `${x.time} ${x.title}${x.module ? ` (${x.module})` : ""}`, 20 * 60000]],
  /* Tagesüberblick zur gewählten Uhrzeit, höchstens 2 Stunden verspätet */
  morning: [[0, (x) => x.time || "07:00", "Dein Tag", (x) => x.body || x.title, 2 * 3600000]],
};

/* Knöpfe in der Benachrichtigung: öffnen die App mit der Aktion (?aktion=push&tun=…) */
const act = (action, title, q) => ({ action, title, url: `./?aktion=push&${q}` });
const ACTIONS = {
  homework: (x) => [act("done", "Abgegeben", `tun=abgegeben&id=${encodeURIComponent(x.id)}`), act("later", "Verschieben", `tun=verschieben&id=${encodeURIComponent(x.id)}`)],
  review: (x) => [act("reviewed", "Alles nachbereitet", `tun=nachbereitet&tag=${x.date}`)],
  block: (x) => [act("timer", "Timer starten", `tun=timer&id=${encodeURIComponent(x.id)}`)],
  register: (x) => [act("registered", "Angemeldet", `tun=angemeldet&id=${encodeURIComponent(x.id)}`)],
};
const minus = (hm, n) => { const [h, m] = String(hm || "00:00").split(":").map(Number); const t = Math.max(0, h * 60 + m - n); return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`; };
export const MAX_LATE_MS = 12 * 3600 * 1000; /* verpasste Erinnerungen höchstens 12 h später nachholen */

/**
 * @param {Array<{ id: string, kind: string, title: string, module?: string, date: string, time?: string, body?: string }>} deadlines
 * @param {Record<string, string>} [sent] bereits verschickt: Schlüssel → ISO-Zeit
 * @param {Date} [now]
 * @param {string} [tz]
 * @returns {Array<{ key: string, title: string, body: string, tag: string, url: string, actions?: Array<{ action: string, title: string, url: string }> }>}
 */
export function dueReminders(deadlines, sent = {}, now = new Date(), tz = "Europe/Berlin") {
  const out = [];
  for (const x of deadlines || []) {
    const rules = RULES[x.kind];
    if (!rules || !/^\d{4}-\d{2}-\d{2}$/.test(x.date || "")) continue;
    rules.forEach(([before, hm, title, body, maxLate = MAX_LATE_MS], i) => {
      const time = typeof hm === "function" ? hm(x) : hm;
      const at = zonedInstant(addDays(x.date, -before), time, tz);
      const key = `${x.kind}:${x.id}:${x.date}:${x.kind === "block" ? x.time + ":" : ""}${i}`;
      if (sent[key] || at > now || now.getTime() - at.getTime() > maxLate) return;
      out.push({ key, title, body: body(x), tag: `${x.kind}-${x.id}`, url: ["homework", "review", "weekly", "block", "change", "morning"].includes(x.kind) ? "./?aktion=heute" : "./?aktion=pruefungen",
        ...(ACTIONS[x.kind] && { actions: ACTIONS[x.kind](x) }) });
    });
  }
  return out;
}

/** Alte Einträge aus dem Versandprotokoll entfernen (älter als 60 Tage). @param {Record<string, string>} [sent] @param {Date} [now] */
export function pruneSent(sent = {}, now = new Date()) {
  const limit = now.getTime() - 60 * 86400000;
  return Object.fromEntries(Object.entries(sent).filter(([, at]) => new Date(at).getTime() >= limit));
}
