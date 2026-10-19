/* Laden und automatisches Speichern des App-Stands (IndexedDB über runtime.js), Update- und Installationshinweise. */
import { useEffect, useRef, useState } from "react";
import { emptyData, migrate } from "../lib/data.js";
import { ENV } from "../lib/env.js";

export function usePersistence() {
  const [data, setData] = useState(emptyData);
  const [ready, setReady] = useState(!ENV);
  const [loadError, setLoadError] = useState("");
  const [saveState, setSaveState] = useState(ENV ? "saved" : "memory");
  const [updateReady, setUpdateReady] = useState(false);
  const [installReady, setInstallReady] = useState(!!(ENV && ENV.pwa && ENV.pwa.isInstallable && ENV.pwa.isInstallable()));
  const [, setClock] = useState(0);
  const loadedRef = useRef(null);
  const dataRef = useRef(data);
  dataRef.current = data;

  /* Laden beim Start (nur installierte Version) */
  useEffect(() => {
    if (!ENV) return;
    let alive = true;
    ENV.load()
      .then((stored) => {
        if (!alive) return;
        if (stored) {
          const d = migrate(stored);
          const sessionKeys = (items) => JSON.stringify((items || []).map((s) => [s.id, s.date, s.seriesId]));
          loadedRef.current = d; setData(d);
          if (sessionKeys(d.sessions) !== sessionKeys(stored.sessions)) {
            setSaveState("saving");
            ENV.save(d).then(() => { if (alive) { loadedRef.current = d; setSaveState("saved"); } }).catch(() => { if (alive) setSaveState("error"); });
          }
        } else {
          /* Noch nichts gespeichert: der leere Anfangsstand gilt als gespeichert, damit beim Schließen
             nichts Leeres über Daten geschrieben wird, die inzwischen anderswo angelegt wurden */
          loadedRef.current = dataRef.current;
        }
        setReady(true);
      })
      .catch((e) => { if (alive) { setLoadError(String((e && e.message) || e)); setReady(true); } });
    const offExt = ENV.onExternalChange ? ENV.onExternalChange((stored) => { const d = migrate(stored); loadedRef.current = d; setData(d); }) : null;
    const offUpd = ENV.pwa && ENV.pwa.onUpdate ? ENV.pwa.onUpdate(() => setUpdateReady(true)) : null;
    const offInstall = ENV.pwa && ENV.pwa.onInstallable ? ENV.pwa.onInstallable((v) => setInstallReady(v)) : null;
    return () => { alive = false; offExt && offExt(); offUpd && offUpd(); offInstall && offInstall(); };
  }, []);

  /* Automatisch speichern, 400 ms nach der letzten Änderung */
  useEffect(() => {
    if (!ENV || !ready || loadError || data === loadedRef.current) return;
    setSaveState("saving");
    const id = setTimeout(() => {
      ENV.save(data).then(() => { loadedRef.current = data; setSaveState("saved"); }).catch(() => setSaveState("error"));
    }, 400);
    return () => clearTimeout(id);
  }, [data, ready, loadError]);

  /* Beim Verlassen oder Wechsel in den Hintergrund sofort sichern; Datum aktuell halten */
  useEffect(() => {
    const flush = () => {
      if (!ENV || !ready || loadError || dataRef.current === loadedRef.current) return;
      const d = dataRef.current;
      try { ENV.saveSync && ENV.saveSync(d); } catch {}
      ENV.save(d).then(() => { loadedRef.current = d; setSaveState("saved"); }).catch(() => {});
    };
    const onVis = () => { if (document.visibilityState === "hidden") flush(); else setClock((c) => c + 1); };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("pagehide", flush);
    const id = setInterval(() => setClock((c) => c + 1), 60000);
    return () => { document.removeEventListener("visibilitychange", onVis); window.removeEventListener("pagehide", flush); clearInterval(id); };
  }, [ready, loadError]);

  /** Stand sofort speichern, z. B. nach einem Export */
  const saveNow = (next) => {
    if (!ENV) { loadedRef.current = next; return; }
    setSaveState("saving");
    ENV.save(next).then(() => { loadedRef.current = next; setSaveState("saved"); }).catch(() => setSaveState("error"));
  };

  return { data, setData, dataRef, ready, loadError, saveState, saveNow, updateReady, installReady, setInstallReady };
}
