/* Cloud-Sync: Anmelden per E-Mail-Code, Passphrase festlegen, Status und Abmelden */
import React, { useEffect, useState } from "react";
import { fmtSize } from "../lib/files.js";
import { Card, ConfirmButton } from "../ui/primitives.jsx";
import { btnGhost, btnPrimary, inputCls, inputFlex } from "../ui/styles.js";

const fmtTime = (s) => (s ? new Date(s).toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" }) : "noch nie");

export function CloudCard({ cloud, settings = {}, patchSettings, onRestore }) {
  const [mail, setMail] = useState("");
  const [code, setCode] = useState("");
  const [pass, setPass] = useState("");
  const [pass2, setPass2] = useState("");
  if (!cloud || !cloud.available) return null;
  const err = cloud.error && <p role="alert" className="mt-2 text-xs text-rose-400">{cloud.error}</p>;

  return (
    <Card title="Cloud-Sync">
      {cloud.phase === "loading" && <p className="text-xs text-slate-400">Prüfe Anmeldung …</p>}

      {cloud.phase === "signed-out" && (
        <>
          <p className="text-xs text-slate-400">Synchronisiert deine Daten verschlüsselt über alle Geräte. Du bekommst einen Anmeldecode per E-Mail, ein Passwort brauchst du nicht.</p>
          <form className="mt-3 flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); cloud.sendCode(mail); }}>
            <input type="email" autoComplete="email" inputMode="email" aria-label="E-Mail-Adresse" placeholder="deine@mail.de" className={inputFlex} value={mail} onChange={(e) => setMail(e.target.value)} />
            <button type="submit" className={btnPrimary} disabled={cloud.busy || !mail.trim()}>{cloud.busy ? "Sendet …" : "Code senden"}</button>
          </form>
          {err}
        </>
      )}

      {cloud.phase === "code-sent" && (
        <>
          <p className="text-xs text-slate-400">Code an <b className="text-slate-200">{cloud.email}</b> geschickt. Gib ihn hier ein. Alternativ funktioniert der Link in der Mail, wenn du ihn im selben Browser öffnest.</p>
          <form className="mt-3 flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); cloud.verifyCode(code); }}>
            <input autoComplete="one-time-code" inputMode="numeric" aria-label="Code aus der E-Mail" placeholder="123456" className={`${inputFlex} font-num tracking-widest`} value={code} onChange={(e) => setCode(e.target.value)} />
            <button type="submit" className={btnPrimary} disabled={cloud.busy || !code.trim()}>{cloud.busy ? "Prüft …" : "Anmelden"}</button>
            <button type="button" className={btnGhost} onClick={() => { setCode(""); cloud.backToEmail(); }}>Andere Adresse</button>
          </form>
          {err}
        </>
      )}

      {cloud.phase === "need-key" && (
        <>
          <p className="text-xs text-slate-400">Angemeldet als <b className="text-slate-200">{cloud.user?.email}</b>.</p>
          {cloud.remoteExists ? (
            <p className="mt-1 text-xs text-slate-400">In der Cloud liegen schon Daten. Gib die Sync-Passphrase ein, die du auf deinem ersten Gerät festgelegt hast. Deine Daten auf diesem Gerät werden zusammengeführt, nicht überschrieben.</p>
          ) : (
            <p className="mt-1 text-xs text-slate-400">Lege eine Sync-Passphrase fest. Sie verschlüsselt deine Daten, bevor sie das Gerät verlassen; Supabase kann sie nicht lesen. Du gibst sie auf jedem Gerät einmal ein. <b className="text-amber-300">Vergisst du sie, sind die Cloud-Daten verloren</b> (deine Geräte behalten ihre Daten).</p>
          )}
          <form className="mt-3 grid grid-cols-2 gap-2" onSubmit={(e) => { e.preventDefault(); cloud.setPassphrase(pass, pass2).then((ok) => ok && (setPass(""), setPass2(""))); }}>
            <input type="password" autoComplete={cloud.remoteExists ? "current-password" : "new-password"} aria-label="Sync-Passphrase" placeholder={cloud.remoteExists ? "Sync-Passphrase" : "Passphrase (mind. 8 Zeichen)"} className={`${inputCls} col-span-2 ${cloud.remoteExists ? "" : "sm:col-span-1"}`} value={pass} onChange={(e) => setPass(e.target.value)} />
            {!cloud.remoteExists && <input type="password" autoComplete="new-password" aria-label="Sync-Passphrase wiederholen" placeholder="Wiederholen" className={`${inputCls} col-span-2 sm:col-span-1`} value={pass2} onChange={(e) => setPass2(e.target.value)} />}
            <div className="col-span-2 flex flex-wrap gap-2">
              <button type="submit" className={btnPrimary} disabled={cloud.busy || !pass}>{cloud.busy ? "Leitet Schlüssel ab …" : cloud.remoteExists ? "Entsperren und synchronisieren" : "Festlegen und hochladen"}</button>
              <button type="button" className={btnGhost} onClick={cloud.signOut}>Abmelden</button>
            </div>
          </form>
          {err}
        </>
      )}

      {cloud.phase === "ready" && (
        <>
          <p className="text-sm text-slate-300">
            {cloud.status === "syncing" ? "Synchronisiert …" : cloud.status === "offline" ? "Offline: synchronisiert, sobald wieder Netz da ist." : cloud.status === "error" ? "Letzter Versuch fehlgeschlagen." : "Aktiv"}
          </p>
          <p className="mt-1 text-xs text-slate-400">Angemeldet als {cloud.user?.email} · Letzter Abgleich: {fmtTime(cloud.lastSync)}</p>
          {err}
          <div className="mt-3 flex flex-wrap gap-2">
            <button className={btnGhost} onClick={cloud.syncNow} disabled={cloud.status === "syncing"}>Jetzt synchronisieren</button>
            <ConfirmButton label="Abmelden" confirmLabel="Auf diesem Gerät abmelden?" className={btnGhost} onConfirm={cloud.signOut} />
            <ConfirmButton label="Cloud-Daten löschen" confirmLabel="Cloud-Kopie wirklich löschen?" onConfirm={cloud.deleteCloud} />
          </div>
          <p className="mt-2 text-[11px] text-slate-500">Abmelden lässt die Daten auf diesem Gerät. „Cloud-Daten löschen“ entfernt nur die Kopie in der Cloud; danach kannst du mit einer neuen Passphrase neu hochladen. Achtung: „Alle Daten löschen“ unter „Zurücksetzen“ wird bei aktivem Sync auf allen Geräten wirksam.</p>
          {patchSettings && <CloudBackups cloud={cloud} settings={settings} patchSettings={patchSettings} onRestore={onRestore} />}
        </>
      )}
    </Card>
  );
}

/* Wöchentliche, verschlüsselte Sicherungen in der Cloud (letzte 8 Wochen) */
function CloudBackups({ cloud, settings, patchSettings, onRestore }) {
  const [list, setList] = useState(null), [msg, setMsg] = useState(""), [err, setErr] = useState(""), [busy, setBusy] = useState("");
  const on = settings.cloudBackup !== false;
  const refresh = () => cloud.listBackups().then((l) => { setList(l); setErr(""); }).catch((e) => { setList([]); setErr(e.message); });
  useEffect(() => { refresh(); }, [cloud.backupInfo]);
  const now = async () => {
    setBusy("now"); setMsg(""); setErr("");
    try { await cloud.backupNow(); setMsg("Sicherung in der Cloud gespeichert."); await refresh(); } catch (e) { setErr(e.message); } finally { setBusy(""); }
  };
  const restore = async (f) => {
    setBusy(f.id); setMsg(""); setErr("");
    try { const d = await cloud.loadBackup(f.id); onRestore && onRestore(d, `KW ${f.week}/${f.year}`); setMsg(`Stand aus KW ${f.week}/${f.year} wiederhergestellt. Der vorherige Stand liegt unter „Wiederherstellungspunkte“.`); }
    catch (e) { setErr(e.message || "Die Sicherung ließ sich nicht öffnen."); } finally { setBusy(""); }
  };
  return (
    <div className="mt-4 border-t border-slate-800 pt-4" data-set="cloudBackup">
      <h3 className="section-title">Cloud-Sicherung</h3>
      <p className="mt-1 text-xs text-slate-400">Einmal pro Woche ein verschlüsselter Schnappschuss deiner Daten im privaten Cloud-Speicher, die letzten 8 Wochen bleiben erhalten. Hilft, wenn etwas versehentlich auf allen Geräten gelöscht wurde.</p>
      <label className="mt-2 flex items-center gap-2 text-sm"><input type="checkbox" checked={on} onChange={(e) => patchSettings({ cloudBackup: e.target.checked })} /> Jede Woche automatisch sichern</label>
      <div className="mt-2 flex flex-wrap gap-2"><button className={btnGhost} onClick={now} disabled={!!busy}>{busy === "now" ? "Sichert …" : "Jetzt sichern"}</button></div>
      {list && list.length > 0 && (
        <ul className="mt-3 space-y-1" aria-label="Cloud-Sicherungen">
          {list.map((f) => (
            <li key={f.id} className="flex items-center gap-2 text-sm">
              <span className="min-w-0 flex-1">KW {f.week}/{f.year}<span className="text-xs text-slate-500">{f.created ? `, ${fmtTime(f.created)}` : ""}{f.size ? `, ${fmtSize(f.size)}` : ""}</span></span>
              <ConfirmButton label="Wiederherstellen" confirmLabel={`Stand aus KW ${f.week} laden?`} className={btnGhost} onConfirm={() => restore(f)} />
            </li>
          ))}
        </ul>
      )}
      {list && !list.length && !err && <p className="mt-2 text-xs text-slate-500">Noch keine Sicherung in der Cloud.</p>}
      {msg && <p role="status" className="mt-2 text-xs text-emerald-300">{msg}</p>}
      {err && <p role="alert" className="mt-2 text-xs text-rose-400">{err}</p>}
    </div>
  );
}

/* Push-Erinnerungen für Abgaben, Prüfungen und Anmeldeschlüsse (unter Benachrichtigungen; braucht Cloud-Sync) */
export function Reminders({ cloud, settings, patchSettings }) {
  const on = cloud.pushDevice === "on";
  return (
    <Card title="Erinnerungen">
      <p className="text-xs text-slate-400" data-set="push">
        Push-Nachricht am Vorabend und am Morgen einer Abgabe, eine Woche und einen Tag vor Prüfungen sowie vor Anmeldeschlüssen. Dafür liegen Titel und Datum dieser Fristen unverschlüsselt bei Supabase; alles andere bleibt verschlüsselt.
      </p>
      {cloud.pushBlocker && !on ? (
        <p className="notice notice-warn mt-3">{cloud.pushBlocker}</p>
      ) : (
        <div className="mt-3 flex flex-wrap gap-2">
          {on ? (
            <>
              <button className="btn btn-ghost" onClick={cloud.testPush} disabled={cloud.busy}>Testnachricht schicken</button>
              <button className="btn btn-ghost" onClick={cloud.disablePush} disabled={cloud.busy}>Auf diesem Gerät ausschalten</button>
            </>
          ) : (
            <button className="btn btn-primary" onClick={cloud.enablePush} disabled={cloud.busy}>{cloud.busy ? "Richtet ein …" : "Erinnerungen einschalten"}</button>
          )}
        </div>
      )}
      {on && patchSettings && (
        <div className="mt-3 space-y-2 text-sm">
          <div className="flex flex-wrap items-center gap-2" data-set="pushMorning">
            <label className="flex items-center gap-2"><input type="checkbox" checked={settings.pushMorning !== false} onChange={(e) => patchSettings({ pushMorning: e.target.checked })} /> Morgens der Tag im Überblick um</label>
            <label className="sr-only" htmlFor="push-morning">Uhrzeit für den Tagesüberblick</label>
            <input id="push-morning" type="time" className="field py-1 text-sm" value={settings.morningTime || "07:00"} disabled={settings.pushMorning === false} onChange={(e) => e.target.value && patchSettings({ morningTime: e.target.value })} />
          </div>
          <label className="flex items-center gap-2" data-set="pushReviews"><input type="checkbox" checked={settings.pushReviews !== false} onChange={(e) => patchSettings({ pushReviews: e.target.checked })} /> Um 20 Uhr, wenn heutige Termine noch nicht nachbereitet sind</label>
          <label className="flex items-center gap-2" data-set="pushAttended"><input type="checkbox" checked={settings.pushAttended !== false} onChange={(e) => patchSettings({ pushAttended: e.target.checked })} /> Um 19 Uhr „Heute besucht?“ mit Knopf „Alle besucht“, wenn heutige Termine noch nicht abgehakt sind</label>
          <label className="flex items-center gap-2" data-set="pushChanges"><input type="checkbox" checked={settings.pushChanges !== false} onChange={(e) => patchSettings({ pushChanges: e.target.checked })} /> Wenn sich im Stundenplan-Abo ein Raum oder eine Uhrzeit ändert oder etwas ausfällt</label>
          <label className="flex items-center gap-2" data-set="pushBlocks"><input type="checkbox" checked={settings.pushBlocks !== false} onChange={(e) => patchSettings({ pushBlocks: e.target.checked })} /> 10 Minuten vor einem geplanten Lernblock</label>
          <label className="flex items-center gap-2" data-set="pushWeekly"><input type="checkbox" checked={settings.pushWeekly !== false} onChange={(e) => patchSettings({ pushWeekly: e.target.checked })} /> Sonntags um 18 Uhr Rückblick (Lernzeit, fällige Karten) und Ausblick auf die nächste Woche</label>
        </div>
      )}
      {cloud.error && <p role="alert" className="mt-2 text-xs text-rose-400">{cloud.error}</p>}
      {cloud.pushStep && <p role="status" className="mt-2 text-xs text-slate-400">{cloud.pushStep}</p>}
      {cloud.pushMsg && <p role="status" className="mt-2 text-xs text-emerald-300">{cloud.pushMsg}</p>}
    </Card>
  );
}

/* Fristen als Kalender-Abo für Google/Apple-Kalender (unter Kalender & Abos; braucht Cloud-Sync) */
export function CalendarFeed({ cloud, settings, patchSettings }) {
  const token = settings.calToken || "";
  const [msg, setMsg] = useState(""), [err, setErr] = useState("");
  const url = token ? cloud.calUrl(token) : "";
  const create = async () => {
    setErr(""); setMsg("");
    const raw = crypto.getRandomValues(new Uint8Array(24));
    const t = btoa(String.fromCharCode(...raw)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    try { await cloud.setCalToken(t); patchSettings({ calToken: t }); setMsg("Link erstellt. In deinem Kalender als Abo hinzufügen."); }
    catch (e) { setErr(/cal_token|column/i.test(e.message || "") ? "Bitte zuerst supabase/kalender.sql im SQL-Editor ausführen." : e.message); }
  };
  const revoke = async () => {
    setErr(""); setMsg("");
    try { await cloud.setCalToken(null); patchSettings({ calToken: "" }); setMsg("Link widerrufen. Kalender-Abos damit bekommen keine Daten mehr."); }
    catch (e) { setErr(e.message); }
  };
  const copy = async () => { try { await navigator.clipboard.writeText(url); setMsg("Link kopiert."); } catch { setMsg("Bitte den Link markieren und kopieren."); } };
  return (
    <Card title="Fristen im Handy-Kalender">
      <p className="text-xs text-slate-400">Abgaben, Prüfungen und Anmeldeschlüsse als Kalender-Abo für Google Kalender, Apple Kalender oder Outlook. Es nutzt dieselben unverschlüsselten Fristen wie die Erinnerungen. Wer den Link kennt, sieht sie; du kannst ihn jederzeit widerrufen.</p>
      {!token ? (
        <button className="btn btn-ghost mt-3" onClick={create} disabled={cloud.busy}>Kalender-Link erstellen</button>
      ) : (
        <>
          <input readOnly aria-label="Link für dein Kalender-Abo" className="field mt-3 w-full text-xs" value={url} onFocus={(e) => e.target.select()} />
          <div className="mt-2 flex flex-wrap gap-2">
            <button className="btn btn-ghost" onClick={copy}>Kopieren</button>
            <a className="btn btn-ghost" href={url.replace(/^https:/, "webcal:")}>In Kalender öffnen</a>
            <button className="btn btn-ghost" onClick={revoke} disabled={cloud.busy}>Widerrufen</button>
          </div>
          <p className="mt-2 text-[11px] text-slate-500">Google Kalender: „Weitere Kalender“ → „Per URL“ → Link einfügen. Aktualisiert sich je nach Kalender alle paar Stunden.</p>
        </>
      )}
      {err && <p role="alert" className="mt-2 text-xs text-rose-400">{err}</p>}
      {msg && <p role="status" className="mt-2 text-xs text-emerald-300">{msg}</p>}
    </Card>
  );
}
