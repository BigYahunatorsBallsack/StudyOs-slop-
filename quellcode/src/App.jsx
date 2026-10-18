import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useCloudSync } from "./cloud/useCloudSync.js";
import { COLL, COLLS, DATA_VERSION, DONE_HW, TIMER_KEY } from "./lib/constants.js";
import { buildWeeklySeries, emptyData, migrate } from "./lib/data.js";
import { ENV } from "./lib/env.js";
import { loadTimer, remainingOf } from "./lib/timer.js";
import { diffDays, iso, uid } from "./lib/util.js";
import { FormModal } from "./ui/FormModal.jsx";
import { Icon, Toasts } from "./ui/primitives.jsx";
import { btnGhost, btnPrimary } from "./ui/styles.js";
import { Learn } from "./views/Learn.jsx";
import { ModuleDetail, ModuleList } from "./views/Modules.jsx";
import { More } from "./views/More.jsx";
import { NoteViewer, SearchModal } from "./views/Search.jsx";
import { Today } from "./views/Today.jsx";
import { WeekView } from "./views/Week.jsx";
import { mergeData, stampChanges } from "./lib/sync.js";
import { TimerBadge, TimerTitle } from "./ui/timer.jsx";
import { ShortcutHelp, shortcutHandler } from "./ui/shortcuts.jsx";
import { QuickAdd } from "./ui/QuickAdd.jsx";
import { FEED_VERSION, applyFeed, resolveNewModules, unmappedSummaries } from "./lib/feed.js";
import { parseICS } from "./lib/ics.js";
import { mergeModules } from "./lib/modules.js";
import { saveSessionEdit } from "./lib/series.js";
import { buildHomeworkSeries } from "./lib/study.js";
import { applySemester } from "./lib/curriculum.js";
import { parseShareLocation } from "./lib/share.js";
import { applyMoodle, unmappedCourses } from "./lib/moodle.js";
import { ShareImport } from "./views/Share.jsx";

const FONT_CSS = `.font-ui{font-family:Inter,system-ui,-apple-system,'Segoe UI',Roboto,sans-serif}
.font-num{font-family:var(--font-display);font-variant-numeric:tabular-nums}
.no-scrollbar::-webkit-scrollbar{display:none}.no-scrollbar{scrollbar-width:none}
.sheet{max-height:92vh;max-height:92dvh;padding-bottom:calc(1.25rem + env(safe-area-inset-bottom))}
.safe-top{padding-top:env(safe-area-inset-top)}
.safe-bottom{padding-bottom:env(safe-area-inset-bottom)}
.toast-pos{bottom:calc(4.5rem + env(safe-area-inset-bottom))}
.md h1,.md h2,.md h3{font-weight:600;margin:.9em 0 .35em}.md h1{font-size:1.15rem}.md h2{font-size:1.05rem}.md h3{font-size:.95rem}
.md p{margin:.45em 0}.md ul{list-style:disc;padding-left:1.25rem;margin:.45em 0}.md ol{list-style:decimal;padding-left:1.25rem;margin:.45em 0}
.md code{font-family:'JetBrains Mono',ui-monospace,monospace;font-size:.85em;background:#1e293b;border-radius:.25rem;padding:.05em .3em}
.md pre{background:#020617;border:1px solid #1e293b;border-radius:.5rem;padding:.75rem;overflow-x:auto;margin:.6em 0}.md pre code{background:none;padding:0}
.md a{color:#7dd3fc;text-decoration:underline}.md blockquote{border-left:3px solid #334155;padding-left:.75rem;color:#94a3b8;margin:.5em 0}
html{-webkit-tap-highlight-color:transparent}body{overscroll-behavior-y:none}
@media (prefers-reduced-motion: reduce){*{transition:none!important;animation:none!important}}`;

/* ---------------- App ---------------- */
export default function App() {
  const [data, setData] = useState(emptyData);
  const [ready, setReady] = useState(!ENV);
  const [loadError, setLoadError] = useState("");
  const [saveState, setSaveState] = useState(ENV ? "saved" : "memory");
  const [tab, setTab] = useState("heute");
  const [moduleId, setModuleId] = useState(null);
  const [learnTab, setLearnTab] = useState("timer");
  const [moreTab, setMoreTab] = useState("rueckblick");
  const [cardFilter, setCardFilter] = useState("");
  const [form, setForm] = useState(null);
  const [noteView, setNoteView] = useState(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [bannerOpen, setBannerOpen] = useState(true);
  const [toasts, setToasts] = useState([]);
  const [updateReady, setUpdateReady] = useState(false);
  const [installReady, setInstallReady] = useState(!!(ENV && ENV.pwa && ENV.pwa.isInstallable && ENV.pwa.isInstallable()));
  const [, setClock] = useState(0);
  const loadedRef = useRef(null);
  const dataRef = useRef(data);
  dataRef.current = data;
  const audioRef = useRef(null);

  const toast = (text, action, ms = 5000) => {
    const id = uid();
    setToasts((t) => [...t.slice(-2), { id, text, action }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), ms);
  };
  const closeToast = (id) => setToasts((t) => t.filter((x) => x.id !== id));

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

  /* Farbschema: dunkel, hell oder wie das System */
  const theme = data.settings.theme || "dark";
  useEffect(() => {
    const root = document.documentElement;
    const mq = window.matchMedia ? window.matchMedia("(prefers-color-scheme: light)") : null;
    const apply = () => {
      const light = theme === "light" || (theme === "system" && mq && mq.matches);
      root.dataset.theme = light ? "light" : "dark";
      const meta = document.querySelector('meta[name="theme-color"]');
      if (meta) meta.setAttribute("content", light ? "#f2f0fa" : "#1b1830");
    };
    apply();
    if (theme === "system" && mq && mq.addEventListener) { mq.addEventListener("change", apply); return () => mq.removeEventListener("change", apply); }
  }, [theme]);

  /* Geteilter Kartenstapel (?teilen=…#k=…) */
  const [shareIn, setShareIn] = useState(null);
  useEffect(() => {
    if (!ready) return;
    const s = parseShareLocation(window.location);
    if (!s) return;
    window.history.replaceState(null, "", window.location.pathname);
    setShareIn(s);
  }, [ready]);

  /* App-Verknüpfungen vom Homescreen (?aktion=…) einmalig ausführen */
  useEffect(() => {
    if (!ready) return;
    const params = new URLSearchParams(window.location.search);
    const a = params.get("aktion");
    if (!a) return;
    window.history.replaceState(null, "", window.location.pathname);
    if (a === "lerneinheit") openForm("log", { date: iso() }, true);
    else if (a === "notiz") openForm("note", null, true);
    else if (a === "timer") { setLearnTab("timer"); setTab("lernen"); }
    else if (a === "karten") { setLearnTab("karten"); setTab("lernen"); }
    else if (a === "pruefungen") { setLearnTab("pruefungen"); setTab("lernen"); }
    else if (a === "heute") setTab("heute");
  }, [ready]);

  /* Tastenkürzel (Desktop): siehe ui/shortcuts.jsx; Aktionen über eine Ref, damit der Handler stabil bleibt */
  const [helpOpen, setHelpOpen] = useState(false);
  const [quickOpen, setQuickOpen] = useState(false);
  const shortcutActs = useRef(null);
  shortcutActs.current = {
    search: () => setSearchOpen(true),
    help: () => setHelpOpen(true),
    quick: () => setQuickOpen(true),
    create: (kind) => openForm(kind, kind === "log" ? { date: iso() } : null, true),
    timer: () => { setLearnTab("timer"); setTab("lernen"); },
    tab: (k) => { setTab(k); if (k === "module") setModuleId(null); window.scrollTo && window.scrollTo(0, 0); },
  };
  useEffect(() => {
    const handler = shortcutHandler(new Proxy({}, { get: (_, k) => (...a) => shortcutActs.current[k](...a) }));
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  const openForm = (kind, initial = null, isNew) => setForm({ kind, initial: initial || {}, isNew: isNew ?? !(initial && initial.id) });

  /* Jede Änderung bekommt Zeitstempel (bzw. Grabsteine), damit Sicherungen zweier Geräte zusammengeführt werden können. */
  const change = (fn) => { setData((d) => stampChanges(d, typeof fn === "function" ? fn(d) : fn)); setDirty(true); };
  const patch = (coll, id, p) => change((d) => ({ ...d, [coll]: d[coll].map((x) => (x.id === id ? { ...x, ...(typeof p === "function" ? p(x) : p) } : x)) }));
  const withUndo = (label, fn) => {
    const before = dataRef.current, after = stampChanges(before, fn(before));
    setData(after); setDirty(true);
    toast(label, { label: "Rückgängig", run: () => setData((cur) => (cur === after ? before : cur)) }, 7000);
  };

  const saveEntity = (kind, vals, isNew, extra = {}) => change((d0) => {
    const lastModule = kind === "module" ? d0.meta?.lastModule : vals.moduleId || d0.meta?.lastModule || "";
    const d = { ...d0, meta: { ...d0.meta, lastModule } };
    const coll = COLL[kind];
    if (kind === "homework" && isNew && vals.repeatUntil) {
      const { repeatUntil, ...base } = vals;
      const list = buildHomeworkSeries({ ...base, created: iso() }, repeatUntil);
      setTimeout(() => toast(`${list.length} Blätter angelegt.`), 0);
      return { ...d, homework: [...d.homework, ...list] };
    }
    if (kind === "session" && isNew && vals.repeatUntil) {
      const { repeatUntil, ...base } = vals;
      return { ...d, sessions: [...d.sessions, ...buildWeeklySeries(base, repeatUntil)] };
    }
    const item = { ...vals }; delete item.repeatUntil;
    if (isNew) {
      item.id = item.id || uid(); item.created = iso();
      if (kind === "module") d.meta.lastModule = item.id;
      if (kind === "session") Object.assign(item, { cancelled: false, prepared: false, attended: false, reviewed: false, reviewedAt: null });
      if (kind === "card") Object.assign(item, { ease: 2.5, interval: 0, reps: 0, due: iso() });
      if (kind === "topic" && (item.order === null || item.order === undefined)) item.order = d.topics.filter((x) => x.moduleId === item.moduleId).length + 1;
    }
    if (kind === "homework") item.doneAt = DONE_HW.has(item.status) ? item.doneAt || iso() : null;
    if (kind === "homework" && !isNew && item.feedKey) {
      /* von Hand geänderte Felder übernimmt das Moodle-Abo nicht mehr */
      const old = d.homework.find((x) => x.id === item.id) || {};
      const locked = new Set(old.locked || []);
      ["title", "moduleId"].forEach((k) => { if ((old[k] || "") !== (item[k] || "")) locked.add(k); });
      if (old.due !== item.due || (old.dueTime || "") !== (item.dueTime || "")) locked.add("due");
      item.locked = [...locked];
    }
    if (kind === "note") item.updated = iso();
    if (kind === "session" && !isNew) {
      const r = saveSessionEdit(d.sessions, item, !!extra.applySeries);
      if (r.count) setTimeout(() => toast(`Auch ${r.count} folgende ${r.count === 1 ? "Termin" : "Termine"} geändert.`), 0);
      return { ...d, sessions: r.sessions };
    }
    return { ...d, [coll]: isNew ? [...d[coll], item] : d[coll].map((x) => (x.id === item.id ? item : x)) };
  });

  const removeEntity = (kind, id) => withUndo(kind === "module" ? "Modul gelöscht." : "Eintrag gelöscht.", (d) => {
    const n = { ...d };
    if (kind === "module") {
      COLLS.forEach((c) => { n[c] = c === "modules" ? d.modules.filter((x) => x.id !== id) : d[c].filter((x) => x.moduleId !== id); });
      n.logs = d.logs.map((l) => (l.moduleId === id ? { ...l, moduleId: "", topicId: "" } : l));
      n.notes = d.notes.map((x) => (x.moduleId === id ? { ...x, moduleId: "", sessionId: "" } : x));
      return n;
    }
    n[COLL[kind]] = d[COLL[kind]].filter((x) => x.id !== id);
    if (kind === "topic") { n.logs = d.logs.map((l) => (l.topicId === id ? { ...l, topicId: "" } : l)); n.cards = d.cards.map((c) => (c.topicId === id ? { ...c, topicId: "" } : c)); }
    if (kind === "session") n.notes = d.notes.map((x) => (x.sessionId === id ? { ...x, sessionId: "" } : x));
    /* gelöschte Moodle-Abgaben merken, damit das Abo sie nicht wieder anlegt */
    const hw = kind === "homework" && d.homework.find((x) => x.id === id);
    if (hw?.feedKey && d.settings.moodleFeed) n.settings = { ...d.settings, moodleFeed: { ...d.settings.moodleFeed, dismissed: [...(d.settings.moodleFeed.dismissed || []), hw.feedKey].slice(-500) } };
    return n;
  });

  const removeSeries = (sid) => withUndo("Serie gelöscht.", (d) => {
    const ids = new Set(d.sessions.filter((s) => s.seriesId === sid).map((s) => s.id));
    return { ...d, sessions: d.sessions.filter((s) => !ids.has(s.id)), notes: d.notes.map((x) => (ids.has(x.sessionId) ? { ...x, sessionId: "" } : x)) };
  });

  const signal = () => {
    if (!data.settings.sound) return;
    try { navigator.vibrate && navigator.vibrate([180, 90, 180]); } catch {}
    const ctx = audioRef.current; if (!ctx) return;
    try {
      [0, 0.28, 0.56].forEach((t, i) => {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.frequency.value = i === 2 ? 880 : 660; o.connect(g); g.connect(ctx.destination);
        g.gain.setValueAtTime(0.0001, ctx.currentTime + t); g.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + t + 0.22);
        o.start(ctx.currentTime + t); o.stop(ctx.currentTime + t + 0.25);
      });
    } catch {}
  };

  const modMap = useMemo(() => Object.fromEntries(data.modules.map((m) => [m.id, m])), [data.modules]);

  /* Timer (bleibt beim Tabwechsel aktiv) */
  const [timer, setTimer] = useState(loadTimer);
  useEffect(() => { try { localStorage.setItem(TIMER_KEY, JSON.stringify(timer)); } catch {} }, [timer]);
  /* Ablauf per Einmal-Timeout statt Dauer-Intervall: Die App rendert nur beim Ende neu. */
  const [expiry, setExpiry] = useState(0);
  useEffect(() => {
    if (!timer.running) return;
    const id = setTimeout(() => setExpiry((x) => x + 1), Math.max(0, timer.endAt - Date.now()) + 60);
    return () => clearTimeout(id);
  }, [timer.running, timer.endAt]);
  useEffect(() => {
    const onVis = () => { if (document.visibilityState === "visible") setExpiry((x) => x + 1); };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);
  useEffect(() => {
    if (!timer.running || remainingOf(timer) > 0) return;
    signal();
    if (timer.mode === "focus") {
      setTimer((t) => ({ ...t, running: false, mode: "break", remaining: t.brk * 60 }));
      const init = { minutes: timer.length, moduleId: timer.moduleId, topicId: timer.topicId, kind: "Nacharbeiten", date: iso() };
      if (form) toast("Fokusphase beendet.", { label: "Eintragen", run: () => openForm("log", init, true) }, 15000);
      else openForm("log", init, true);
    } else { setTimer((t) => ({ ...t, running: false, mode: "focus", remaining: t.length * 60 })); toast("Pause vorbei. Weiter geht's!"); }
  }, [expiry, timer.running, timer.endAt]);
  const timerApi = {
    ...timer,
    start: () => {
      try { const AC = window.AudioContext || window.webkitAudioContext; if (AC && !audioRef.current) audioRef.current = new AC(); audioRef.current && audioRef.current.state === "suspended" && audioRef.current.resume(); } catch {}
      setTimer((t) => ({ ...t, running: true, endAt: Date.now() + t.remaining * 1000 }));
    },
    pause: () => setTimer((t) => ({ ...t, running: false, remaining: Math.max(0, Math.ceil((t.endAt - Date.now()) / 1000)) })),
    reset: () => setTimer((t) => ({ ...t, running: false, remaining: (t.mode === "focus" ? t.length : t.brk) * 60 })),
    setMode: (m) => setTimer((t) => ({ ...t, mode: m, running: false, remaining: (m === "focus" ? t.length : t.brk) * 60 })),
    setLength: (n) => setTimer((t) => ({ ...t, length: n, ...(t.mode === "focus" && !t.running ? { remaining: n * 60 } : {}) })),
    set: (p) => setTimer((t) => ({ ...t, ...p })),
    stopAndLog: () => {
      const mins = Math.round((timer.length * 60 - remainingOf(timer)) / 60);
      setTimer((t) => ({ ...t, running: false, remaining: t.length * 60 }));
      if (mins >= 1) openForm("log", { minutes: mins, moduleId: timer.moduleId, topicId: timer.topicId, kind: "Nacharbeiten", date: iso() }, true);
    },
  };

  /* Ersetzen (Import, Wiederherstellen, Löschen, Beispieldaten): standardmäßig mit Zeitstempeln und Grabsteinen,
     damit das Ersetzen auch per Sync auf anderen Geräten ankommt. Beim Zusammenführen sind die Stempel schon richtig. */
  const replaceAll = (nd, label = "Vor dem Ersetzen", { stamp = true } = {}) => {
    const before = dataRef.current;
    if (ENV && ENV.snapshot) ENV.snapshot(label, before).catch(() => {});
    const next = stamp ? stampChanges(before, nd) : nd;
    dataRef.current = next;
    setData(next); setDirty(true); setModuleId(null);
  };

  /* Cloud-Sync */
  const getLocal = useCallback(() => dataRef.current, []);
  const applyRemote = useCallback((merged, base) => {
    if (dataRef.current === base) dataRef.current = merged;
    setData((cur) => (cur === base || cur === merged ? merged : mergeData(cur, merged).data));
  }, []);
  const onPushEnabled = useCallback(() => change((d) => (d.settings.push ? d : { ...d, settings: { ...d.settings, push: true } })), []);
  const syncFeedRef = useRef(null);
  const cloud = useCloudSync({ ready, enabled: !loadError, data, getLocal, applyLocal: applyRemote, onPushEnabled });

  /* Ergebnis aus dem aktuellen Stand berechnen und übernehmen; hat sich der Stand inzwischen geändert, neu berechnen */
  const commitFeed = (compute) => {
    const base = dataRef.current, res = compute(base);
    change((d) => (d === base ? res.next : compute(d).next));
    return res.stats;
  };
  /* Stundenplan-Abo abrufen und abgleichen; automatisch, wenn der letzte Abruf über 6 Stunden her ist */
  syncFeedRef.current = async ({ manual } = {}) => {
    const feed = dataRef.current.settings.icsFeed;
    if (!feed || !feed.url || cloud.phase !== "ready") return null;
    try {
      const events = parseICS(await cloud.fetchIcs(feed.url));
      return commitFeed((d) => {
        const r = applyFeed(d, events, d.settings.icsFeed.map);
        return { stats: r.stats, next: { ...d, sessions: r.sessions, notes: r.notes, settings: { ...d.settings, icsFeed: { ...d.settings.icsFeed, v: FEED_VERSION, lastSync: new Date().toISOString(), pending: unmappedSummaries(events, d.settings.icsFeed.map), lastError: "" } } } };
      });
    } catch (e) {
      if (manual) throw e;
      change((d) => (d.settings.icsFeed ? { ...d, settings: { ...d.settings, icsFeed: { ...d.settings.icsFeed, lastError: e.message || String(e) } } } : d));
      return null;
    }
  };
  /* Moodle-Fristen: gleiches Muster wie das Stundenplan-Abo */
  const syncMoodleRef = useRef(null);
  syncMoodleRef.current = async ({ manual } = {}) => {
    const feed = dataRef.current.settings.moodleFeed;
    if (!feed || !feed.url || cloud.phase !== "ready") return null;
    try {
      const events = parseICS(await cloud.fetchIcs(feed.url));
      return commitFeed((d) => {
        const mf = d.settings.moodleFeed;
        const r = applyMoodle(d, events, mf.map, iso(), mf.dismissed || []);
        return { stats: r.stats, next: { ...d, homework: r.homework, settings: { ...d.settings, moodleFeed: { ...mf, lastSync: new Date().toISOString(), pending: unmappedCourses(events, mf.map), lastError: "" } } } };
      });
    } catch (e) {
      if (manual) throw e;
      change((d) => (d.settings.moodleFeed ? { ...d, settings: { ...d.settings, moodleFeed: { ...d.settings.moodleFeed, lastError: e.message || String(e) } } } : d));
      return null;
    }
  };
  const moodleDue = !!data.settings.moodleFeed?.url && (!data.settings.moodleFeed.lastSync || Date.now() - new Date(data.settings.moodleFeed.lastSync).getTime() > 3 * 3600 * 1000);
  useEffect(() => {
    if (!ready || loadError || cloud.phase !== "ready" || !moodleDue) return;
    const id = setTimeout(() => syncMoodleRef.current(), 6000);
    return () => clearTimeout(id);
  }, [ready, loadError, cloud.phase, moodleDue]);

  const feedDue = !!data.settings.icsFeed?.url && (!data.settings.icsFeed.lastSync || (data.settings.icsFeed.v || 1) < FEED_VERSION || Date.now() - new Date(data.settings.icsFeed.lastSync).getTime() > 6 * 3600 * 1000);
  useEffect(() => {
    if (!ready || loadError || cloud.phase !== "ready" || !feedDue) return;
    const id = setTimeout(() => syncFeedRef.current(), 4000);
    return () => clearTimeout(id);
  }, [ready, loadError, cloud.phase, feedDue]);

  const db = {
    data, mod: (id) => modMap[id], openForm, patch, change, toast, env: ENV, saveState, updateReady,
    toggleSession: (id, key) => patch("sessions", id, (s) => (key === "reviewed" ? { reviewed: !s.reviewed, reviewedAt: !s.reviewed ? iso() : null } : { [key]: !s[key] })),
    setHwStatus: (id, status) => patch("homework", id, (h) => ({ status, doneAt: DONE_HW.has(status) ? h.doneAt || iso() : null })),
    patchSettings: (p) => change((d) => ({ ...d, settings: { ...d.settings, ...p } })),
    replaceAll, withUndo,
    saveQuick: (kind, vals, label) => {
      saveEntity(kind, vals, true);
      toast(`${label} angelegt.`, { label: "Rückgängig", run: () => removeEntity(kind, vals.id) }, 6000);
    },
    cardsFromNote: (note, list) => {
      const today = iso();
      const fresh = list.map((c) => ({ ...c, id: uid(), moduleId: note.moduleId, topicId: "", tags: "", created: today, ease: 2.5, interval: 0, reps: 0, due: today, fromNote: note.id }));
      withUndo(`${fresh.length} ${fresh.length === 1 ? "Karteikarte" : "Karteikarten"} aus „${note.title}“ erzeugt.`, (d) => ({ ...d, cards: [...d.cards, ...fresh] }));
    },
    applyCurriculum: (plan, sem, status) => {
      const res = applySemester(dataRef.current, plan, sem, status);
      withUndo(`Semester ${sem}: ${res.added} ${res.added === 1 ? "Modul" : "Module"} angelegt${res.updated ? `, ${res.updated} ergänzt` : ""}.`, () => res.data);
    },
    archiveSemester: (sem, on) => withUndo(on ? `Semester ${sem} archiviert.` : `Semester ${sem} zurückgeholt.`, (d) => ({ ...d, modules: d.modules.map((m) => ((m.semester || 0) === sem ? { ...m, archived: on } : m)) })),
    mergeModules: (targetId, sourceIds) => {
      const name = modMap[targetId]?.name || "Modul";
      withUndo(`${sourceIds.length + 1} Module zu „${name}“ zusammengeführt.`, (d) => mergeModules(d, targetId, sourceIds));
    },
    dismissMerge: (key) => change((d) => ({ ...d, settings: { ...d.settings, mergeDismissed: [...(d.settings.mergeDismissed || []), key] } })),
    /* Stundenplan-Abo */
    subscribeFeed: async (url, draftMap, events) => commitFeed((d) => {
      const { modules, map } = resolveNewModules(d, draftMap);
      const r = applyFeed({ ...d, modules }, events, map);
      return { stats: r.stats, next: { ...d, modules, sessions: r.sessions, notes: r.notes, settings: { ...d.settings, icsFeed: { url, map, v: FEED_VERSION, lastSync: new Date().toISOString(), pending: [], lastError: "" } } } };
    }),
    mapFeed: async (extra) => {
      const events = parseICS(await cloud.fetchIcs(dataRef.current.settings.icsFeed.url));
      return commitFeed((d) => {
        const { modules, map } = resolveNewModules(d, { ...d.settings.icsFeed.map, ...extra });
        const r = applyFeed({ ...d, modules }, events, map);
        return { stats: r.stats, next: { ...d, modules, sessions: r.sessions, notes: r.notes, settings: { ...d.settings, icsFeed: { ...d.settings.icsFeed, map, v: FEED_VERSION, pending: unmappedSummaries(events, map), lastSync: new Date().toISOString(), lastError: "" } } } };
      });
    },
    syncFeed: (opts) => syncFeedRef.current(opts),
    subscribeMoodle: async (url, draftMap, events) => commitFeed((d) => {
      const { modules, map } = resolveNewModules(d, draftMap);
      const r = applyMoodle({ ...d, modules }, events, map);
      return { stats: r.stats, next: { ...d, modules, homework: r.homework, settings: { ...d.settings, moodleFeed: { url, map, dismissed: [], lastSync: new Date().toISOString(), pending: [], lastError: "" } } } };
    }),
    mapMoodle: async (extra) => {
      const events = parseICS(await cloud.fetchIcs(dataRef.current.settings.moodleFeed.url));
      return commitFeed((d) => {
        const mf = d.settings.moodleFeed;
        const { modules, map } = resolveNewModules(d, { ...mf.map, ...extra });
        const r = applyMoodle({ ...d, modules }, events, map, iso(), mf.dismissed || []);
        return { stats: r.stats, next: { ...d, modules, homework: r.homework, settings: { ...d.settings, moodleFeed: { ...mf, map, pending: unmappedCourses(events, map), lastSync: new Date().toISOString(), lastError: "" } } } };
      });
    },
    syncMoodle: (opts) => syncMoodleRef.current(opts),
    unsubscribeMoodle: () => change((d) => { const { moodleFeed, ...settings } = d.settings; void moodleFeed; return { ...d, settings }; }),
    unsubscribeFeed: () => change((d) => { const { icsFeed, ...settings } = d.settings; return { ...d, settings }; }),
    mergeIn: (remote) => { const { data: merged, stats } = mergeData(dataRef.current, remote); replaceAll(merged, "Vor dem Zusammenführen", { stamp: false }); return stats; },
    cloud,
    markSaved: (snapshot) => {
      const next = snapshot || { ...dataRef.current, meta: { ...dataRef.current.meta, lastBackup: new Date().toISOString() } };
      dataRef.current = next; setData(next); setDirty(false);
      if (ENV) { setSaveState("saving"); ENV.save(next).then(() => { loadedRef.current = next; setSaveState("saved"); }).catch(() => setSaveState("error")); }
      else loadedRef.current = next;
    },
    openNote: (id) => setNoteView(id),
    openSearch: () => setSearchOpen(true),
    install: async () => { if (ENV && ENV.pwa && ENV.pwa.install) { const r = await ENV.pwa.install(); if (r) { setInstallReady(false); toast("StudyOS wurde installiert."); } return r; } return false; },
    applyUpdate: async () => { try { if (ENV) await ENV.save(dataRef.current); } catch {} ENV && ENV.pwa && ENV.pwa.applyUpdate(); },
    goModule: (id) => { setModuleId(id); setTab("module"); },
    goLearn: (sub, mid) => { setLearnTab(sub); if (mid !== undefined) setCardFilter(mid); setTab("lernen"); },
    goMore: (sub) => { setMoreTab(sub); setTab("mehr"); },
  };

  const openResult = (r) => {
    setSearchOpen(false);
    if (r.kind === "module") db.goModule(r.item.id);
    else if (r.kind === "note") setNoteView(r.item.id);
    else if (r.kind === "exam") db.goLearn("pruefungen");
    else openForm(r.kind, r.item);
  };

  const nav = [["heute", "Heute", "today"], ["module", "Module", "modules"], ["woche", "Woche", "week"], ["lernen", "Lernen", "learn"], ["mehr", "Mehr", "more"]];
  const backupAge = data.meta?.lastBackup ? diffDays(data.meta.lastBackup.slice(0, 10), iso()) : null;
  const hasData = data.modules.length + data.logs.length + data.notes.length > 0;
  const noteObj = noteView ? data.notes.find((n) => n.id === noteView) : null;

  if (!ready) {
    return (
      <div className="font-ui flex min-h-screen items-center justify-center bg-slate-950 text-slate-400">
        <style>{FONT_CSS}</style>
        <p className="text-sm">StudyOS wird geladen …</p>
      </div>
    );
  }

  return (
    <div className="font-ui min-h-screen">
      <style>{FONT_CSS}</style>
      <header className="appbar safe-top sticky top-0 z-20">
        <div className="mx-auto flex max-w-3xl items-center gap-2 px-4 py-3">
          <h1 className="brand">StudyOS</h1>
          <span className="hidden text-xs text-slate-500 sm:inline">{[data.settings.program, data.settings.university].filter(Boolean).join(", ")}</span>
          <div className="ml-auto flex items-center gap-2">
            <TimerBadge timer={timer} onClick={() => db.goLearn("timer")} />
            {saveState === "memory" && dirty && (
              <button onClick={() => db.goMore("daten")} className="pill-status bg-amber-500/15 text-amber-200">Nicht gesichert</button>
            )}
            {cloud.phase === "ready" && (cloud.status === "error" || cloud.status === "offline") && (
              <button onClick={() => db.goMore("daten")} className={`pill-status ${cloud.status === "error" ? "bg-rose-500/15 text-rose-200" : "bg-slate-800 text-slate-400"}`} title={cloud.error || "Offline, synchronisiert später"}>
                {cloud.status === "error" ? "Sync-Fehler" : "Offline"}
              </button>
            )}
            {saveState === "error" && (
              <button onClick={() => db.goMore("daten")} className="pill-status bg-rose-500/15 text-rose-200">Speichern fehlgeschlagen</button>
            )}
            {installReady && (
              <button onClick={db.install} className="pill-status bg-sky-500/15 text-sky-200">
                App installieren
              </button>
            )}
            {(saveState === "saved" || saveState === "saving") && (
              <span className="text-[11px] text-slate-500" role="status">{saveState === "saving" ? "Speichert …" : cloud.phase === "ready" && cloud.status === "syncing" ? "Synchronisiert …" : cloud.phase === "ready" && cloud.status === "idle" && cloud.lastSync ? "Synchronisiert" : "Gespeichert"}</span>
            )}
            <button onClick={() => setSearchOpen(true)} className="btn btn-ghost btn-icon" aria-label="Suchen (Strg + K)" title="Suchen (Strg + K)">
              <Icon name="search" />
            </button>
          </div>
        </div>
      </header>

      <main className="pb-nav mx-auto max-w-3xl px-4 pt-3">
        {loadError && (
          <div role="alert" className="notice notice-danger mb-4">
            Die gespeicherten Daten konnten nicht geladen werden ({loadError}). Automatisches Speichern ist pausiert, damit nichts überschrieben wird. Lade die App neu oder stelle eine Sicherung unter Mehr → Daten wieder her.
          </div>
        )}
        {updateReady && (
          <div className="notice notice-info mb-4 flex items-center gap-3">
            <p className="flex-1">Eine neue Version von StudyOS ist bereit.</p>
            <button className={btnPrimary} onClick={db.applyUpdate}>Jetzt aktualisieren</button>
          </div>
        )}
        {saveState === "memory" && bannerOpen && (
          <div className="notice notice-warn mb-4 flex items-start gap-3">
            <p className="flex-1">Diese Vorschau speichert nicht automatisch. Sichere deine Einträge unter <b>Mehr → Daten → Export</b>. Die installierte Version speichert alles automatisch auf deinem Gerät.</p>
            <button onClick={() => setBannerOpen(false)} className="btn btn-icon" aria-label="Hinweis schließen">✕</button>
          </div>
        )}
        {tab === "heute" && <Today db={db} onQuick={() => setQuickOpen(true)} notice={ENV && hasData && cloud.phase !== "ready" && (backupAge === null || backupAge >= (data.settings.backupDays || 7)) ? (
          <div className="notice notice-plain flex items-center gap-3">
            <p className="flex-1">{backupAge === null ? "Du hast noch keine Sicherung exportiert." : `Letzte Sicherung vor ${backupAge} Tagen.`} Deine Daten liegen nur auf diesem Gerät. Sichere sie oder schalte den Cloud-Sync ein.</p>
            <button className={btnGhost} onClick={() => db.goMore("daten")}>Jetzt sichern</button>
          </div>
        ) : null} />}
        {tab === "module" && (moduleId && modMap[moduleId] ? <ModuleDetail db={db} id={moduleId} onBack={() => setModuleId(null)} /> : <ModuleList db={db} />)}
        {tab === "woche" && <WeekView db={db} />}
        {tab === "lernen" && <Learn db={db} sub={learnTab} setSub={setLearnTab} timer={timerApi} cardFilter={cardFilter} setCardFilter={setCardFilter} />}
        {tab === "mehr" && <More db={db} sub={moreTab} setSub={setMoreTab} />}
        <p className="mt-10 text-center text-[11px] text-slate-600">StudyOS {typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "dev"}, Datenformat {DATA_VERSION}</p>
      </main>

      <nav aria-label="Hauptnavigation" className="tabbar">
        <ul>
          {nav.map(([k, l, ic]) => (
            <li key={k}>
              <button onClick={() => { setTab(k); if (k === "module") setModuleId(null); window.scrollTo && window.scrollTo(0, 0); }} aria-current={tab === k ? "page" : undefined}
                className="tab">
                <Icon name={ic} />{l}
              </button>
            </li>
          ))}
        </ul>
      </nav>

      {helpOpen && <ShortcutHelp onClose={() => setHelpOpen(false)} />}
      {shareIn && <ShareImport db={db} token={shareIn.token} keyStr={shareIn.key} onClose={() => { setShareIn(null); setLearnTab("karten"); setTab("lernen"); }} />}
      {quickOpen && <QuickAdd db={db} onClose={() => setQuickOpen(false)} />}
      <TimerTitle timer={timer} />
      <Toasts items={toasts} onClose={closeToast} />
      {searchOpen && <SearchModal data={data} db={db} onPick={openResult} onClose={() => setSearchOpen(false)} />}
      {noteObj && !form && <NoteViewer note={noteObj} db={db} onClose={() => setNoteView(null)} onEdit={() => { setNoteView(null); openForm("note", noteObj); }} />}
      {form && <FormModal key={form.kind + (form.initial?.id || "new")} form={form} data={data} onSave={saveEntity} onDelete={removeEntity} onDeleteSeries={removeSeries} onClose={() => setForm(null)} />}
    </div>
  );
}
