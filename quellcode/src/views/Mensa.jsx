/* Speiseplan auf „Heute“: Gerichte der gewählten Mensa, heute oder am nächsten Werktag (umschaltbar) */
import React, { useEffect, useState } from "react";
import { canteenName, dishesOn, menuDay, menuDays, menuUrl } from "../lib/mensa.js";
import { PxIcon, Tabs } from "../ui/primitives.jsx";

const CACHE = "studyos-mensa";
const readCache = () => { try { return JSON.parse(localStorage.getItem(CACHE) || "null"); } catch { return null; } };
const writeCache = (v) => { try { localStorage.setItem(CACHE, JSON.stringify(v)); } catch { /* egal */ } };

export function MensaCard({ canteen }) {
  const days = menuDays();
  const [pick, setPick] = useState(() => menuDay().date);
  const day = days.find((d) => d.date === pick) || days[0];
  const url = canteen ? menuUrl(canteen, day.date) : null;
  const [state, setState] = useState(() => { const c = readCache(); return c && c.url === url ? { week: c.week } : { loading: true }; });
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!url) return;
    const c = readCache();
    if (c && c.url === url && Date.now() - c.at < 6 * 3600 * 1000) { setState({ week: c.week }); return; }
    let live = true;
    setState((s) => (s.week ? s : { loading: true }));
    fetch(url, { cache: "no-cache" })
      .then((r) => (r.status === 404 ? { days: [] } : r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((week) => { if (!live) return; writeCache({ url, at: Date.now(), week }); setState({ week }); })
      .catch(() => { if (live) setState((s) => (s.week ? s : { error: true })); });
    return () => { live = false; };
  }, [url]);

  if (!canteen) return null;
  const dishes = state.week ? dishesOn(state.week, day.date) : [];
  const shown = open ? dishes : dishes.slice(0, 4);
  return (
    <section className="surface" aria-label="Mensa">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="section-title">Mensa {day.label}</h3>
        <span className="text-xs text-slate-500">{canteenName(canteen)}</span>
      </div>
      {days.length > 1 && <div className="mt-2"><Tabs label="Tag" items={days.map((d) => [d.date, d.label[0].toUpperCase() + d.label.slice(1).replace(/^Am /, "")])} value={day.date} onChange={setPick} /></div>}
      {state.loading ? <p className="mt-2 text-sm text-slate-400" role="status">Lädt …</p>
        : state.error ? <p className="mt-2 text-sm text-slate-400">Speiseplan gerade nicht erreichbar.</p>
        : !dishes.length ? <p className="mt-2 text-sm text-slate-400">Für {day.label} kein Speiseplan (geschlossen oder noch nicht veröffentlicht).</p>
        : (
          <ul className="mensa-list mt-2">
            {shown.map((d, i) => (
              <li key={i} className="mensa-dish">
                <PxIcon name={d.diet === "vegan" || d.diet === "vegetarisch" ? "leaf" : d.diet === "Fisch" ? "fish" : d.diet === "Fleisch" ? "meat" : "bowl"} />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm">{d.name}</span>
                  <span className="text-xs text-slate-500">{[...new Set([d.type, d.diet].filter(Boolean))].join(" · ")}</span>
                </span>
                {d.price && <span className="font-num shrink-0 text-xs text-slate-400">{d.price}</span>}
              </li>
            ))}
          </ul>
        )}
      {dishes.length > 4 && <button className="link-btn mt-2" onClick={() => setOpen(!open)} aria-expanded={open}>{open ? "Weniger" : `Alle ${dishes.length} Gerichte`}</button>}
    </section>
  );
}
