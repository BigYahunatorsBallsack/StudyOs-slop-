import React, { useState, useEffect, useRef, useMemo, useCallback, Suspense, lazy } from "react";
import { useCloudSync } from "./cloud/useCloudSync.js";
import { blockDone } from "./lib/blocks.js";
import { COLL, COLLS, DATA_VERSION, DONE_HW } from "./lib/constants.js";
import { buildWeeklySeries } from "./lib/data.js";
import { ENV } from "./lib/env.js";
import { dayOf, diffDays, fmtMin, fmtShort, iso, uid } from "./lib/util.js";
import { usePersistence } from "./app/usePersistence.js";
import { useTheme } from "./app/useTheme.js";
import { useTimer } from "./app/useTimer.js";
import { useFeeds } from "./app/useFeeds.js";
import { FormModal } from "./ui/FormModal.jsx";
import { FocusNote } from "./ui/FocusNote.jsx";
import { Icon, Toasts } from "./ui/primitives.jsx";
import { btnGhost, btnPrimary } from "./ui/styles.js";
import { Today } from "./views/Today.jsx";
import { WeekView } from "./views/Week.jsx";
import { mergeData, restoreConflicts, stampChanges } from "./lib/sync.js";
import { TimerBadge, TimerTitle } from "./ui/timer.jsx";
import { QuickAdd } from "./ui/QuickAdd.jsx";
import { Sky } from "./ui/pixel.jsx";
import { useAchievements } from "./app/useAchievements.js";
import { useAmbient } from "./ui/ambient.js";
import { ambientOf, ambientVolumeOf } from "./lib/ambient.js";
import { ShortcutHelp, shortcutHandler } from "./ui/shortcuts.jsx";
import { playSfx, setSfxEnabled } from "./ui/sfx.js";
import { SyncDot } from "./ui/syncdot.jsx";
import { ItemMenu, PostponeSheet } from "./ui/actions.jsx";
import { SelectBar, countLabel } from "./ui/selection.jsx";
import { postponeHomework } from "./lib/postpone.js";
import { openTodayCount } from "./lib/todo.js";
import { cardFromSelection, syncNoteCards } from "./lib/cards.js";
import { pdfText, sheetFromShare } from "./lib/sheet.js";
import { getLocal as getFile } from "./lib/files.js";

/* Seltener genutzte Bereiche als eigene Dateien (offline über den Service Worker).
   Nach dem Start werden sie im Leerlauf vorgeladen, damit der erste Wechsel nicht auf „Lädt …“ wartet: React zeigt einen
   Platzhalter sonst mindestens 300 ms lang. Ist das Modul schon da, wird die Komponente direkt gerendert, ohne lazy(). */
const preloads = [];
const named = (load, name) => {
  let Comp = null, promise = null;
  const preload = () => (promise ||= load().then((m) => { Comp = m[name]; return m; }, (e) => { promise = null; throw e; }));
  const Lazy = lazy(() => preload().then((m) => ({ default: m[name] })));
  preloads.push(preload);
  /* pro Instanz einmal festlegen, damit ein Wechsel von Lazy auf Comp den Inhalt nicht neu aufbaut */
  return function Named(props) { const [C] = useState(() => Comp || Lazy); return <C {...props} />; };
};
const preloadViews = () => preloads.forEach((p) => p().catch(() => {}));
const Learn = named(() => import("./views/Learn.jsx"), "Learn");
const ModuleDetail = named(() => import("./views/Modules.jsx"), "ModuleDetail");
const ModuleList = named(() => import("./views/Modules.jsx"), "ModuleList");
const More = named(() => import("./views/More.jsx"), "More");
const NoteViewer = named(() => import("./views/Search.jsx"), "NoteViewer");
const SearchModal = named(() => import("./views/Search.jsx"), "SearchModal");
const ShareImport = named(() => import("./views/Share.jsx"), "ShareImport");
const OcclusionEditor = named(() => import("./ui/Occlusion.jsx"), "OcclusionEditor");
const Loading = () => <p className="py-3 text-center text-sm text-slate-500" role="status">Lädt …</p>;

import { mergeModules } from "./lib/modules.js";
import { saveSessionEdit } from "./lib/series.js";
import { buildHomeworkSeries, markAttended, seriesSuggestion, reconcileAllSessionLogs, reconcileSessionLogs, toggleAttended, withoutArchived } from "./lib/study.js";
import { toggleSubtask } from "./lib/subtasks.js";
import { applySemester, curriculumOf, setupFromPlan } from "./lib/curriculum.js";
import { cancelOffDays } from "./lib/holidays.js";
import { addTrash, purgeTrash, restoreTrash, trashEntry } from "./lib/trash.js";
import { parseShareLocation } from "./lib/share.js";
import { sharedNote, takeShared } from "./lib/shared.js";

/* Trifft eine Media-Query zu? Folgt Änderungen (Fenster breiter oder schmaler ziehen). */
function useMedia(q) {
  const get = () => { try { return window.matchMedia(q).matches; } catch { return false; } };
  const [on, setOn] = useState(get);
  useEffect(() => {
    let mq;
    try { mq = window.matchMedia(q); } catch { return undefined; }
    const f = () => setOn(mq.matches);
    mq.addEventListener?.("change", f);
    return () => mq.removeEventListener?.("change", f);
  }, [q]);
  return on;
}

const nav = [["heute", "Heute", "today"], ["module", "Module", "modules"], ["woche", "Woche", "week"], ["lernen", "Lernen", "learn"], ["mehr", "Mehr", "more"]];

/* ---------------- App ---------------- */
export default function App() {
  const { data, setData, dataRef, ready, loadError, saveState, saveNow, updateReady, installReady, setInstallReady } = usePersistence();
  const [tab, setTab] = useState("heute");
  /* Bereich wechseln: sofort nach oben springen (nicht weich scrollen, das wirkt wie Laden) */
  const goTab = (k) => { setTab(k); if (k === "module") setModuleId(null); window.scrollTo && window.scrollTo({ top: 0, behavior: "instant" }); };
  const [moduleId, setModuleId] = useState(null);
  const [learnTab, setLearnTab] = useState("timer");
  const [moreTab, setMoreTab] = useState("rueckblick");
  const [cardFilter, setCardFilter] = useState("");
  const [form, setForm] = useState(null);
  const [cardDraft, setCardDraft] = useState(null); /* Karte aus markiertem Notiztext, liegt über Notiz bzw. Editor */
  const [noteView, setNoteView] = useState(null);
  const [focusNoteId, setFocusNoteId] = useState(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [bannerOpen, setBannerOpen] = useState(true);
  const [toasts, setToasts] = useState([]);
  const [menu, setMenu] = useState(null);
  /* Mehrfachauswahl in Listen: { kind: "homework" | "session" | "card" | "note" | "block", ids } */
  const [sel, setSel] = useState(null);
  useEffect(() => setSel(null), [tab, moduleId, moreTab, learnTab]);
  const wide = useMedia("(min-width: 1100px)");

  const toast = (text, action, ms = 5000) => {
    const id = uid();
    setToasts((t) => [...t.slice(-2), { id, text, action }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), ms);
  };
  const closeToast = (id) => setToasts((t) => t.filter((x) => x.id !== id));

  /* Farbschema: dunkel, hell, retro oder wie das System */
  useTheme(data.settings.retroMotion, data.settings.retroPalette);

  /* Übrige Bereiche vorladen, sobald der Browser Luft hat */
  useEffect(() => {
    if (!ready) return;
    const idle = window.requestIdleCallback || ((f) => setTimeout(f, 1500));
    const id = idle(preloadViews, { timeout: 3000 });
    return () => (window.cancelIdleCallback || clearTimeout)(id);
  }, [ready]);

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
    else if (a === "push") runPushAction(params);
    else if (a === "geteilt") takeShared().then(async (msg) => {
      if (!msg) return;
      if (await sheetIn(msg)) return;
      const note = { ...sharedNote(msg, iso()), id: uid() };
      saveEntity("note", note, true);
      toast(note.files.length ? `Als Notiz mit ${note.files.length} ${note.files.length === 1 ? "Anhang" : "Anhängen"} gespeichert.` : "Als Notiz gespeichert.");
      setTimeout(() => openForm("note", note, false), 0);
    });
  }, [ready]);

  /* Knöpfe in Push-Benachrichtigungen (siehe server/reminders.js) */
  const runPushAction = (params) => {
    const d = dataRef.current, id = params.get("id"), what = params.get("tun");
    setTab("heute");
    if (what === "abgegeben" || what === "verschieben") {
      const h = d.homework.find((x) => x.id === id);
      if (!h) return;
      if (what === "abgegeben") db.hwDone(h, true); else setMenu({ mode: "postpone", kind: "homework", item: h });
    } else if (what === "nachbereitet") {
      const day = params.get("tag") || iso();
      const ids = d.sessions.filter((s) => s.date === day && !s.cancelled && !s.reviewed && (s.date < iso() || (s.end || s.start || "") <= new Date().toTimeString().slice(0, 5))).map((s) => s.id);
      if (!ids.length) return;
      withUndo(`${ids.length} ${ids.length === 1 ? "Termin" : "Termine"} nachbereitet.`, (x) => ({ ...x, sessions: x.sessions.map((s) => (ids.includes(s.id) ? { ...s, reviewed: true, reviewedAt: iso() } : s)) }));
    } else if (what === "besucht") {
      const day = params.get("tag") || iso();
      const ids = d.sessions.filter((s) => s.date === day && !s.cancelled && !s.attended && (s.date < iso() || (s.start || "") <= new Date().toTimeString().slice(0, 5))).map((s) => s.id);
      if (!ids.length) return;
      withUndo(`${ids.length} ${ids.length === 1 ? "Termin" : "Termine"} als besucht abgehakt.`, (x) => markAttended(x, ids));
    } else if (what === "timer") {
      const b = (d.blocks || []).find((x) => x.id === id);
      if (b) db.focus({ moduleId: b.moduleId || "", kind: b.kind, blockId: b.id, note: b.title });
    } else if (what === "angemeldet") {
      if (d.exams.some((e) => e.id === id)) { patch("exams", id, { registered: true }); toast("Als angemeldet markiert.", { label: "Rückgängig", run: () => patch("exams", id, { registered: false }) }); }
    }
  };

  /* Geteiltes Übungsblatt (PDF) wird gleich eine Abgabe mit Anhang; danach öffnet sich das Formular zum Prüfen */
  const sheetIn = async (msg) => {
    const pdf = (msg.files || []).find((f) => /pdf/i.test(f.type || "") || /\.pdf$/i.test(f.name || ""));
    if (!pdf || (msg.files || []).length > 2) return false;
    let text = "";
    try { const blob = await getFile(pdf.id); if (blob) text = await pdfText(new Uint8Array(await blob.arrayBuffer())); } catch { text = ""; }
    const s = sheetFromShare({ name: pdf.name, text, title: msg.title }, dataRef.current);
    if (!s) return false;
    const files = sharedNote(msg, iso()).files;
    const hw = { id: uid(), moduleId: s.moduleId, title: s.title, issued: iso(), due: s.due, status: "ausgegeben", files, ...(s.dueTime && { dueTime: s.dueTime }), ...(s.subtasks.length && { subtasks: s.subtasks }) };
    saveEntity("homework", hw, true);
    toast(`Abgabe „${hw.title}“ angelegt${s.guessedDue ? ", Frist bitte prüfen" : ""}.`, { label: "Rückgängig", run: () => removeEntity("homework", hw.id) }, 8000);
    setTimeout(() => openForm("homework", dataRef.current.homework.find((x) => x.id === hw.id) || hw, false), 0);
    return true;
  };

  /* Tastenkürzel (Desktop): siehe ui/shortcuts.jsx; Aktionen über eine Ref, damit der Handler stabil bleibt */
  const [helpOpen, setHelpOpen] = useState(false);
  const [quickOpen, setQuickOpen] = useState(false);
  const [whatNowOpen, setWhatNowOpen] = useState(false);
  const shortcutActs = useRef(null);
  shortcutActs.current = {
    search: () => setSearchOpen(true),
    help: () => setHelpOpen(true),
    quick: () => setQuickOpen(true),
    whatNow: () => { setTab("heute"); setWhatNowOpen(true); },
    create: (kind) => openForm(kind, kind === "log" ? { date: iso() } : null, true),
    timer: () => { setLearnTab("timer"); setTab("lernen"); },
    tab: goTab,
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
  /* Lernzeit aus Besuch und Aufzeichnung aufräumen (alte Einträge, Sync von anderen Geräten): kein Termin zählt mehr als einmal seine Länge */
  useEffect(() => {
    if (!ready || loadError) return;
    if (reconcileAllSessionLogs(data) !== data) change((d) => reconcileAllSessionLogs(d));
  }, [ready, loadError, data.sessions, data.logs]);
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
      const list = buildHomeworkSeries({ ...base, created: iso() }, repeatUntil, d.settings);
      setTimeout(() => toast(`${list.length} Blätter angelegt.`), 0);
      return { ...d, homework: [...d.homework, ...list] };
    }
    if (kind === "session" && isNew && vals.repeatUntil) {
      const { repeatUntil, ...base } = vals;
      return { ...d, sessions: [...d.sessions, ...buildWeeklySeries(base, repeatUntil, d.settings)] };
    }
    const item = { ...vals }; delete item.repeatUntil;
    if (isNew) {
      item.id = item.id || uid(); item.created = iso();
      if (kind === "module") d.meta.lastModule = item.id;
      if (kind === "session") Object.assign(item, { cancelled: false, prepared: false, attended: false, reviewed: false, reviewedAt: null });
      if (kind === "card") Object.assign(item, { ease: 2.5, interval: 0, reps: 0, due: iso() });
      /* Uhrzeit merken (für die Lernstatistik), wenn die Einheit heute eingetragen wird */
      if (kind === "log" && !item.at && item.date === iso()) item.at = new Date(Date.now() - (Number(item.minutes) || 0) * 60000).toTimeString().slice(0, 5);
      if (kind === "topic" && (item.order === null || item.order === undefined)) item.order = d.topics.filter((x) => x.moduleId === item.moduleId).length + 1;
    }
    if (kind === "homework") item.doneAt = DONE_HW.has(item.status) ? item.doneAt || iso() : null;
    if (kind === "homework" && Array.isArray(item.subtasks)) {
      const subs = item.subtasks.map((x) => ({ ...x, title: String(x.title || "").trim() })).filter((x) => x.title);
      if (subs.length) item.subtasks = subs; else delete item.subtasks;
    }
    if (kind === "homework" && !isNew && item.feedKey) {
      /* von Hand geänderte Felder übernimmt das Moodle-Abo nicht mehr */
      const old = d.homework.find((x) => x.id === item.id) || {};
      const locked = new Set(old.locked || []);
      ["title", "moduleId"].forEach((k) => { if ((old[k] || "") !== (item[k] || "")) locked.add(k); });
      if (old.due !== item.due || (old.dueTime || "") !== (item.dueTime || "")) locked.add("due");
      item.locked = [...locked];
    }
    if (kind === "note") {
      item.updated = iso();
      /* Zeilen „Frage :: Antwort“ und Lückentexte werden gleich Karteikarten */
      const r = syncNoteCards(d.cards, item, iso(), uid);
      if (r.added || r.updated || r.removed) {
        d.cards = r.cards;
        const parts = [r.added && `${r.added} neu`, r.updated && `${r.updated} geändert`, r.removed && `${r.removed} entfernt`].filter(Boolean).join(", ");
        setTimeout(() => toast(`Karteikarten aus „${item.title || "Notiz"}“: ${parts}.`), 0);
      }
    }
    /* Drittes Blatt im Wochentakt: einmal anbieten, die übrigen bis Semesterende anzulegen */
    if (kind === "homework" && isNew) {
      const sug = seriesSuggestion(d, item, d.settings);
      if (sug) {
        d.settings = { ...d.settings, seriesAsked: [...(d.settings.seriesAsked || []), sug.key].slice(-100) };
        const last = sug.list[sug.list.length - 1];
        setTimeout(() => toast(`Sieht nach einer Serie aus. ${sug.list.length} weitere Blätter bis ${fmtShort(last.due)} anlegen?`, { label: "Anlegen", run: () => {
          withUndo(`${sug.list.length} Blätter angelegt.`, (x) => ({ ...x, homework: [...x.homework, ...sug.list] }));
        } }, 15000), 0);
      }
    }
    if (kind === "session" && !isNew) {
      const r = saveSessionEdit(d.sessions, item, !!extra.applySeries);
      if (r.count) setTimeout(() => toast(`Auch ${r.count} folgende ${r.count === 1 ? "Termin" : "Termine"} geändert.`), 0);
      /* angeschaute Aufzeichnung zählt als Lernzeit: weiter vorgestellt kommt dazu, zurückgestellt oder gelöscht geht weg;
         ein Termin zählt höchstens so lange, wie er dauert */
      const w = reconcileSessionLogs(d.logs, item, iso(), { addPresence: false });
      if (w.delta > 0) setTimeout(() => toast(`${fmtMin(w.delta)} Aufzeichnung als Lernzeit eingetragen.`), 0);
      if (w.delta < 0) setTimeout(() => toast(`${fmtMin(-w.delta)} Aufzeichnung aus der Lernzeit entfernt.`), 0);
      return { ...d, sessions: r.sessions, ...(w.delta ? { logs: w.logs } : {}) };
    }
    return { ...d, [coll]: isNew ? [...d[coll], item] : d[coll].map((x) => (x.id === item.id ? item : x)) };
  });

  /* Löschen mit Rückgängig; was fehlt, landet zusätzlich 30 Tage im Papierkorb */
  const withTrash = (label, fn, name) => withUndo(label, (d) => { const next = fn(d); return addTrash(next, trashEntry(d, next, { label: name })); });
  const removeEntity = (kind, id) => withTrash(kind === "module" ? "Modul gelöscht." : "Eintrag gelöscht.", (d) => removeFrom(d, kind, id));
  const removeFrom = (d, kind, id) => {
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
    if (hw?.feedKey?.startsWith("moodle|") && d.settings.moodleFeed) n.settings = { ...d.settings, moodleFeed: { ...d.settings.moodleFeed, dismissed: [...(d.settings.moodleFeed.dismissed || []), hw.feedKey].slice(-500) } };
    if (hw?.feedKey?.startsWith("artemis:")) n.settings = { ...d.settings, artemisFeeds: (d.settings.artemisFeeds || []).map((f) => (hw.feedKey.startsWith(`artemis:${f.id}|`) ? { ...f, dismissed: [...(f.dismissed || []), hw.feedKey].slice(-500) } : f)) };
    return n;
  };

  const removeSeries = (sid) => withTrash("Serie gelöscht.", (d) => {
    const ids = new Set(d.sessions.filter((s) => s.seriesId === sid).map((s) => s.id));
    return { ...d, sessions: d.sessions.filter((s) => !ids.has(s.id)), notes: d.notes.map((x) => (ids.has(x.sessionId) ? { ...x, sessionId: "" } : x)) };
  }, "Terminserie");

  const modMap = useMemo(() => Object.fromEntries(data.modules.map((m) => [m.id, m])), [data.modules]);

  /* Fokusphase gleich als Lerneinheit speichern, dann nur noch nach einer Zeile Lernnotiz fragen */
  const logFocus = (init) => {
    const id = uid();
    saveEntity("log", { ...init, id, note: init.note || "" }, true);
    if (form) toast("Fokusphase eingetragen.", { label: "Notiz", run: () => setFocusNoteId(id) }, 15000);
    else setFocusNoteId(id);
  };
  const { timer, timerApi } = useTimer({
    sound: !!data.settings.sound,
    onFocusDone: (init, blockId) => {
      if (blockId) patch("blocks", blockId, blockDone(true));
      logFocus(init);
    },
    onBreakDone: () => toast("Pause vorbei. Weiter geht's!"),
    onLog: logFocus,
  });
  const focusLog = focusNoteId ? data.logs.find((l) => l.id === focusNoteId) : null;

  /* Musik in der Fokusphase (Timer → „Musik in der Fokusphase“) */
  useAmbient({ kind: ambientOf(data.settings), playing: timer.running && timer.mode === "focus", volume: ambientVolumeOf(data.settings) });

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
  /* Ein anderes Gerät hat Änderungen von hier überschrieben oder gelöscht: zeigen, mit „Meine behalten“ */
  const onConflict = (list) => {
    const names = list.slice(0, 2).map((k) => `„${k.title}“`).join(", ") + (list.length > 2 ? ` und ${list.length - 2} weitere` : "");
    const what = list.every((k) => k.kind === "deleted") ? "gelöscht" : "überschrieben";
    toast(`Von einem anderen Gerät ${what}: ${names}.`, { label: "Meine behalten", run: () => { change((d) => restoreConflicts(d, list)); toast("Deine Fassung ist wiederhergestellt."); } }, 20000);
  };
  const cloud = useCloudSync({ ready, enabled: !loadError, data, getLocal, applyLocal: applyRemote, onPushEnabled, onConflict });

  const feeds = useFeeds({ ready, loadError, cloud, data, dataRef, change });

  /* Selbst angelegte Termine an Feiertagen und in der vorlesungsfreien Zeit fallen aus (einmal je Termin, mit Rückgängig) */
  useEffect(() => {
    if (!ready || loadError) return;
    const { count } = cancelOffDays(dataRef.current.sessions, dataRef.current.settings);
    if (!count) return;
    let ids = [];
    change((d) => { const r = cancelOffDays(d.sessions, d.settings); ids = r.sessions.filter((s, i) => s !== d.sessions[i]).map((s) => s.id); return r.count ? { ...d, sessions: r.sessions } : d; });
    toast(`${count} ${count === 1 ? "Termin fällt" : "Termine fallen"} wegen Feiertag oder vorlesungsfreier Zeit aus.`, { label: "Rückgängig", run: () => change((d) => ({ ...d, sessions: d.sessions.map((s) => (ids.includes(s.id) ? { ...s, cancelled: false, offReason: null } : s)) })) }, 10000);
  }, [ready, loadError, data.sessions, data.settings.breaks, data.settings.tumBreaks, data.settings.christmasBreak, data.settings.university]);

  useEffect(() => setSfxEnabled(data.settings.sfx), [data.settings.sfx]);
  useAchievements({ data, enabled: ready && !loadError, onUnlock: (list) => { playSfx("fanfare"); toast(
    list.length === 1 ? `Abzeichen freigeschaltet: „${list[0].title}“` : `${list.length} Abzeichen freigeschaltet: ${list.map((b) => `„${b.title}“`).join(", ")}`,
    { label: "Ansehen", run: () => { setMoreTab("erfolge"); setTab("mehr"); } }, 8000); } });

  /* Zahl am App-Symbol (installierte App): was heute noch offen ist */
  useEffect(() => {
    if (!ready || typeof navigator === "undefined" || !("setAppBadge" in navigator)) return;
    const n = data.settings.appBadge === false ? 0 : openTodayCount(withoutArchived(data));
    try { Promise.resolve(n ? navigator.setAppBadge(n) : navigator.clearAppBadge?.()).catch(() => {}); } catch { /* ohne Berechtigung egal */ }
  }, [ready, data]);

  /* Am Handy seitlich wischen wechselt den Bereich (nicht auf Zeilen mit eigener Wischgeste, Feldern oder seitlich scrollenden Leisten) */
  const mainRef = useRef(null);
  const tabRef = useRef(tab); tabRef.current = tab;
  useEffect(() => {
    const el = mainRef.current;
    if (!el || !window.matchMedia?.("(pointer: coarse)").matches) return undefined;
    let st = null;
    const scrollsX = (n) => { for (; n && n !== el; n = n.parentElement) { if (n.scrollWidth > n.clientWidth + 2 && /auto|scroll/.test(getComputedStyle(n).overflowX)) return true; } return false; };
    const start = (e) => {
      const t = e.touches[0];
      st = e.touches.length === 1 && !e.target.closest(".swipe, .todo-item, input, textarea, select, [role=slider], .occ-stage, .no-tabswipe") && !scrollsX(e.target) ? { x: t.clientX, y: t.clientY, at: Date.now() } : null;
    };
    const end = (e) => {
      if (!st) return;
      const t = e.changedTouches[0], dx = t.clientX - st.x, dy = t.clientY - st.y, quick = Date.now() - st.at < 700;
      st = null;
      if (!quick || Math.abs(dx) < 70 || Math.abs(dx) < 2.2 * Math.abs(dy) || document.querySelector('[role="dialog"]')) return;
      const order = nav.map((x) => x[0]), i = order.indexOf(tabRef.current), j = i + (dx < 0 ? 1 : -1);
      if (i >= 0 && j >= 0 && j < order.length) goTab(order[j]);
    };
    el.addEventListener("touchstart", start, { passive: true });
    el.addEventListener("touchend", end, { passive: true });
    return () => { el.removeEventListener("touchstart", start); el.removeEventListener("touchend", end); };
  }, [ready]);

  const db = {
    data, getData: () => dataRef.current, mod: (id) => modMap[id], openForm, patch, change, toast, env: ENV, saveState, updateReady,
    toggleSession: (id, key) => (key === "attended" ? change((d) => toggleAttended(d, id))
      : patch("sessions", id, (s) => (key === "reviewed" ? { reviewed: !s.reviewed, reviewedAt: !s.reviewed ? iso() : null } : { [key]: !s[key] }))),
    toggleSubtask: (id, sid) => {
      const h = dataRef.current.homework.find((x) => x.id === id);
      if (!h) return;
      const p = toggleSubtask(h, sid);
      patch("homework", id, p);
      if (p.status === "bearbeitet") toast(`Alle Teilaufgaben von „${h.title}“ erledigt.`, { label: "Rückgängig", run: () => patch("homework", id, { subtasks: h.subtasks, status: h.status, doneAt: h.doneAt ?? null }) });
    },
    setHwStatus: (id, status) => patch("homework", id, (h) => ({ status, doneAt: DONE_HW.has(status) ? h.doneAt || iso() : null })),
    patchSettings: (p) => change((d) => ({ ...d, settings: { ...d.settings, ...p } })),
    replaceAll, withUndo, withTrash,
    sel,
    select: (kind, id) => setSel((cur) => {
      const ids = cur?.kind === kind ? cur.ids : [];
      return { kind, ids: ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id] };
    }),
    selectAll: (kind, ids) => setSel({ kind, ids }),
    endSelect: () => setSel(null),
    /* Aktionen für die Auswahl; jeweils ein Rückgängig für alle */
    bulk: {
      hwDone: (list) => { setSel(null); withUndo(`${list.length} ${list.length === 1 ? "Abgabe" : "Abgaben"} abgegeben.`, (d) => ({ ...d, homework: d.homework.map((h) => (list.some((x) => x.id === h.id) ? { ...h, status: "abgegeben", doneAt: h.doneAt || iso() } : h)) })); },
      hwMove: (list, date) => { setSel(null); withUndo(`${list.length} ${list.length === 1 ? "Abgabe" : "Abgaben"} auf ${fmtShort(date)} verschoben.`, (d) => ({ ...d, homework: d.homework.map((h) => (list.some((x) => x.id === h.id) ? { ...h, ...postponeHomework(h, date) } : h)) })); },
      reviewed: (list) => {
        setSel(null);
        const ids = new Set(list.filter((s) => !s.reviewed && !s.cancelled).map((s) => s.id));
        withUndo(`${ids.size} ${ids.size === 1 ? "Termin" : "Termine"} nachbereitet.`, (d) => ({ ...d, sessions: d.sessions.map((s) => (ids.has(s.id) ? { ...s, reviewed: true, reviewedAt: iso() } : s)) }));
      },
      remove: (kind, list) => {
        setSel(null);
        const label = countLabel(kind, list.length);
        withTrash(`${label} gelöscht.`, (d) => list.reduce((acc, x) => removeFrom(acc, kind, x.id), d), list.length === 1 ? undefined : label);
      },
    },
    restoreTrash: (id, label) => { change((d) => restoreTrash(d, id)); toast(`„${label}“ wiederhergestellt.`); },
    purgeTrash: (id) => change((d) => purgeTrash(d, id)),
    saveQuick: (kind, vals, label) => {
      saveEntity(kind, vals, true);
      toast(`${label} angelegt.`, { label: "Rückgängig", run: () => removeEntity(kind, vals.id) }, 6000);
    },
    cardFromText: (text, moduleId) => setCardDraft({ kind: "card", isNew: true, initial: { moduleId: moduleId || "", ...cardFromSelection(text) } }),
    cardsFromNote: (note, list) => {
      const today = iso();
      const fresh = list.map((c) => ({ ...c, id: uid(), moduleId: note.moduleId, topicId: "", tags: "", created: today, ease: 2.5, interval: 0, reps: 0, due: today, fromNote: note.id }));
      withUndo(`${fresh.length} ${fresh.length === 1 ? "Karteikarte" : "Karteikarten"} aus „${note.title}“ erzeugt.`, (d) => ({ ...d, cards: [...d.cards, ...fresh] }));
    },
    applyCurriculum: (plan, sem, status) => {
      const res = applySemester(dataRef.current, plan, sem, status);
      withUndo(`Semester ${sem}: ${res.added} ${res.added === 1 ? "Modul" : "Module"} angelegt${res.updated ? `, ${res.updated} ergänzt` : ""}.`, () => res.data);
    },
    setupStudy: (plan, current, withPast, name) => {
      const res = setupFromPlan(dataRef.current, plan, current, withPast);
      const next = name ? { ...res.data, settings: { ...res.data.settings, name } } : res.data;
      withUndo(`Eingerichtet: ${res.added} ${res.added === 1 ? "Modul" : "Module"} angelegt.`, () => next);
    },
    /* Neues Semester: altes archivieren, nächstes aus dem Studienplan als „belegt“ übernehmen */
    switchSemester: (sw) => {
      const plan = curriculumOf(dataRef.current);
      if (!plan) return;
      withUndo(`Semester ${sw.from} archiviert, Semester ${sw.to} übernommen.`, (d) => {
        const archived = { ...d, modules: d.modules.map((m) => ((Number(m.semester) || 0) === sw.from ? { ...m, archived: true } : m)) };
        const res = applySemester(archived, plan, sw.to, "belegt").data;
        return { ...res, settings: { ...res.settings, semesterAsked: sw.key } };
      });
    },
    archiveSemester: (sem, on) => withUndo(on ? `Semester ${sem} archiviert.` : `Semester ${sem} zurückgeholt.`, (d) => ({ ...d, modules: d.modules.map((m) => ((m.semester || 0) === sem ? { ...m, archived: on } : m)) })),
    mergeModules: (targetId, sourceIds) => {
      const name = modMap[targetId]?.name || "Modul";
      withUndo(`${sourceIds.length + 1} Module zu „${name}“ zusammengeführt.`, (d) => mergeModules(d, targetId, sourceIds));
    },
    dismissMerge: (key) => change((d) => ({ ...d, settings: { ...d.settings, mergeDismissed: [...(d.settings.mergeDismissed || []), key] } })),
    ...feeds,
    mergeIn: (remote) => { const { data: merged, stats } = mergeData(dataRef.current, remote); replaceAll(merged, "Vor dem Zusammenführen", { stamp: false }); return stats; },
    cloud,
    markSaved: (snapshot) => {
      const next = snapshot || { ...dataRef.current, meta: { ...dataRef.current.meta, lastBackup: new Date().toISOString() } };
      dataRef.current = next; setData(next); setDirty(false);
      saveNow(next);
    },
    openNote: (id) => setNoteView(id),
    openSearch: () => setSearchOpen(true),
    install: async () => { if (ENV && ENV.pwa && ENV.pwa.install) { const r = await ENV.pwa.install(); if (r) { setInstallReady(false); toast("StudyOS wurde installiert."); } return r; } return false; },
    applyUpdate: async () => { try { if (ENV) await ENV.save(dataRef.current); } catch {} ENV && ENV.pwa && ENV.pwa.applyUpdate(); },
    goModule: (id) => { setModuleId(id); setTab("module"); },
    /* Fokus-Timer für eine bestimmte Aufgabe starten (aus „Was jetzt?“ und Lernblöcken) */
    focus: (opts) => { timerApi.focus(opts); setLearnTab("timer"); setTab("lernen"); },
    goLearn: (sub, mid) => { setLearnTab(sub); if (mid !== undefined) setCardFilter(mid); setTab("lernen"); },
    goMore: (sub) => { setMoreTab(sub); setTab("mehr"); },
    goTab, openQuick: () => setQuickOpen(true), openWhatNow: () => { setTab("heute"); setWhatNowOpen(true); }, openHelp: () => setHelpOpen(true),
    remove: removeEntity,
    /* Schnellmenü (lange drücken) und Verschieben (nach links wischen) */
    menu: (kind, item) => setMenu({ mode: "menu", kind, item }),
    postpone: (kind, item) => setMenu({ mode: "postpone", kind, item }),
    moveTo: (kind, item, date) => {
      if (kind === "homework") {
        const prev = { due: item.due, missed: !!item.missed, ...(item.feedKey && { locked: item.locked || [] }) };
        patch("homework", item.id, postponeHomework(item, date));
        toast(`„${item.title}“ auf ${fmtShort(date)} verschoben.`, { label: "Rückgängig", run: () => patch("homework", item.id, prev) });
      } else {
        patch("blocks", item.id, { date });
        toast(`„${item.title}“ auf ${fmtShort(date)} verschoben.`, { label: "Rückgängig", run: () => patch("blocks", item.id, { date: item.date }) });
      }
    },
    hwDone: (h, on) => {
      const prev = h.status;
      db.setHwStatus(h.id, on ? "abgegeben" : "in Arbeit");
      toast(on ? `„${h.title}“ abgegeben.` : `„${h.title}“ wieder offen.`, { label: "Rückgängig", run: () => db.setHwStatus(h.id, prev) });
    },
    hwMissed: (h) => {
      patch("homework", h.id, { missed: true });
      toast(`„${h.title}“ als nicht abgegeben markiert.`, { label: "Rückgängig", run: () => patch("homework", h.id, { missed: false }) });
    },
    /* ▶ an einem Eintrag: Timer mit Modul und Art; die Zeit landet als Lerneinheit mit dem Titel als Notiz */
    focusOn: (kind, item) => {
      if (kind === "homework") db.focus({ moduleId: item.moduleId || "", kind: "Übung/Hausaufgabe", note: item.title });
      else if (kind === "session") db.focus({ moduleId: item.moduleId || "", kind: "Nacharbeiten", note: `${item.type} vom ${fmtShort(item.date)}` });
    },
  };

  const runCommand = (a) => {
    if (a.type === "form") openForm(a.kind, a.kind === "log" ? { date: iso() } : null, true);
    else if (a.type === "quick") setQuickOpen(true);
    else if (a.type === "timer") { if (a.moduleId) db.focus({ moduleId: a.moduleId }); else db.goLearn("timer"); }
    else if (a.type === "whatNow") db.openWhatNow();
    else if (a.type === "learn") db.goLearn(a.sub, a.sub === "karten" ? "" : undefined);
    else if (a.type === "tab") goTab(a.tab);
    else if (a.type === "more") db.goMore(a.sub);
    else if (a.type === "help") setHelpOpen(true);
  };
  const openResult = (r) => {
    setSearchOpen(false);
    if (r.kind === "command") { runCommand(r.act); return; }
    if (r.kind === "module") db.goModule(r.item.id);
    else if (r.kind === "note") setNoteView(r.item.id);
    else if (r.kind === "exam") db.goLearn("pruefungen");
    else openForm(r.kind, r.item);
  };

  const backupAge = data.meta?.lastBackup ? diffDays(dayOf(data.meta.lastBackup), iso()) : null;
  const hasData = data.modules.length + data.logs.length + data.notes.length > 0;
  const noteObj = noteView ? data.notes.find((n) => n.id === noteView) : null;

  /* Am breiten Bildschirm stehen „Heute“ und die Woche nebeneinander */
  const split = wide && data.settings.wideLayout !== false && data.modules.length > 0;
  const todayEl = <Today db={db} onQuick={() => setQuickOpen(true)} whatNowOpen={whatNowOpen} setWhatNowOpen={setWhatNowOpen} notice={ENV && hasData && cloud.phase !== "ready" && (backupAge === null || backupAge >= (data.settings.backupDays || 7)) ? (
          <div className="notice notice-plain flex items-center gap-3">
            <p className="flex-1">{backupAge === null ? "Du hast noch keine Sicherung exportiert." : `Letzte Sicherung vor ${backupAge} Tagen.`} Deine Daten liegen nur auf diesem Gerät. Sichere sie oder schalte den Cloud-Sync ein.</p>
            <button className={btnGhost} onClick={() => db.goMore("daten")}>Jetzt sichern</button>
          </div>
        ) : null} />;

  if (!ready) {
    return (
      <div className="font-ui flex min-h-screen items-center justify-center bg-slate-950 text-slate-400">
        <p className="text-sm">StudyOS wird geladen …</p>
      </div>
    );
  }

  return (
    <div className="font-ui min-h-screen">
      <Sky />
      <header className="appbar safe-top sticky top-0 z-20">
        <div className={`mx-auto flex items-center gap-2 px-4 py-3 ${split && tab === "heute" ? "main-wide" : "max-w-3xl"}`}>
          <h1 className="brand">StudyOS</h1>
          <span className="hidden text-xs text-slate-500 sm:inline">{[data.settings.program, data.settings.university].filter(Boolean).join(", ")}</span>
          <div className="ml-auto flex items-center gap-2">
            <TimerBadge timer={timer} onClick={() => db.goLearn("timer")} />
            <SyncDot cloud={cloud} onOpenSettings={() => db.goMore("daten")} />
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
            <button onClick={() => setQuickOpen(true)} className="btn btn-ghost btn-icon appbar-plus" aria-label="Schnelleingabe (E)" title="Schnelleingabe (E)">
              <Icon name="plus" />
            </button>
            <button onClick={() => setSearchOpen(true)} className="btn btn-ghost btn-icon" aria-label="Suchen (Strg + K)" title="Suchen (Strg + K)">
              <Icon name="search" />
            </button>
          </div>
        </div>
      </header>

      <main ref={mainRef} className={`pb-nav mx-auto px-4 pt-3 ${split && tab === "heute" ? "main-wide" : "max-w-3xl"}`}>
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
        <Suspense fallback={<Loading />}>
        {/* neu pro Bereich, damit die Retro-Animationen beim Wechsel einsetzen */}
        <div key={tab + (tab === "module" && moduleId ? ":" + moduleId : "")} className="view">
        {tab === "heute" && (split ? (
          <div className="split">
            <div className="split-main">{todayEl}</div>
            <aside className="split-side" aria-label="Woche"><WeekView db={db} compact /></aside>
          </div>
        ) : todayEl)}
        {tab === "module" && (moduleId && modMap[moduleId] ? <ModuleDetail db={db} id={moduleId} onBack={() => setModuleId(null)} /> : <ModuleList db={db} />)}
        {tab === "woche" && <WeekView db={db} />}
        {tab === "lernen" && <Learn db={db} sub={learnTab} setSub={setLearnTab} timer={timerApi} cardFilter={cardFilter} setCardFilter={setCardFilter} />}
        {tab === "mehr" && <More db={db} sub={moreTab} setSub={setMoreTab} />}
        </div>
        </Suspense>
        <p className="mt-10 text-center text-[11px] text-slate-600">StudyOS {typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "dev"}, Datenformat {DATA_VERSION}</p>
      </main>

      {sel && <SelectBar db={db} />}
      <nav aria-label="Hauptnavigation" className="tabbar">
        <ul>
          {nav.map(([k, l, ic]) => (
            <li key={k}>
              <button onClick={() => goTab(k)} aria-current={tab === k ? "page" : undefined}
                className="tab">
                <Icon name={ic} />{l}
              </button>
            </li>
          ))}
        </ul>
      </nav>

      <Suspense fallback={null}>
      {helpOpen && <ShortcutHelp onClose={() => setHelpOpen(false)} />}
      {shareIn && <ShareImport db={db} token={shareIn.token} keyStr={shareIn.key} onClose={() => { setShareIn(null); setLearnTab("karten"); setTab("lernen"); }} />}
      </Suspense>
      {menu?.mode === "menu" && <ItemMenu db={db} kind={menu.kind} item={menu.item} onClose={() => setMenu(null)} />}
      {menu?.mode === "postpone" && <PostponeSheet db={db} kind={menu.kind} item={menu.item} onClose={() => setMenu(null)} />}
      {quickOpen && <QuickAdd db={db} onClose={() => setQuickOpen(false)} />}
      <TimerTitle timer={timer} />
      <Toasts items={toasts} onClose={closeToast} />
      <Suspense fallback={null}>
      {searchOpen && <SearchModal data={data} db={db} onPick={openResult} onClose={() => setSearchOpen(false)} />}
      {noteObj && !form && <NoteViewer note={noteObj} db={db} onClose={() => setNoteView(null)} onEdit={() => { setNoteView(null); openForm("note", noteObj); }} />}
      </Suspense>
      {focusLog && !form && <FocusNote key={focusLog.id} log={focusLog} db={db} onClose={() => setFocusNoteId(null)}
        onDetails={(l) => { setFocusNoteId(null); openForm("log", l); }} onDiscard={() => { setFocusNoteId(null); removeEntity("log", focusLog.id); }} />}
      {form?.kind === "card" && form.initial?.occ ? <Suspense fallback={null}><OcclusionEditor key={form.initial.id || "new"} db={db} initial={form.initial} onClose={() => setForm(null)} /></Suspense>
        : form && <FormModal key={form.kind + (form.initial?.id || "new")} form={form} data={data} db={db} onSave={saveEntity} onDelete={removeEntity} onDeleteSeries={removeSeries} onClose={() => setForm(null)} />}
      {cardDraft && <FormModal key="card-draft" form={cardDraft} data={data} db={db} onSave={(...a) => { saveEntity(...a); toast("Karteikarte angelegt."); }} onDelete={removeEntity} onDeleteSeries={removeSeries} onClose={() => setCardDraft(null)} />}
    </div>
  );
}
