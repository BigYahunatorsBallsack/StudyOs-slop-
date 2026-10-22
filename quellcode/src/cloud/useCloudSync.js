/* Cloud-Sync in der App: Anmeldung, Passphrase und automatisches Synchronisieren.

   Phasen:  off        kein Cloud-Projekt konfiguriert
            loading    Anmeldestatus wird geprüft
            signed-out nicht angemeldet
            code-sent  Code per Mail verschickt, wartet auf Eingabe
            need-key   angemeldet, Passphrase fehlt auf diesem Gerät
            ready      synchronisiert automatisch

   Synchronisiert wird beim Start, beim Zurückkehren in die App, wenn wieder Netz da ist,
   ein paar Sekunden nach jeder Änderung und alle 5 Minuten (mit `fastPoll`, solange ein Timer-Durchgang läuft,
   alle 20 Sekunden, damit Pausieren auf einem anderen Gerät bald ankommt). */
import { useCallback, useEffect, useRef, useState } from "react";
import { fingerprint, syncOnce, checkKey } from "../lib/cloudsync.js";
import { deriveSyncKey, KeyMismatchError, newSalt } from "../lib/crypto.js";
import { clearKeys, loadKey, saveKey } from "../lib/keystore.js";
import { getCloud } from "./index.js";
import { openBytes, sealBytes } from "../lib/files.js";
import { deadlinesFromData, deadlinesKey, keyBytes, pushBlocker } from "../lib/push.js";
import { backupName, backupsToPrune, decodeBackup, encodeBackup, parseBackupName } from "../lib/backup.js";
import { iso } from "../lib/util.js";
import { decodeStamps, encodeStamps } from "../lib/sync.js";

const DEBOUNCE_MS = 3000;

/* Bricht ab, wenn ein Schritt nicht innerhalb von `ms` antwortet, mit verständlicher Meldung */
function withTimeout(promise, ms, message) {
  let t;
  return Promise.race([promise, new Promise((_, reject) => { t = setTimeout(() => reject(new Error(message)), ms); })]).finally(() => clearTimeout(t));
}
const INTERVAL_MS = 5 * 60 * 1000;
const BACKUP_RETRY_MS = 60 * 60 * 1000; /* nach einer fehlgeschlagenen Wochensicherung frühestens dann wieder versuchen */
const FAST_MS = 20 * 1000;
const SETTLE_MS = 8000; /* so lange wartet der Timer höchstens auf den ersten Sync nach dem Start */
const LAST_KEY = "studyos-cloud-last";
const BACKUP_KEY = "studyos-cloud-backup"; /* Name der letzten Cloud-Sicherung dieses Geräts */
const STAMPS_KEY = "studyos-cloud-stamps"; /* Zeitstempel nach dem letzten Sync, übersteht das Neuladen */

const loadStamps = (uid) => { try { return decodeStamps(localStorage.getItem(STAMPS_KEY), uid); } catch { return null; } };
/* Passt der Text nicht mehr in den Speicher, den alten entfernen: veraltete Zeitstempel meldeten sonst nach dem Neuladen
   Konflikte, die keine sind (ohne Zeitstempel meldet der erste Sync einfach nichts) */
const saveStamps = (map, uid) => { try { localStorage.setItem(STAMPS_KEY, encodeStamps(map, uid)); } catch { try { localStorage.removeItem(STAMPS_KEY); } catch {} } };
const dropStamps = () => { try { localStorage.removeItem(STAMPS_KEY); } catch {} };

export function useCloudSync({ ready, enabled, data, getLocal, applyLocal, onPushEnabled, onConflict, fastPoll = false }) {
  const cloud = getCloud();
  const batchRef = useRef(null); /* kann die Funktion Sammelabfragen? null = noch unbekannt */
  const [phase, setPhase] = useState(cloud ? "loading" : "off");
  const [user, setUser] = useState(null);
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState("idle"); /* idle | syncing | error | offline */
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [remoteExists, setRemoteExists] = useState(null);
  const [lastSync, setLastSync] = useState(() => { try { return localStorage.getItem(LAST_KEY); } catch { return null; } });
  const keyRef = useRef(null);
  const running = useRef(false), again = useRef(false), lastFp = useRef(null);
  const enabledRef = useRef(enabled); enabledRef.current = enabled;
  const syncedRef = useRef(null); /* Zeitstempel nach dem letzten erfolgreichen Sync, für den Konflikthinweis */
  const onConflictRef = useRef(onConflict); onConflictRef.current = onConflict;
  const uidRef = useRef(null);
  /* Kennung des Cloud-Stands nach dem letzten Lauf (für den schnellen Vergleich ohne Herunterladen) und eine Generation,
     die bei Abmelden, Löschen, neuer Passphrase oder anderem Nutzer weiterzählt: ein laufender Sync schreibt dann nicht mehr */
  const tagRef = useRef(null), genRef = useRef(0);
  const reset = () => { genRef.current++; tagRef.current = null; lastFp.current = null; };
  const [settled, setSettled] = useState(false); /* erster Sync seit dem Start versucht (egal mit welchem Ergebnis) */

  /* Anmeldestatus, gespeicherten Schlüssel und Zeitstempel des letzten Syncs laden */
  const enterUser = useCallback(async (u) => {
    setUser(u);
    if ((u ? u.id : null) !== uidRef.current) reset();
    uidRef.current = u ? u.id : null;
    syncedRef.current = u ? loadStamps(u.id) : null;
    if (!u) { keyRef.current = null; setPhase((p) => (p === "code-sent" ? p : "signed-out")); return; }
    const k = await loadKey(u.id);
    if (k) { keyRef.current = k; setPhase("ready"); return; }
    keyRef.current = null;
    setPhase("need-key");
    try { setRemoteExists(!!(await cloud.remote.get())); setError(""); } catch (e) { setError(e.message); }
  }, [cloud]);

  useEffect(() => {
    if (!cloud) return;
    let alive = true;
    /* Anmeldung erst nach dem ersten Bild prüfen: lädt bei Bedarf Supabase (ca. 120 KB) und soll „Heute“ nicht aufhalten
       (im Hintergrund gibt es kein Bild, dann spätestens nach 500 ms) */
    let started = false;
    const start = () => { if (!alive || started) return; started = true; cloud.getUser().then((u) => alive && enterUser(u)).catch(() => alive && setPhase("signed-out")); };
    if (typeof requestAnimationFrame === "function") requestAnimationFrame(() => setTimeout(start, 0));
    const late = setTimeout(start, 500);
    const off = cloud.onAuthChange((u) => { if (alive) enterUser(u); });
    return () => { alive = false; clearTimeout(late); off && off(); };
  }, [cloud, enterUser]);

  /* Wöchentliche Cloud-Sicherung: einmal pro Kalenderwoche nach einem erfolgreichen Sync, alte löschen */
  const [backupInfo, setBackupInfo] = useState(() => { try { return localStorage.getItem(BACKUP_KEY); } catch { return null; } });
  const uploadBackup = useCallback(async () => {
    if (!cloud || !keyRef.current || !cloud.files.list) throw new Error("Cloud-Sync ist nicht entsperrt.");
    const name = backupName(iso());
    await cloud.files.put(name, await sealBytes(keyRef.current.key, encodeBackup(getLocal())));
    try { localStorage.setItem(BACKUP_KEY, name); } catch {}
    setBackupInfo(name);
    const old = backupsToPrune((await cloud.files.list("sicherung-")).map((f) => f.id));
    await Promise.all(old.map((id) => cloud.files.remove(id)));
    return name;
  }, [cloud, getLocal]);
  const backupFailRef = useRef(0);
  const weeklyBackup = useCallback(async () => {
    if (getLocal().settings?.cloudBackup === false) return;
    let last = null; try { last = localStorage.getItem(BACKUP_KEY); } catch {}
    if (last === backupName(iso())) return;
    /* nicht nach jedem Sync (bei laufendem Timer alle 20 s) erneut alles verschlüsseln und hochladen, wenn es gerade scheiterte */
    if (Date.now() - backupFailRef.current < BACKUP_RETRY_MS) return;
    try { await uploadBackup(); backupFailRef.current = 0; } catch (e) { backupFailRef.current = Date.now(); throw e; }
  }, [getLocal, uploadBackup]);

  /* Ein Synchronisationslauf; gleichzeitige Anfragen werden zu einem Folgelauf zusammengefasst */
  const run = useCallback(async (force = false) => {
    if (!cloud || !keyRef.current || !enabledRef.current) return;
    if (running.current) { again.current = true; return; }
    if (typeof navigator !== "undefined" && navigator.onLine === false) { setStatus("offline"); setSettled(true); return; }
    running.current = true;
    setStatus("syncing");
    const gen = genRef.current;
    try {
      const known = !force && tagRef.current && lastFp.current ? { tag: tagRef.current, fingerprint: lastFp.current } : null;
      const res = await syncOnce({ remote: cloud.remote, key: keyRef.current, getLocal, applyLocal, synced: syncedRef.current, known, canWrite: () => genRef.current === gen });
      if (genRef.current !== gen) { setStatus("idle"); return; } /* inzwischen abgemeldet, gelöscht oder neue Passphrase */
      lastFp.current = res.fingerprint; syncedRef.current = res.stamps; tagRef.current = res.tag || null;
      if (uidRef.current && !res.skipped) saveStamps(res.stamps, uidRef.current);
      if (res.conflicts.length && onConflictRef.current) onConflictRef.current(res.conflicts);
      const at = new Date().toISOString();
      setLastSync(at); try { localStorage.setItem(LAST_KEY, at); } catch {}
      setStatus("idle"); setError("");
      weeklyBackup().catch(() => {}); /* stört den Sync nicht, Fehler zeigt die Sicherungsliste */
    } catch (e) {
      if (genRef.current !== gen) { setStatus("idle"); return; }
      if (e instanceof KeyMismatchError) {
        reset(); keyRef.current = null; await clearKeys(); setRemoteExists(true); setPhase("need-key");
      }
      setStatus("error"); setError(e.message || String(e));
    } finally {
      running.current = false;
      setSettled(true);
      if (again.current) { again.current = false; setTimeout(() => run(), 0); }
    }
  }, [cloud, getLocal, applyLocal, weeklyBackup]);

  const active = phase === "ready" && ready && enabled;

  /* Auslöser: Start, Rückkehr in die App, wieder online, regelmäßig */
  useEffect(() => {
    if (!active) return;
    run();
    const onVis = () => { if (document.visibilityState === "visible") { setSettled(false); run(); } else if (fingerprint(getLocal()) !== lastFp.current) run(); };
    const onOnline = () => run();
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("online", onOnline);
    const id = setInterval(() => run(), INTERVAL_MS);
    return () => { document.removeEventListener("visibilitychange", onVis); window.removeEventListener("online", onOnline); clearInterval(id); };
  }, [active, run, getLocal]);

  useEffect(() => {
    if (!active || settled) return;
    const id = setTimeout(() => setSettled(true), SETTLE_MS);
    return () => clearTimeout(id);
  }, [active, settled]);
  useEffect(() => {
    if (!active || !fastPoll) return;
    const id = setInterval(() => { if (document.visibilityState === "visible") run(); }, FAST_MS);
    return () => clearInterval(id);
  }, [active, fastPoll, run]);

  /* Auslöser: lokale Änderung (entprellt). Ergebnisse eines Syncs selbst lösen keinen weiteren aus. */
  useEffect(() => {
    if (!active || fingerprint(data) === lastFp.current) return;
    const id = setTimeout(() => run(), DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [active, data, run]);

  /* ---- Erinnerungen (Push) ---- */
  const [pushDevice, setPushDevice] = useState("unknown"); /* on | off | unknown */
  const [pushMsg, setPushMsg] = useState("");
  const [pushStep, setPushStep] = useState("");
  const tz = (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/Berlin"; } catch { return "Europe/Berlin"; } })();
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) { setPushDevice("off"); return; }
    navigator.serviceWorker.getRegistration().then((reg) => reg && reg.pushManager ? reg.pushManager.getSubscription() : null)
      .then((sub) => setPushDevice(sub ? "on" : "off")).catch(() => setPushDevice("off"));
  }, []);
  const uploadDeadlines = useCallback(async (force) => {
    const list = deadlinesFromData(getLocal());
    const key = deadlinesKey(list);
    let last = null; try { last = localStorage.getItem("studyos-push-deadlines"); } catch {}
    if (!force && key === last) return;
    await cloud.push.saveDeadlines(list, tz);
    try { localStorage.setItem("studyos-push-deadlines", key); } catch {}
  }, [cloud, getLocal, tz]);
  /* Fristen hochladen, sobald sie sich ändern (nur wenn Erinnerungen irgendwo eingeschaltet wurden) */
  const pushWanted = !!data?.settings?.push || !!data?.settings?.calToken;
  useEffect(() => {
    if (!active || !pushWanted) return;
    const id = setTimeout(() => { uploadDeadlines(false).catch(() => {}); }, 2500);
    return () => clearTimeout(id);
  }, [active, pushWanted, data, uploadDeadlines]);

  const wrap = (fn) => async (...args) => {
    setBusy(true); setError("");
    try { return await fn(...args); }
    catch (e) { setError(e.message || String(e)); return false; }
    finally { setBusy(false); }
  };

  return {
    available: !!cloud, phase, user, email, status, error, busy, lastSync, remoteExists, settled,
    sendCode: wrap(async (addr) => {
      const clean = String(addr || "").trim();
      if (!/^\S+@\S+\.\S+$/.test(clean)) throw new Error("Bitte eine gültige E-Mail-Adresse eingeben.");
      await cloud.sendCode(clean);
      setEmail(clean); setPhase("code-sent");
      return true;
    }),
    verifyCode: wrap(async (code) => {
      const clean = String(code || "").replace(/\s+/g, "");
      if (!/^\d{6,10}$/.test(clean)) throw new Error("Der Code besteht aus Ziffern (meist 6).");
      await cloud.verifyCode(email, clean);
      await enterUser(await cloud.getUser());
      return true;
    }),
    backToEmail: () => { setPhase("signed-out"); setError(""); },
    setPassphrase: wrap(async (pass, repeat) => {
      const row = await cloud.remote.get();
      let k;
      if (row) {
        k = await deriveSyncKey(pass, row.payload.salt, Number(row.payload.iterations));
        try { await checkKey(row, k); } catch { throw new Error("Falsche Passphrase. Es ist die, die du auf deinem ersten Gerät festgelegt hast."); }
      } else {
        if (String(pass || "").length < 8) throw new Error("Die Passphrase braucht mindestens 8 Zeichen.");
        if (pass !== repeat) throw new Error("Die Passphrasen stimmen nicht überein.");
        k = await deriveSyncKey(pass, newSalt());
      }
      await saveKey(user.id, k);
      reset(); keyRef.current = k;
      setPhase("ready");
      return true;
    }),
    syncNow: () => run(true), /* von Hand: immer ganz abgleichen, ohne den schnellen Vergleich */
    pushDevice, pushMsg,
    /* erst beim Lesen (nur die Cloud-Ansicht braucht es): matchMedia bei jedem App-Render kostete spürbar Zeit */
    get pushBlocker() { return cloud ? pushBlocker() : null; },
    pushStep,
    enablePush: wrap(async () => {
      setPushMsg("");
      const blocker = pushBlocker();
      if (blocker) throw new Error(blocker);
      try {
        setPushStep("Frage nach Erlaubnis für Benachrichtigungen …");
        const perm = await withTimeout(Notification.requestPermission(), 60000, "Keine Antwort auf die Frage nach Benachrichtigungen. Erlaube sie in den Website-Einstellungen des Browsers und versuch es erneut.");
        if (perm !== "granted") throw new Error("Benachrichtigungen sind nicht erlaubt. Erlaube sie in den Website-Einstellungen des Browsers (Schloss-Symbol neben der Adresse) bzw. in den Systemeinstellungen.");
        setPushStep("Prüfe den Offline-Dienst …");
        let reg = await navigator.serviceWorker.getRegistration();
        if (!reg) reg = await withTimeout(navigator.serviceWorker.register("./sw.js", { scope: "./" }), 10000, "Der Offline-Dienst ließ sich nicht starten.");
        reg = await withTimeout(navigator.serviceWorker.ready, 10000, "Der Offline-Dienst (Service Worker) ist noch nicht aktiv. Schließ die App bzw. den Tab ganz, öffne sie neu und versuch es erneut.");
        setPushStep("Hole den Schlüssel von Supabase …");
        const publicKey = await withTimeout(cloud.push.vapidKey(), 20000, "Die Supabase-Funktion „studyos“ antwortet nicht. Prüfe, ob sie deployt ist.");
        if (!/^[A-Za-z0-9_-]{80,}$/.test(String(publicKey || ""))) throw new Error("Die Supabase-Funktion hat keinen gültigen Schlüssel geliefert. Ist das SQL aus supabase/schema.sql ausgeführt?");
        setPushStep("Melde das Gerät beim Push-Dienst an …");
        let sub = await reg.pushManager.getSubscription();
        if (sub && sub.options && sub.options.applicationServerKey) {
          const cur = new Uint8Array(sub.options.applicationServerKey), want = keyBytes(publicKey);
          if (cur.length !== want.length || cur.some((b, k) => b !== want[k])) { await sub.unsubscribe().catch(() => {}); sub = null; }
        }
        if (!sub) {
          sub = await withTimeout(reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) }), 20000,
            "Der Push-Dienst des Browsers antwortet nicht. In Brave: Einstellungen → Datenschutz und Sicherheit → „Google-Dienste für Push-Nachrichten verwenden“ einschalten. In anderen Browsern: Datensparmodus/VPN/Werbeblocker testweise aus.");
        }
        setPushStep("Speichere bei Supabase …");
        await withTimeout(cloud.push.saveSubscription(sub.toJSON(), tz), 20000, "Supabase antwortet nicht beim Speichern.");
        onPushEnabled && onPushEnabled();
        await withTimeout(uploadDeadlines(true), 20000, "Supabase antwortet nicht beim Hochladen der Fristen.");
        setPushDevice("on");
        setPushMsg("Erinnerungen sind auf diesem Gerät eingeschaltet.");
        return true;
      } catch (e) {
        if (/push service|Registration failed|AbortError/i.test(String(e && (e.message || e.name)))) {
          throw new Error("Der Browser konnte sich nicht beim Push-Dienst anmelden (" + (e.message || e.name) + "). In Brave: Einstellungen → Datenschutz und Sicherheit → „Google-Dienste für Push-Nachrichten verwenden“ einschalten.");
        }
        throw e;
      } finally { setPushStep(""); }
    }),
    disablePush: wrap(async () => {
      setPushMsg("");
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = reg && reg.pushManager ? await reg.pushManager.getSubscription() : null;
      if (sub) { await cloud.push.removeSubscription(sub.endpoint); await sub.unsubscribe().catch(() => {}); }
      setPushDevice("off");
      setPushMsg("Erinnerungen sind auf diesem Gerät ausgeschaltet.");
      return true;
    }),
    testPush: wrap(async () => {
      setPushMsg("");
      await uploadDeadlines(true);
      const r = await cloud.push.test();
      setPushMsg(r.sent ? `Testnachricht an ${r.sent} ${r.sent === 1 ? "Gerät" : "Geräte"} geschickt.` : "Die Testnachricht konnte nicht zugestellt werden.");
      return true;
    }),
    fetchIcs: (url) => cloud.fetchIcs(url),
    mvg: (body) => cloud.mvg(body),
    /* Mehrere MVG-Abfragen in einem Aufruf; ältere Funktionen kennen das nicht, dann einzeln (parallel) */
    mvgMany: async (list) => {
      if (batchRef.current !== false) {
        try {
          const r = await cloud.mvg({ batch: list });
          if (Array.isArray(r) && r.length === list.length && r.every((x) => x && typeof x === "object" && ("data" in x || "error" in x))) {
            batchRef.current = true;
            return r.map((x) => { if (x.error) throw new Error(x.error); return x.data; });
          }
        } catch (e) { if (batchRef.current === true || !/Unbekannte Abfrage/.test(String(e && e.message))) throw e; }
        batchRef.current = false;
      }
      return Promise.all(list.map((b) => cloud.mvg(b)));
    },
    drive: (body) => cloud.drive(body),
    /* Anhänge verschlüsselt hoch- bzw. herunterladen; ohne entsperrten Sync-Schlüssel nicht möglich */
    canFiles: () => !!(cloud && keyRef.current && phase === "ready"),
    uploadFile: async (id, bytes) => {
      if (!keyRef.current) throw new Error("Cloud-Sync ist nicht entsperrt.");
      await cloud.files.put(id, await sealBytes(keyRef.current.key, bytes));
    },
    downloadFile: async (id) => {
      if (!keyRef.current) throw new Error("Cloud-Sync ist nicht entsperrt.");
      return openBytes(keyRef.current.key, await cloud.files.get(id));
    },
    removeFile: (id) => (cloud ? cloud.files.remove(id) : Promise.resolve()),
    /* Cloud-Sicherungen: Liste (neueste zuerst), jetzt sichern, Inhalt laden */
    backupInfo,
    listBackups: async () => ((await cloud.files.list("sicherung-")) || []).map((f) => ({ ...f, ...parseBackupName(f.id) })).filter((f) => f.week).sort((a, b) => b.id.localeCompare(a.id)),
    backupNow: () => uploadBackup(),
    loadBackup: async (id) => {
      if (!keyRef.current) throw new Error("Cloud-Sync ist nicht entsperrt.");
      return decodeBackup(await openBytes(keyRef.current.key, await cloud.files.get(id)));
    },
    /* Kalender-Abo der Fristen: Token auf dem Server setzen (null = widerrufen) */
    setCalToken: async (token) => {
      setBusy(true);
      try {
        await withTimeout(cloud.push.setCalToken(token), 20000, "Supabase antwortet nicht.");
        if (token) await withTimeout(uploadDeadlines(true), 20000, "Supabase antwortet nicht beim Hochladen der Fristen.");
      } finally { setBusy(false); }
      return true;
    },
    calUrl: (token) => cloud.calUrl(token),
    signOut: wrap(async () => {
      reset(); keyRef.current = null;
      await clearKeys(); await cloud.signOut();
      setUser(null); setPhase("signed-out"); setStatus("idle");
      try { localStorage.removeItem(LAST_KEY); } catch {}
      syncedRef.current = null; dropStamps();
      setLastSync(null);
      return true;
    }),
    deleteCloud: wrap(async () => {
      /* zuerst: ein gerade laufender Sync darf die Daten danach nicht wieder hochladen */
      const k = keyRef.current;
      reset(); keyRef.current = null;
      try { await cloud.remote.remove(); } catch (e) { keyRef.current = k; throw e; }
      syncedRef.current = null; dropStamps();
      await clearKeys();
      setRemoteExists(false); setPhase("need-key"); setStatus("idle");
      return true;
    }),
  };
}
