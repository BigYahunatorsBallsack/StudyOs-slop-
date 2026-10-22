/* Laden und automatisches Speichern des App-Stands (IndexedDB über runtime.js), Update- und Installationshinweise. */
import { useEffect, useRef, useState } from "react";
import { emptyData, migrate } from "../lib/data.js";
import { ENV } from "../lib/env.js";
import { mergeData } from "../lib/sync.js";

const errText = (e) => String((e && e.message) || e);

export function usePersistence() {
  /* Hat runtime.js den Stand schon gelesen (entry.jsx wartet darauf), gilt er gleich im ersten Bild */
  const [boot] = useState(() => { const b = ENV && ENV.initialLoad(); return b && b.done ? b : null; });
  const [data, setData] = useState(() => (boot && boot.value ? migrate(boot.value) : emptyData()));
  const [ready, setReady] = useState(!ENV || !!boot);
  const [loadError, setLoadError] = useState(() => (boot && boot.error ? errText(boot.error) : ""));
  const [saveState, setSaveState] = useState(ENV ? "saved" : "memory");
  const [updateReady, setUpdateReady] = useState(false);
  const [installReady, setInstallReady] = useState(!!(ENV && ENV.pwa && ENV.pwa.isInstallable && ENV.pwa.isInstallable()));
  const [, setClock] = useState(0);
  const loadedRef = useRef(null);
  const dataRef = useRef(data);
  dataRef.current = data;
  /* Speichervorgänge nacheinander: Ein langsamer älterer (z. B. mit Tagessicherung) könnte sonst nach einem jüngeren
     fertig werden und dessen Stand in der Datenbank wieder überschreiben */
  const queueRef = useRef(Promise.resolve());
  const persist = (d) => {
    const p = queueRef.current.then(() => ENV.save(d));
    queueRef.current = p.catch(() => {});
    return p;
  };

  /* Laden beim Start (nur installierte Version) */
  useEffect(() => {
    if (!ENV) return;
    let alive = true;
    /* d: der übernommene, migrierte Stand */
    const take = (stored, d) => {
      if (stored) {
        const sessionKeys = (items) => JSON.stringify((items || []).map((s) => [s.id, s.date, s.seriesId]));
        loadedRef.current = d;
        if (sessionKeys(d.sessions) !== sessionKeys(stored.sessions)) {
          setSaveState("saving");
          persist(d).then(() => { if (alive) { loadedRef.current = d; setSaveState("saved"); } }).catch(() => { if (alive) setSaveState("error"); });
        }
      } else {
        /* Noch nichts gespeichert: der leere Anfangsstand gilt als gespeichert, damit beim Schließen
           nichts Leeres über Daten geschrieben wird, die inzwischen anderswo angelegt wurden */
        loadedRef.current = dataRef.current;
      }
    };
    if (boot) { if (!boot.error) take(boot.value, dataRef.current); }
    else {
      const b = ENV.initialLoad();
      b.promise.then(() => {
        if (!alive) return;
        if (b.error) { setLoadError(errText(b.error)); setReady(true); return; }
        const d = b.value ? migrate(b.value) : null;
        if (d) setData(d);
        take(b.value, d);
        setReady(true);
      });
    }
    /* Ein anderer Tab hat gespeichert: seinen Stand übernehmen. Gibt es hier noch ungespeicherte Änderungen
       (Speichern läuft noch oder steht aus), werden beide zusammengeführt, statt die hiesigen zu verwerfen. */
    const offExt = ENV.onExternalChange ? ENV.onExternalChange((stored) => {
      let d;
      try { d = migrate(stored); } catch { return; }
      const saved = loadedRef.current;
      loadedRef.current = d;
      setData((cur) => (cur === saved ? d : mergeData(cur, d).data));
    }) : null;
    const offUpd = ENV.pwa && ENV.pwa.onUpdate ? ENV.pwa.onUpdate(() => setUpdateReady(true)) : null;
    const offInstall = ENV.pwa && ENV.pwa.onInstallable ? ENV.pwa.onInstallable((v) => setInstallReady(v)) : null;
    return () => { alive = false; offExt && offExt(); offUpd && offUpd(); offInstall && offInstall(); };
  }, []);

  /* Automatisch speichern, 400 ms nach der letzten Änderung */
  useEffect(() => {
    if (!ENV || !ready || loadError || data === loadedRef.current) return;
    setSaveState("saving");
    const id = setTimeout(() => {
      persist(data).then(() => { loadedRef.current = data; setSaveState("saved"); }).catch(() => setSaveState("error"));
    }, 400);
    return () => clearTimeout(id);
  }, [data, ready, loadError]);

  /* Beim Verlassen oder Wechsel in den Hintergrund sofort sichern; Datum aktuell halten */
  useEffect(() => {
    const flush = () => {
      if (!ENV || !ready || loadError || dataRef.current === loadedRef.current) return;
      const d = dataRef.current;
      try { ENV.saveSync && ENV.saveSync(d); } catch {}
      persist(d).then(() => { loadedRef.current = d; setSaveState("saved"); }).catch(() => {});
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
    persist(next).then(() => { loadedRef.current = next; setSaveState("saved"); }).catch(() => setSaveState("error"));
  };

  return { data, setData, dataRef, ready, loadError, saveState, saveNow, updateReady, installReady, setInstallReady };
}
