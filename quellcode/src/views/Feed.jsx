/* Stundenplan-Abo (z. B. TUMonline): Link eintragen, Veranstaltungen Modulen zuordnen, automatisch aktuell halten */
import React, { useState } from "react";
import { parseICS } from "../lib/ics.js";
import { guessMapping, NEW, SKIP, unmappedSummaries } from "../lib/feed.js";
import { isMoodleDeadline, unmappedCourses } from "../lib/moodle.js";
import { Card, ConfirmButton } from "../ui/primitives.jsx";

const fmtWhen = (s) => (s ? new Date(s).toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" }) : "noch nie");

function MappingList({ summaries, map, setMap, modules }) {
  return (
    <ul className="rows mt-3">
      {summaries.map((s) => (
        <li key={s} className="row" style={{ "--mod": modules.find((m) => m.id === map[s])?.color }}>
          <p className="row-title">{s}</p>
          <label className="sr-only" htmlFor={"feed-" + s}>Modul für {s}</label>
          <select id={"feed-" + s} className="field mt-2 w-full text-sm" value={map[s] ?? NEW} onChange={(e) => setMap({ ...map, [s]: e.target.value })}>
            <option value={NEW}>Neues Modul anlegen</option>
            <option value={SKIP}>Nicht übernehmen</option>
            {modules.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </li>
      ))}
    </ul>
  );
}

export function FeedCard({ db }) {
  const { data, cloud } = db;
  const feed = data.settings.icsFeed || null;
  const [url, setUrl] = useState("");
  const [draft, setDraft] = useState(null); /* { url, events, map } beim Einrichten */
  const [pendingMap, setPendingMap] = useState({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const ready = cloud && cloud.phase === "ready";

  const run = async (fn) => { setBusy(true); setErr(""); setMsg(""); try { await fn(); } catch (e) { setErr(e.message || String(e)); } finally { setBusy(false); } };
  const preview = () => run(async () => {
    const text = await cloud.fetchIcs(url.trim());
    const events = parseICS(text);
    if (!events.length) throw new Error("Der Kalender enthält keine Termine.");
    const sums = unmappedSummaries(events, {});
    setDraft({ url: url.trim(), events, map: guessMapping(sums, data.modules) });
  });
  const subscribe = () => run(async () => {
    const res = await db.subscribeFeed(draft.url, draft.map, draft.events);
    setDraft(null); setUrl("");
    setMsg(`Abonniert: ${res.added} Termine übernommen.`);
  });
  const refresh = () => run(async () => {
    const r = await db.syncFeed({ manual: true });
    setMsg(r ? `Abgerufen: ${r.added} neu, ${r.updated} geändert, ${r.cancelled} abgesagt, ${r.removed} entfernt${r.merged ? `, ${r.merged} doppelte zusammengelegt` : ""}.` : "");
  });
  const assignPending = () => run(async () => {
    const r = await db.mapFeed(Object.fromEntries((feed.pending || []).map((s) => [s, pendingMap[s] ?? NEW])));
    setPendingMap({});
    setMsg(`Zugeordnet: ${r.added} Termine übernommen.`);
  });

  return (
    <Card title="Stundenplan-Abo">
      {!ready ? (
        <p className="text-xs text-slate-400">Abonniere deinen Kalender aus TUMonline, damit Vorlesungen, Übungen, Raumänderungen und Ausfälle automatisch in StudyOS landen. Dafür musst du oben beim Cloud-Sync angemeldet sein, weil der Kalender über deine Supabase-Funktion abgerufen wird.</p>
      ) : !feed ? (
        draft ? (
          <>
            <p className="text-xs text-slate-400">{draft.events.length} Termine in {Object.keys(draft.map).length} Veranstaltungen gefunden. Ordne sie deinen Modulen zu:</p>
            <MappingList summaries={Object.keys(draft.map)} map={draft.map} setMap={(m) => setDraft({ ...draft, map: m })} modules={data.modules} />
            <div className="mt-3 flex flex-wrap gap-2">
              <button className="btn btn-primary" onClick={subscribe} disabled={busy}>Abonnieren</button>
              <button className="btn btn-ghost" onClick={() => setDraft(null)}>Abbrechen</button>
            </div>
          </>
        ) : (
          <>
            <p className="text-xs text-slate-400">In TUMonline unter <b className="text-slate-200">Terminkalender</b> auf <b className="text-slate-200">Veröffentlichen</b> gehen und den iCal-Link kopieren. Links von cal.tum.app gehen auch.</p>
            <form className="mt-3 flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); preview(); }}>
              <input type="url" inputMode="url" aria-label="TUMonline-Kalender-Link" placeholder="https://campus.tum.de/…" className="field min-w-0 flex-1 text-sm" value={url} onChange={(e) => setUrl(e.target.value)} />
              <button type="submit" className="btn btn-primary" disabled={busy || !url.trim()}>{busy ? "Ruft ab …" : "Abrufen"}</button>
            </form>
          </>
        )
      ) : (
        <>
          <p className="text-sm text-slate-300">Abonniert, zuletzt abgerufen: {fmtWhen(feed.lastSync)}</p>
          <p className="mt-1 text-xs text-slate-400">Wird automatisch alle paar Stunden beim Öffnen der App aktualisiert. Raumänderungen und Ausfälle werden übernommen, deine Häkchen bleiben erhalten.</p>
          {(feed.pending || []).length > 0 && (
            <div className="notice notice-info mt-3">
              <p className="notice-title">{feed.pending.length} neue {feed.pending.length === 1 ? "Veranstaltung" : "Veranstaltungen"} im Kalender</p>
              <MappingList summaries={feed.pending} map={pendingMap} setMap={setPendingMap} modules={data.modules} />
              <button className="btn btn-primary mt-3" onClick={assignPending} disabled={busy}>Zuordnung übernehmen</button>
            </div>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            <button className="btn btn-ghost" onClick={refresh} disabled={busy}>{busy ? "Ruft ab …" : "Jetzt abrufen"}</button>
            <ConfirmButton label="Abo beenden" confirmLabel="Abo beenden? Termine bleiben." onConfirm={() => { db.unsubscribeFeed(); setMsg("Abo beendet. Die übernommenen Termine bleiben erhalten."); }} />
          </div>
          {feed.lastError && !err && <p className="mt-2 text-xs text-amber-300">Letzter automatischer Abruf fehlgeschlagen: {feed.lastError}</p>}
        </>
      )}
      {err && <p role="alert" className="mt-2 text-xs text-rose-400">{err}</p>}
      {msg && <p role="status" className="mt-2 text-xs text-emerald-300">{msg}</p>}
    </Card>
  );
}

/* Moodle-Fristen: Kalender-Export aus Moodle → Hausaufgaben */
export function MoodleCard({ db }) {
  const { data, cloud } = db;
  const feed = data.settings.moodleFeed || null;
  const [url, setUrl] = useState("");
  const [draft, setDraft] = useState(null);
  const [pendingMap, setPendingMap] = useState({});
  const [busy, setBusy] = useState(false), [msg, setMsg] = useState(""), [err, setErr] = useState("");
  const ready = cloud && cloud.phase === "ready";
  const run = async (fn) => { setBusy(true); setErr(""); setMsg(""); try { await fn(); } catch (e) { setErr(e.message || String(e)); } finally { setBusy(false); } };
  const n = (k, one, many) => `${k} ${k === 1 ? one : many}`;

  const preview = () => run(async () => {
    if (!/moodle/i.test(url)) throw new Error("Das sieht nicht nach einem Moodle-Link aus. Er beginnt mit https://www.moodle.tum.de/calendar/export_execute.php …");
    const events = parseICS(await cloud.fetchIcs(url.trim()));
    const due = events.filter(isMoodleDeadline);
    if (!due.length) throw new Error(events.length ? "Im Kalender sind Termine, aber keine Abgaben. In Moodle beim Export „Alle Kurse“ und „Kürzlich und nächste 60 Tage“ wählen." : "Der Kalender ist leer. In Moodle beim Export „Alle Kurse“ wählen.");
    setDraft({ url: url.trim(), events, count: due.length, map: guessMapping(unmappedCourses(events, {}), data.modules) });
  });
  const subscribe = () => run(async () => {
    const r = await db.subscribeMoodle(draft.url, draft.map, draft.events);
    setDraft(null); setUrl("");
    setMsg(`Abonniert: ${n(r.added, "Abgabe", "Abgaben")} übernommen.`);
  });
  const refresh = () => run(async () => {
    const r = await db.syncMoodle({ manual: true });
    if (r) setMsg(`Abgerufen: ${r.added} neu, ${r.updated} geändert.`);
  });
  const assignPending = () => run(async () => {
    const r = await db.mapMoodle(Object.fromEntries((feed.pending || []).map((c) => [c, pendingMap[c] ?? NEW])));
    setPendingMap({});
    setMsg(`Zugeordnet: ${n(r.added, "Abgabe", "Abgaben")} übernommen.`);
  });

  return (
    <Card title="Moodle-Abgaben">
      {!ready ? (
        <p className="text-xs text-slate-400">Abgabefristen aus Moodle automatisch als Hausaufgaben übernehmen. Dafür oben beim Cloud-Sync anmelden.</p>
      ) : !feed ? (
        draft ? (
          <>
            <p className="text-xs text-slate-400">{n(draft.count, "Abgabe", "Abgaben")} in {n(Object.keys(draft.map).length, "Kurs", "Kursen")}. Ordne die Kurse deinen Modulen zu:</p>
            <MappingList summaries={Object.keys(draft.map)} map={draft.map} setMap={(m) => setDraft({ ...draft, map: m })} modules={data.modules} />
            <div className="mt-3 flex flex-wrap gap-2">
              <button className="btn btn-primary" onClick={subscribe} disabled={busy}>Abonnieren</button>
              <button className="btn btn-ghost" onClick={() => setDraft(null)}>Abbrechen</button>
            </div>
          </>
        ) : (
          <>
            <p className="text-xs text-slate-400">In Moodle: <b className="text-slate-200">Kalender</b> → <b className="text-slate-200">Kalender importieren oder exportieren</b> → <b className="text-slate-200">Kalender exportieren</b>. Dort „Alle Kurse“ und „Kürzlich und nächste 60 Tage“ wählen, dann <b className="text-slate-200">Kalender-URL abfragen</b> und den Link hier einfügen.</p>
            <form className="mt-3 flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); preview(); }}>
              <input type="url" inputMode="url" aria-label="Moodle-Kalender-Link" placeholder="https://www.moodle.tum.de/calendar/export_execute.php?…" className="field min-w-0 flex-1 text-sm" value={url} onChange={(e) => setUrl(e.target.value)} />
              <button type="submit" className="btn btn-primary" disabled={busy || !url.trim()}>{busy ? "Ruft ab …" : "Abrufen"}</button>
            </form>
          </>
        )
      ) : (
        <>
          <p className="text-sm text-slate-300">Abonniert, zuletzt abgerufen: {fmtWhen(feed.lastSync)}</p>
          <p className="mt-1 text-xs text-slate-400">Neue Abgaben erscheinen automatisch als Hausaufgaben. Was du selbst änderst oder löschst, bleibt so.</p>
          {(feed.pending || []).length > 0 && (
            <div className="notice notice-info mt-3">
              <p className="notice-title">{n(feed.pending.length, "neuer Kurs", "neue Kurse")} mit Abgaben</p>
              <MappingList summaries={feed.pending} map={pendingMap} setMap={setPendingMap} modules={data.modules} />
              <button className="btn btn-primary mt-3" onClick={assignPending} disabled={busy}>Zuordnung übernehmen</button>
            </div>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            <button className="btn btn-ghost" onClick={refresh} disabled={busy}>{busy ? "Ruft ab …" : "Jetzt abrufen"}</button>
            <ConfirmButton label="Abo beenden" confirmLabel="Abo beenden? Abgaben bleiben." onConfirm={() => { db.unsubscribeMoodle(); setMsg("Abo beendet. Die übernommenen Abgaben bleiben erhalten."); }} />
          </div>
          {feed.lastError && !err && <p className="mt-2 text-xs text-amber-300">Letzter automatischer Abruf fehlgeschlagen: {feed.lastError}</p>}
        </>
      )}
      {err && <p role="alert" className="mt-2 text-xs text-rose-400">{err}</p>}
      {msg && <p role="status" className="mt-2 text-xs text-emerald-300">{msg}</p>}
    </Card>
  );
}

/* Artemis: Kalender-Abo je Kurs (Kurs → Kalender → Abonnieren) */
export function ArtemisCard({ db }) {
  const { data, cloud } = db;
  const feeds = data.settings.artemisFeeds || [];
  const [url, setUrl] = useState(""), [moduleId, setModuleId] = useState("");
  const [draft, setDraft] = useState(null);
  const [busy, setBusy] = useState(false), [msg, setMsg] = useState(""), [err, setErr] = useState("");
  const ready = cloud && cloud.phase === "ready";
  const run = async (fn) => { setBusy(true); setErr(""); setMsg(""); try { await fn(); } catch (e) { setErr(e.message || String(e)); } finally { setBusy(false); } };
  const preview = () => run(async () => {
    if (!/artemis/i.test(url)) throw new Error("Das sieht nicht nach einem Artemis-Link aus.");
    const events = parseICS(await cloud.fetchIcs(url.trim()));
    const due = events.filter(isMoodleDeadline);
    if (!due.length) throw new Error(events.length ? "Im Kalender sind Termine, aber keine Abgabefristen. Beim Abonnieren in Artemis „Aufgaben“ auswählen." : "Der Kalender ist leer.");
    setDraft({ url: url.trim(), events, count: due.length, sample: due.slice(0, 3).map((e) => e.summary) });
  });
  const subscribe = () => run(async () => {
    if (!moduleId) throw new Error("Bitte ein Modul wählen.");
    const r = await db.subscribeArtemis(draft.url, moduleId, draft.events, db.mod(moduleId)?.name || "Artemis");
    setDraft(null); setUrl(""); setModuleId("");
    setMsg(`Abonniert: ${r.added} ${r.added === 1 ? "Abgabe" : "Abgaben"} übernommen.`);
  });
  const refresh = () => run(async () => { const r = await db.syncArtemis({ manual: true }); if (r) setMsg(`Abgerufen: ${r.added} neu, ${r.updated} geändert.`); });

  return (
    <Card title="Artemis-Abgaben">
      {!ready ? <p className="text-xs text-slate-400">Programmieraufgaben aus Artemis automatisch als Hausaufgaben übernehmen. Dafür oben beim Cloud-Sync anmelden.</p> : (
        <>
          {feeds.length > 0 && (
            <ul className="rows mb-3">
              {feeds.map((f) => (
                <li key={f.id} className="row" style={{ "--mod": db.mod(f.moduleId)?.color }}>
                  <div className="flex items-center gap-3">
                    <span className="min-w-0 flex-1"><span className="row-title block truncate">{db.mod(f.moduleId)?.name || f.label}</span><span className="row-meta block">zuletzt abgerufen: {fmtWhen(f.lastSync)}{f.lastError ? `, Fehler: ${f.lastError}` : ""}</span></span>
                    <ConfirmButton label="Entfernen" confirmLabel="Abo entfernen?" onConfirm={() => db.removeArtemis(f.id)} />
                  </div>
                </li>
              ))}
            </ul>
          )}
          {draft ? (
            <>
              <p className="text-xs text-slate-400">{draft.count} {draft.count === 1 ? "Abgabe" : "Abgaben"} gefunden, z. B. „{draft.sample[0]}“. Zu welchem Modul gehört der Kurs?</p>
              <select aria-label="Modul für den Artemis-Kurs" className="field mt-2 w-full text-sm" value={moduleId} onChange={(e) => setModuleId(e.target.value)}>
                <option value="">Modul wählen …</option>
                {data.modules.filter((m) => !m.archived).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
              <div className="mt-3 flex flex-wrap gap-2">
                <button className="btn btn-primary" onClick={subscribe} disabled={busy || !moduleId}>Abonnieren</button>
                <button className="btn btn-ghost" onClick={() => setDraft(null)}>Abbrechen</button>
              </div>
            </>
          ) : (
            <>
              <p className="text-xs text-slate-400">In Artemis im Kurs auf <b className="text-slate-200">Kalender</b> → <b className="text-slate-200">Abonnieren</b>, bei den Kategorien „Aufgaben“ auswählen und den Link kopieren. Für jeden Kurs ein eigenes Abo.</p>
              <form className="mt-3 flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); preview(); }}>
                <input type="url" inputMode="url" aria-label="Artemis-Kalender-Link" placeholder="https://artemis.tum.de/…" className="field min-w-0 flex-1 text-sm" value={url} onChange={(e) => setUrl(e.target.value)} />
                <button type="submit" className="btn btn-primary" disabled={busy || !url.trim()}>{busy ? "Ruft ab …" : "Prüfen"}</button>
              </form>
              {feeds.length > 0 && <button className="btn btn-ghost mt-3" onClick={refresh} disabled={busy}>Alle jetzt abrufen</button>}
            </>
          )}
        </>
      )}
      {err && <p role="alert" className="mt-2 text-xs text-rose-400">{err}</p>}
      {msg && <p role="status" className="mt-2 text-xs text-emerald-300">{msg}</p>}
    </Card>
  );
}
