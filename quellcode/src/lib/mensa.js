/* Speiseplan der Mensen des Studierendenwerks München über die offene eat-api der TUM-Dev-Gruppe */
export const CANTEENS = [
  ["mensa-garching", "Mensa Garching"], ["stucafe-boltzmannstr", "StuCafé Boltzmannstraße (Garching)"], ["fmi-bistro", "FMI Bistro (Garching)"], ["stucafe-garching", "StuCafé Garching"],
  ["mensa-arcisstr", "Mensa Arcisstraße"], ["stubistro-arcisstr", "StuBistro Arcisstraße"], ["mensa-leopoldstr", "Mensa Leopoldstraße"], ["mensa-lothstr", "Mensa Lothstraße"],
  ["mensa-martinsried", "Mensa Martinsried"], ["mensa-pasing", "Mensa Pasing"], ["mensa-weihenstephan", "Mensa Weihenstephan"],
];
export const canteenName = (id) => (CANTEENS.find(([k]) => k === id) || [id, id])[1];

/** ISO-Kalenderwoche und -Jahr eines Datums (YYYY-MM-DD) */
export function isoWeek(dateStr) {
  const d = new Date(dateStr + "T12:00:00Z");
  const day = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - day + 3); /* Donnerstag derselben Woche */
  const year = d.getUTCFullYear();
  const jan4 = new Date(Date.UTC(year, 0, 4));
  return { year, week: 1 + Math.round(((d.getTime() - jan4.getTime()) / 86400000 - 3 + ((jan4.getUTCDay() + 6) % 7)) / 7) };
}

export const menuUrl = (canteen, dateStr) => { const { year, week } = isoWeek(dateStr); return `https://tum-dev.github.io/eat-api/${canteen}/${year}/${String(week).padStart(2, "0")}.json`; };

const DIET = [["VEGAN", "vegan"], ["VEGETARIAN", "vegetarisch"]];
const MEAT = new Set(["MEAT", "PORK", "BEEF", "POULTRY", "LAMB", "VEAL", "WILD_MEAT", "GAME"]);
const euro = (n) => n.toFixed(2).replace(".", ",") + " €";

/** Gerichte eines Tages, aufbereitet: Name, Art, Studentenpreis, Kennzeichnung */
export function dishesOn(week, dateStr) {
  const day = (week?.days || []).find((d) => d.date === dateStr);
  return (day?.dishes || []).map((d) => {
    const p = d.prices?.students;
    let price = "";
    if (p) price = p.price_per_unit && !p.base_price ? `${euro(p.price_per_unit)}/${p.unit || "100g"}` : p.price_per_unit ? `${euro(p.base_price)} + ${euro(p.price_per_unit)}/${p.unit || "100g"}` : p.base_price ? euro(p.base_price) : "";
    const labels = d.labels || [];
    const diet = (DIET.find(([k]) => labels.includes(k)) || [])[1] || (labels.some((l) => MEAT.has(l)) ? "Fleisch" : labels.includes("FISH") ? "Fisch" : "");
    return { name: String(d.name || "").trim(), type: String(d.dish_type || "").trim(), price, diet };
  }).filter((d) => d.name);
}

/** Welcher Tag gezeigt wird: heute bis 14:30, danach der nächste Werktag; am Wochenende Montag. */
export function menuDay(now = new Date()) {
  const d = new Date(now);
  const hm = d.getHours() * 60 + d.getMinutes();
  if (hm > 14 * 60 + 30) d.setDate(d.getDate() + 1);
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
  const iso = d.toLocaleDateString("sv-SE");
  const t0 = new Date(now), t1 = new Date(now); t1.setDate(t1.getDate() + 1);
  const label = iso === t0.toLocaleDateString("sv-SE") ? "heute" : iso === t1.toLocaleDateString("sv-SE") ? "morgen" : "am " + d.toLocaleDateString("de-DE", { weekday: "long" });
  return { date: iso, label };
}

/** Gewählte Mensa; an der TUM ohne Auswahl Garching (dort ist die Informatik) */
export const mensaOf = (settings = {}) => (settings.mensa !== undefined ? settings.mensa : /\bTUM\b|Technische Universität München/i.test(settings.university || "") ? "mensa-garching" : "");
