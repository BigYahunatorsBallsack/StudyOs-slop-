import React, { useState, useEffect, useMemo } from "react";
import { PALETTE } from "../lib/constants.js";
import { countsOf, demoData, emptyData, normalizeImport } from "../lib/data.js";
import { ENV } from "../lib/env.js";
import { buildICS, guessType, parseICS } from "../lib/ics.js";
import { iso, saveFile, uid } from "../lib/util.js";
import { Card, ConfirmButton, Tabs } from "../ui/primitives.jsx";
import { btnGhost, btnPrimary, inputBase, inputCls, inputFlex } from "../ui/styles.js";
import { decryptBackup, encryptBackup, isEncryptedBackup } from "../lib/crypto.js";
import { CloudCard } from "./Cloud.jsx";
import { CANTEENS, mensaOf } from "../lib/mensa.js";
import { CommuteSettings } from "./Commute.jsx";
import { ArtemisCard, FeedCard, MoodleCard } from "./Feed.jsx";

export function DataView({ db }) {
  const { data } = db;
  const [msg, setMsg] = useState("");
  const [showJson, setShowJson] = useState(false);
  const [pasted, setPasted] = useState("");
  const [pending, setPending] = useState(null);
  const [importErr, setImportErr] = useState("");
  const [encrypt, setEncrypt] = useState(false);
  const [pass, setPass] = useState("");
  const [pass2, setPass2] = useState("");
  const [locked, setLocked] = useState(null);
  const [unlockPass, setUnlockPass] = useState("");
  const [busy, setBusy] = useState(false);
  const [storage, setStorage] = useState(null);
  useEffect(() => { if (db.env?.storageInfo) db.env.storageInfo().then(setStorage).catch(() => {}); }, [db.env, db.saveState]);
  const [icsOptions, setIcsOptions] = useState({ homework: true, exams: true, sessions: false });
  const [snapshots, setSnapshots] = useState([]);
  const [snapshotBusy, setSnapshotBusy] = useState(false);
  useEffect(() => { if (db.env?.listSnapshots) db.env.listSnapshots().then(setSnapshots).catch(() => {}); }, [db.env]);
  const refreshSnapshots = () => db.env?.listSnapshots && db.env.listSnapshots().then(setSnapshots).catch(() => {});
  const createSnapshot = async () => {
    if (!db.env?.snapshot) return;
    setSnapshotBusy(true);
    await db.env.snapshot("Manuelle Sicherung", data);
    await refreshSnapshots(); setSnapshotBusy(false); setMsg("Wiederherstellungspunkt auf diesem Gerät erstellt.");
  };
  const restoreSnapshot = async (s) => {
    if (!db.env?.loadSnapshot) return;
    const full = await db.env.loadSnapshot(s.id);
    if (full?.payload) { db.replaceAll(normalizeImport(full.payload)); setMsg("Wiederherstellung gestartet. Die Daten werden gespeichert."); }
  };
  const json = useMemo(() => (showJson ? JSON.stringify(data, null, 2) : ""), [showJson, data]);
  const counts = countsOf;

  const passProblem = encrypt ? (pass.length < 8 ? "Die Passphrase braucht mindestens 8 Zeichen." : pass !== pass2 ? "Die Passphrasen stimmen nicht überein." : "") : "";
  /* Sicherung vorbereiten: optional verschlüsselt. Rückgabe: [Datenstand mit Sicherungsdatum, Dateitext] */
  const prepare = async () => {
    const backup = { ...data, meta: { ...data.meta, lastBackup: new Date().toISOString() } };
    const body = encrypt ? await encryptBackup(backup, pass) : backup;
    return [backup, JSON.stringify(body, null, encrypt ? 0 : 2)];
  };
  const download = async () => {
    if (passProblem) return;
    setBusy(true);
    try {
      const [backup, text] = await prepare();
      const result = await saveFile(`studyos-backup-${iso()}${encrypt ? "-verschluesselt" : ""}.json`, text, "application/json");
      if (result === "aborted") return;
      db.markSaved(backup); setMsg(encrypt ? "Verschlüsselte Sicherung exportiert. Ohne Passphrase lässt sie sich nicht wiederherstellen." : "Sicherung exportiert. Bewahre die Datei an einem zweiten Ort auf.");
    } catch { setShowJson(true); setMsg("Download nicht möglich. Kopiere stattdessen den JSON-Text."); }
    finally { setBusy(false); }
  };
  const copy = async () => {
    if (passProblem) return;
    setBusy(true);
    try { const [backup, text] = await prepare(); await navigator.clipboard.writeText(text); db.markSaved(backup); setMsg("In die Zwischenablage kopiert. Speichere den Text als .json-Datei."); }
    catch { setShowJson(true); setMsg("Kopieren nicht erlaubt. Markiere den Text unten und kopiere ihn manuell."); }
    finally { setBusy(false); }
  };
  const exportICS = async () => {
    try {
      const res = await saveFile(`studyos-kalender-${iso()}.ics`, buildICS(data, icsOptions), "text/calendar;charset=utf-8");
      if (res !== "aborted") setMsg("Kalenderdatei erstellt. Öffne sie am Handy, um die Termine in deinen Kalender zu übernehmen.");
    } catch { setMsg("Kalenderdatei konnte nicht erstellt werden."); }
  };
  const tryParse = (text) => {
    setImportErr(""); setLocked(null); setPending(null);
    try {
      const obj = JSON.parse(text);
      if (isEncryptedBackup(obj)) { setLocked(obj); setUnlockPass(""); return; }
      setPending(normalizeImport(obj));
    } catch (e) { setImportErr(e instanceof SyntaxError ? "Die Datei ist kein gültiges JSON." : e.message); }
  };
  const unlock = async () => {
    setBusy(true); setImportErr("");
    try { setPending(normalizeImport(await decryptBackup(locked, unlockPass))); setLocked(null); setUnlockPass(""); }
    catch (e) { setImportErr(e.message); }
    finally { setBusy(false); }
  };
  const finishImport = (text) => { setPending(null); setPasted(""); setMsg(text); };
  const readFile = (file, cb) => { if (!file) return; const r = new FileReader(); r.onload = () => cb(String(r.result)); r.onerror = () => setImportErr("Datei konnte nicht gelesen werden."); r.readAsText(file); };

  return (
    <div className="space-y-4">
      <CloudCard cloud={db.cloud} settings={data.settings} patchSettings={db.patchSettings} onRestore={(d, label) => db.replaceAll(d, `Vor dem Wiederherstellen (Cloud-Sicherung ${label})`)} />

      <FeedCard db={db} />
      <MoodleCard db={db} />
      <ArtemisCard db={db} />
      <CommuteSettings db={db} />

      <Card title="Export (Sicherung)">
        <p className="text-xs text-slate-400">{counts(data)}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button className={btnPrimary} onClick={download} disabled={busy || !!passProblem}>{busy ? "Bitte warten …" : "Als Datei herunterladen"}</button>
          <button className={btnGhost} onClick={copy} disabled={busy || !!passProblem}>In Zwischenablage kopieren</button>
          <button className={btnGhost} onClick={() => setShowJson((v) => !v)} aria-expanded={showJson}>{showJson ? "JSON ausblenden" : "JSON anzeigen"}</button>
        </div>
        <label className="mt-3 flex cursor-pointer items-center gap-2 text-sm text-slate-300">
          <input type="checkbox" className="h-4 w-4 accent-sky-500" checked={encrypt} onChange={(e) => setEncrypt(e.target.checked)} />
          Mit Passphrase verschlüsseln (AES-256)
        </label>
        {encrypt && (
          <div className="mt-2 grid grid-cols-2 gap-2">
            <input type="password" autoComplete="new-password" aria-label="Passphrase" placeholder="Passphrase (mind. 8 Zeichen)" className={`${inputCls} col-span-2 sm:col-span-1`} value={pass} onChange={(e) => setPass(e.target.value)} />
            <input type="password" autoComplete="new-password" aria-label="Passphrase wiederholen" placeholder="Wiederholen" className={`${inputCls} col-span-2 sm:col-span-1`} value={pass2} onChange={(e) => setPass2(e.target.value)} />
            <p className="col-span-2 text-[11px] text-slate-500">{passProblem || "Die Passphrase wird nirgends gespeichert. Vergisst du sie, ist die Sicherung verloren."}</p>
          </div>
        )}
        {msg && <p role="status" className="mt-2 text-xs text-emerald-300">{msg}</p>}
        {showJson && <textarea readOnly aria-label="Exportierte Daten" className={`${inputBase} w-full font-num mt-3 h-40 text-[11px]`} value={json} onFocus={(e) => e.target.select()} />}
      </Card>

      {db.env?.listSnapshots && (
        <Card title="Wiederherstellung auf diesem Gerät">
          <p className="text-xs text-slate-400">StudyOS hält bis zu 8 lokale Zwischenstände vor großen Änderungen. Sie ersetzen keine Sicherungsdatei und sind nicht auf anderen Geräten verfügbar.</p>
          <button className={`${btnGhost} mt-2`} disabled={snapshotBusy} onClick={createSnapshot}>{snapshotBusy ? "Erstellt …" : "Jetzt Wiederherstellungspunkt erstellen"}</button>
          {snapshots.length > 0 ? (
            <ul className="mt-3 space-y-2">
              {snapshots.map((s) => (
                <li key={s.id} className="flex items-center gap-2 rounded-lg bg-slate-800/40 px-3 py-2">
                  <div className="min-w-0 flex-1"><p className="text-sm">{s.label}</p><p className="font-num text-[11px] text-slate-500">{new Date(s.created).toLocaleString("de-DE")}</p></div>
                  <ConfirmButton label="Wiederherstellen" confirmLabel="Daten ersetzen?" className={btnGhost} onConfirm={() => restoreSnapshot(s)} />
                </li>
              ))}
            </ul>
          ) : <p className="mt-2 text-xs text-slate-500">Noch keine Zwischenstände.</p>}
        </Card>
      )}

      <Card title="Import (Sicherung wiederherstellen)">
        <div className="flex flex-wrap items-center gap-2">
          <label className={`${btnGhost} cursor-pointer`}>Datei wählen<input type="file" accept=".json,application/json" className="sr-only" onChange={(e) => { readFile(e.target.files[0], tryParse); e.target.value = ""; }} /></label>
          <span className="text-xs text-slate-500">oder JSON einfügen:</span>
        </div>
        <textarea aria-label="JSON zum Import einfügen" className={`${inputBase} w-full font-num mt-2 h-20 text-[11px]`} value={pasted} onChange={(e) => setPasted(e.target.value)} placeholder='{"version":1,"modules":[…]}' />
        <button className={`${btnGhost} mt-2`} disabled={!pasted.trim()} onClick={() => tryParse(pasted)}>Eingefügten Text prüfen</button>
        {importErr && <p role="alert" className="mt-2 text-xs text-rose-400">{importErr}</p>}
        {locked && (
          <div className="mt-3 rounded-lg border border-sky-500/40 bg-sky-500/10 p-3">
            <p className="text-xs text-sky-100">Diese Sicherung ist verschlüsselt.</p>
            <form className="mt-2 flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); unlock(); }}>
              <input type="password" autoComplete="current-password" aria-label="Passphrase zum Entschlüsseln" placeholder="Passphrase" className={inputFlex} value={unlockPass} onChange={(e) => setUnlockPass(e.target.value)} />
              <button type="submit" className={btnPrimary} disabled={busy || !unlockPass}>{busy ? "Entschlüsselt …" : "Entschlüsseln"}</button>
              <button type="button" className={btnGhost} onClick={() => setLocked(null)}>Abbrechen</button>
            </form>
          </div>
        )}
        {pending && (
          <div className="mt-3 rounded-lg border border-sky-500/40 bg-sky-500/10 p-3">
            <p className="text-xs text-sky-100">Gefunden: {counts(pending)}</p>
            <p className="mt-1 text-xs text-slate-400"><b>Zusammenführen</b> übernimmt neue und jüngere Einträge und behält deine eigenen (für zwei Geräte). <b>Ersetzen</b> verwirft alle aktuellen Daten.</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <button className={btnPrimary} onClick={() => { const st = db.mergeIn(pending); finishImport(`Zusammengeführt: ${st.added} neu, ${st.updated} aktualisiert, ${st.removed} entfernt.${st.removed ? " Nicht übernommen wurden Einträge, die auf diesem Gerät später gelöscht wurden. Um eine Sicherung vollständig wiederherzustellen, wähle „Daten ersetzen“." : ""}`); }}>Zusammenführen</button>
              <ConfirmButton label="Daten ersetzen" confirmLabel="Ja, alles ersetzen" className={btnGhost} onConfirm={() => { db.replaceAll(pending); finishImport("Import abgeschlossen. Deine Daten werden gespeichert."); }} />
              <button className={btnGhost} onClick={() => setPending(null)}>Abbrechen</button>
            </div>
          </div>
        )}
      </Card>

      <IcsImport db={db} readFile={readFile} />

      <Card title="Kalender exportieren">
        <p className="text-xs text-slate-400">Abgaben und Prüfungen als .ics exportieren und zum Handy-Kalender hinzufügen. Kalender-Erinnerungen werden mitgeliefert. Regelmäßige Lehrtermine können optional mit exportiert werden.</p>
        <div className="mt-3 space-y-2">
          {[["homework", "Offene Hausaufgaben und Abgaben"], ["exams", "Prüfungen"], ["sessions", "Anstehende Lehrveranstaltungen"]].map(([k, label]) => (
            <label key={k} className="flex items-center gap-2 text-sm text-slate-300"><input type="checkbox" className="h-4 w-4 accent-sky-500" checked={icsOptions[k]} onChange={(e) => setIcsOptions((o) => ({ ...o, [k]: e.target.checked }))} />{label}</label>
          ))}
        </div>
        <button className="mt-3 rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-200 hover:bg-slate-800" onClick={exportICS} disabled={!Object.values(icsOptions).some(Boolean)}>Kalenderdatei erstellen</button>
      </Card>

      {storage && (
        <Card title="Speicher auf diesem Gerät">
          <p className="text-xs text-slate-400">
            {storage.usage !== null && storage.quota ? `${(storage.usage / 1048576).toFixed(1).replace(".", ",")} MB von ${Math.round(storage.quota / 1048576).toLocaleString("de-DE")} MB belegt. ` : ""}
            {storage.persisted === true ? "Der Browser hält die Daten dauerhaft vor." : storage.persisted === false ? "Der Browser darf die Daten bei Speichermangel löschen. Installiere die App, um das zu verhindern." : ""}
          </p>
          {!storage.mirrorOk && <p role="alert" className="mt-2 text-xs text-amber-300">Die Notfallkopie (localStorage, ca. 5 MB) ist voll. Deine Daten liegen weiter sicher in der Datenbank, aber es gibt keine zweite Kopie mehr auf dem Gerät. Exportiere regelmäßig eine Sicherung.</p>}
          {storage.mode === "local" && <p role="alert" className="mt-2 text-xs text-amber-300">Die Datenbank (IndexedDB) ist nicht verfügbar, gespeichert wird nur in localStorage. Exportiere regelmäßig eine Sicherung.</p>}
        </Card>
      )}

      <Card title="Einstellungen">
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label htmlFor="st-name" className="mb-1 block text-xs text-slate-400">Dein Name (für die Begrüßung)</label>
            <input id="st-name" className={inputCls} value={data.settings.name ?? ""} onChange={(e) => db.patchSettings({ name: e.target.value })} placeholder="optional" />
          </div>
          <div>
            <label htmlFor="st-uni" className="mb-1 block text-xs text-slate-400">Hochschule</label>
            <input id="st-uni" className={inputCls} value={data.settings.university ?? ""} onChange={(e) => db.patchSettings({ university: e.target.value })} placeholder="z. B. TUM" />
          </div>
          <div className="col-span-2">
            <label htmlFor="st-mensa" className="mb-1 block text-xs text-slate-400">Mensa auf „Heute“</label>
            <select id="st-mensa" className={inputCls} value={mensaOf(data.settings)} onChange={(e) => db.patchSettings({ mensa: e.target.value })}>
              <option value="">Keine anzeigen</option>
              {CANTEENS.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="st-prog" className="mb-1 block text-xs text-slate-400">Studiengang</label>
            <input id="st-prog" className={inputCls} value={data.settings.program ?? ""} onChange={(e) => db.patchSettings({ program: e.target.value })} placeholder="z. B. Informatik" />
          </div>
          <div className="col-span-2">
            <span className="mb-1 block text-xs text-slate-400">Darstellung</span>
            <Tabs items={[["dark", "Dunkel"], ["light", "Hell"], ["retro", "Retro"], ["system", "Wie System"]]} value={data.settings.theme || "dark"} onChange={(v) => db.patchSettings({ theme: v })} label="Darstellung" />
          </div>
          {data.settings.theme === "retro" && (
            <div className="col-span-2">
              <span className="mb-1 block text-xs text-slate-400">Retro-Animationen</span>
              <Tabs items={[["arcade", "Arcade"], ["crt", "Röhre"], ["glitch", "Glitch"], ["off", "Aus"]]} value={data.settings.retroMotion || "arcade"} onChange={(v) => db.patchSettings({ retroMotion: v })} label="Retro-Animationen" />
              <p className="mt-1.5 text-xs text-slate-400">{{ arcade: "8-Bit-Spielhalle: Inhalte rasten in Pixel-Schritten ein, Knöpfe springen wie Münzen.", crt: "Alter Röhrenmonitor: Inhalte schalten sich wie ein Bildschirm ein und aus und leuchten kurz nach.", glitch: "Digitale Störung: Inhalte erscheinen in versetzten Streifen mit Farbversatz.", off: "Keine Animationen, nur der Retro-Look." }[data.settings.retroMotion || "arcade"]} Ist am Gerät „Bewegung reduzieren“ eingeschaltet, bleibt alles still.</p>
            </div>
          )}
          <div>
            <label htmlFor="st-ects" className="mb-1 block text-xs text-slate-400">ECTS-Ziel (Studiengang)</label>
            <input id="st-ects" type="number" min="1" className={inputCls} value={data.settings.targetEcts} onChange={(e) => db.patchSettings({ targetEcts: Math.max(1, Number(e.target.value) || 1) })} />
          </div>
          <div>
            <label htmlFor="st-th" className="mb-1 block text-xs text-slate-400">Warnung unter Nachbereitung (%)</label>
            <input id="st-th" type="number" min="0" max="100" className={inputCls} value={data.settings.threshold} onChange={(e) => db.patchSettings({ threshold: Math.min(100, Math.max(0, Number(e.target.value) || 0)) })} />
          </div>
          <div>
            <label htmlFor="st-week" className="mb-1 block text-xs text-slate-400">Wochenziel Lernzeit (Std., 0 = aus)</label>
            <input id="st-week" type="number" min="0" max="168" className={inputCls} value={data.settings.weeklyGoal || 0} onChange={(e) => db.patchSettings({ weeklyGoal: Math.max(0, Math.min(168, Number(e.target.value) || 0)) })} />
          </div>
          <div>
            <label htmlFor="st-backup" className="mb-1 block text-xs text-slate-400">Erinnerung an Sicherung (Tage)</label>
            <input id="st-backup" type="number" min="1" max="90" className={inputCls} value={data.settings.backupDays || 7} onChange={(e) => db.patchSettings({ backupDays: Math.max(1, Math.min(90, Number(e.target.value) || 7)) })} />
          </div>
          <div>
            <label htmlFor="st-weeks" className="mb-1 block text-xs text-slate-400">Semesterwochen inkl. Prüfungsphase</label>
            <input id="st-weeks" type="number" min="4" max="30" className={inputCls} value={data.settings.semesterWeeks || 18} onChange={(e) => db.patchSettings({ semesterWeeks: Math.max(4, Math.min(30, Number(e.target.value) || 18)) })} />
          </div>
          <label className="col-span-2 flex cursor-pointer items-center gap-2 rounded-lg bg-slate-800/40 px-3 py-2 text-sm text-slate-300">
            <input type="checkbox" className="h-4 w-4 accent-sky-500" checked={data.settings.sound !== false} onChange={(e) => db.patchSettings({ sound: e.target.checked })} />
            Signalton und Vibration bei Timer-Ende (der Ton startet nach der ersten Timer-Aktion)
          </label>
        </div>
        <p className="mt-2 text-xs text-slate-500">ECTS-Ziel und Notengewichtung können je nach Prüfungsordnung abweichen. Der Notenschnitt in StudyOS ist ECTS-gewichtet.</p>
        {ENV && <p className="mt-2 text-xs text-slate-400">Die App ist offline-fähig und speichert lokal auf diesem Gerät. Für ein zweites Gerät exportiere eine Sicherung. Zum Installieren: oben „App installieren“ oder im Browser-Menü „Zum Startbildschirm“ / „App installieren“.</p>}
      </Card>

      <Card title="Ausprobieren & Zurücksetzen">
        <div className="flex flex-wrap gap-2">
          <ConfirmButton label="Beispieldaten laden" confirmLabel="Aktuelle Daten ersetzen?" className={btnGhost} onConfirm={() => db.replaceAll(demoData())} />
          <ConfirmButton label="Alle Daten löschen" confirmLabel="Wirklich alles löschen?" onConfirm={() => db.replaceAll(emptyData())} />
        </div>
      </Card>
    </div>
  );
}

export function IcsImport({ db, readFile }) {
  const { data } = db;
  const [events, setEvents] = useState(null);
  const [map, setMap] = useState({});
  const [err, setErr] = useState("");
  const [done, setDone] = useState("");
  const groups = events ? [...new Set(events.map((e) => e.summary))] : [];

  const load = (text) => {
    setErr(""); setDone("");
    try {
      const ev = parseICS(text).filter((e) => !e.cancelled);
      if (!ev.length) { setErr("Keine Termine in der Datei gefunden."); setEvents(null); return; }
      const mp = {};
      [...new Set(ev.map((e) => e.summary))].forEach((s) => { const hit = data.modules.find((m) => s.toLowerCase().includes(m.name.toLowerCase()) || (m.code && s.includes(m.code))); mp[s] = hit ? hit.id : "__skip"; });
      setEvents(ev); setMap(mp);
    } catch { setErr("Die Datei konnte nicht gelesen werden."); }
  };

  const run = () => {
    let added = 0, skipped = 0;
    const next = (() => {
      const d = { ...data, modules: [...data.modules], sessions: [...data.sessions] };
      const created = {};
      groups.forEach((g) => {
        if (map[g] === "__new") { const m = { id: uid(), name: g, code: "", ects: 6, semester: 1, status: "belegt", grade: null, color: PALETTE[d.modules.length % PALETTE.length] }; d.modules.push(m); created[g] = m.id; }
      });
      events.forEach((e) => {
        const mid = map[e.summary] === "__new" ? created[e.summary] : map[e.summary];
        if (!mid || mid === "__skip") return;
        if (d.sessions.some((s) => s.moduleId === mid && s.date === e.date && s.start === e.start)) { skipped++; return; }
        d.sessions.push({ id: uid(), moduleId: mid, type: guessType(e.summary), date: e.date, start: e.start, end: e.end, room: e.room, prepared: false, attended: false, reviewed: false, reviewedAt: null });
        added++;
      });
      return d;
    })();
    db.withUndo(`${added} Termine importiert.`, () => next);
    setDone(`${added} Termine importiert${skipped ? `, ${skipped} Duplikate übersprungen` : ""}.`);
    setEvents(null);
  };

  return (
    <Card title="Kalender importieren (ICS)">
      <p className="text-xs text-slate-400">Für Stundenpläne aus TUMonline oder anderen Kalendern als .ics-Datei. Ob und wo TUMonline einen Export anbietet, prüfst du in deinem Account.</p>
      <label className={`${btnGhost} mt-3 inline-block cursor-pointer`}>ICS-Datei wählen<input type="file" accept=".ics,text/calendar" className="sr-only" onChange={(e) => { readFile(e.target.files[0], load); e.target.value = ""; }} /></label>
      {err && <p role="alert" className="mt-2 text-xs text-rose-400">{err}</p>}
      {done && <p role="status" className="mt-2 text-xs text-emerald-300">{done}</p>}
      {events && (
        <div className="mt-3 space-y-3">
          <p className="text-xs text-slate-300">{events.length} Termine in {groups.length} Veranstaltungen gefunden. Ordne sie Modulen zu:</p>
          <ul className="rows">
            {groups.map((g) => (
              <li key={g} className="rounded-lg bg-slate-800/40 p-2">
                <p className="text-sm">{g} <span className="text-xs text-slate-500">· {events.filter((e) => e.summary === g).length}× · {guessType(g)}</span></p>
                <label className="sr-only" htmlFor={"ics-" + g}>Modul für {g}</label>
                <select id={"ics-" + g} className={`${inputCls} mt-1`} value={map[g]} onChange={(e) => setMap((m) => ({ ...m, [g]: e.target.value }))}>
                  <option value="__skip">Nicht importieren</option>
                  <option value="__new">Neues Modul mit diesem Namen</option>
                  {data.modules.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
              </li>
            ))}
          </ul>
          <div className="flex gap-2">
            <button className={btnPrimary} onClick={run} disabled={!Object.values(map).some((v) => v !== "__skip")}>Importieren</button>
            <button className={btnGhost} onClick={() => setEvents(null)}>Abbrechen</button>
          </div>
        </div>
      )}
    </Card>
  );
}
