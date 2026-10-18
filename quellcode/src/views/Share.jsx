/* Karteikarten mit Kommilitonen teilen: Link erzeugen (Ende-zu-Ende verschlüsselt) und geteilte Stapel importieren */
import React, { useEffect, useState } from "react";
import { getCloud } from "../cloud/index.js";
import { deckFrom, importDeck, openDeck, sealDeck, shareUrl } from "../lib/share.js";
import { PALETTE } from "../lib/constants.js";
import { iso, uid } from "../lib/util.js";
import { Card, Modal } from "../ui/primitives.jsx";
import { Markdown } from "../ui/markdown.jsx";

const baseUrl = () => window.location.origin + window.location.pathname;

/** Karte in „Karteikarten“: aktuellen Stapel (Modul + Tag-Filter) teilen */
export function ShareDeck({ db, moduleId, cards, tag }) {
  const { data } = db, m = db.mod(moduleId);
  const [busy, setBusy] = useState(false), [msg, setMsg] = useState(""), [link, setLink] = useState("");
  const shares = (data.settings.shares || []).filter((s) => s.moduleId === moduleId);
  const signedIn = !!db.cloud?.user;
  const title = `${m?.name || "Karteikarten"}${tag ? ` #${tag}` : ""}`;

  const create = async () => {
    setBusy(true); setMsg(""); setLink("");
    try {
      const { token, key, blob } = await sealDeck(deckFrom(cards, title, data.settings.name));
      await getCloud().shares.create(token, blob);
      const url = shareUrl(baseUrl(), token, key);
      setLink(url);
      db.patchSettings({ shares: [...(data.settings.shares || []), { token, moduleId, title, n: cards.length, created: iso() }] });
      if (navigator.share) navigator.share({ title: `StudyOS: ${title}`, text: `${cards.length} Karteikarten: ${title}`, url }).catch(() => {});
      else if (navigator.clipboard) { await navigator.clipboard.writeText(url).catch(() => {}); setMsg("Link kopiert."); }
    } catch (e) { setMsg(e.message || "Teilen fehlgeschlagen."); }
    setBusy(false);
  };
  const revoke = async (token) => {
    try { await getCloud().shares.remove(token); } catch (e) { setMsg(e.message); return; }
    db.patchSettings({ shares: (data.settings.shares || []).filter((s) => s.token !== token) });
    if (link.includes(token)) setLink("");
  };

  return (
    <Card title="Mit Kommilitonen teilen">
      <p className="text-xs text-slate-400">Erzeugt einen Link zu diesen {cards.length} Karten (ohne deinen Lernstand). Der Inhalt wird vorher auf deinem Gerät verschlüsselt; der Schlüssel steckt nur im Link. Zum Öffnen braucht niemand ein Konto.</p>
      {!signedIn ? <p className="mt-2 text-[11px] text-slate-500">Zum Teilen unter „Daten“ beim Cloud-Sync anmelden.</p> : (
        <button className="btn btn-primary mt-2" disabled={busy || !cards.length} onClick={create}>{busy ? "Verschlüsselt …" : `Link erstellen (${cards.length})`}</button>
      )}
      {link && <input readOnly aria-label="Link zum Stapel" className="field mt-2 w-full text-xs" value={link} onFocus={(e) => e.target.select()} />}
      {msg && <p role="status" className="mt-2 text-xs text-slate-300">{msg}</p>}
      {shares.length > 0 && (
        <ul className="mt-3 space-y-1 text-xs">
          {shares.map((s) => (
            <li key={s.token} className="flex items-center gap-2">
              <span className="min-w-0 flex-1 truncate text-slate-400">{s.title}, {s.n} Karten, {s.created}</span>
              {signedIn && <button className="link-btn" onClick={() => revoke(s.token)}>Link löschen</button>}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/** Dialog beim Öffnen eines geteilten Links */
export function ShareImport({ db, token, keyStr, onClose }) {
  const { data } = db;
  const [deck, setDeck] = useState(null), [err, setErr] = useState("");
  const [target, setTarget] = useState("");
  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const cloud = getCloud();
        if (!cloud) throw new Error("Diese StudyOS-Version hat keine Cloud-Anbindung.");
        if (!keyStr) throw new Error("Im Link fehlt der Schlüssel (der Teil nach #k=). Bitte den vollständigen Link öffnen.");
        const d = await openDeck(await cloud.shares.get(token), keyStr);
        if (!live) return;
        setDeck(d);
        const match = data.modules.find((m) => d.title.toLowerCase().startsWith(m.name.toLowerCase()));
        setTarget(match ? match.id : "__new");
      } catch (e) { if (live) setErr(e.message || "Konnte den Stapel nicht laden."); }
    })();
    return () => { live = false; };
  }, [token, keyStr]);

  const run = () => {
    const today = iso();
    let res;
    db.withUndo(`Karten aus „${deck.title}“ importiert.`, (d0) => {
      let d = d0, moduleId = target;
      if (target === "__new") {
        moduleId = uid();
        d = { ...d, modules: [...d.modules, { id: moduleId, name: deck.title.replace(/\s#\S+$/, ""), code: "", ects: 0, semester: 1, status: "belegt", color: PALETTE[d.modules.length % PALETTE.length], grade: "", bonusPct: "" }] };
      }
      res = importDeck(d, deck, moduleId, today, uid);
      return res.data;
    });
    if (res?.skipped) db.toast(`${res.added} Karten übernommen, ${res.skipped} waren schon da.`);
    onClose();
  };

  return (
    <Modal title="Geteilte Karteikarten" onClose={onClose}>
      {err ? <p className="notice notice-warn">{err}</p> : !deck ? <p className="text-sm text-slate-400" role="status">Lädt und entschlüsselt …</p> : (
        <>
          <p className="text-sm"><strong>{deck.title}</strong>, {deck.cards.length} Karten{deck.by ? ` von ${deck.by}` : ""}</p>
          <ul className="mt-3 space-y-2">
            {deck.cards.slice(0, 3).map((c, i) => (
              <li key={i} className="surface text-sm"><Markdown text={c.front} />{c.back && <div className="mt-1 text-slate-400"><Markdown text={c.back} /></div>}</li>
            ))}
          </ul>
          {deck.cards.length > 3 && <p className="mt-1 text-xs text-slate-500">… und {deck.cards.length - 3} weitere</p>}
          <label className="mt-4 block text-sm" htmlFor="share-target">In welches Modul?</label>
          <select id="share-target" className="field mt-1 w-full text-sm" value={target} onChange={(e) => setTarget(e.target.value)}>
            <option value="__new">Neues Modul „{deck.title.replace(/\s#\S+$/, "")}“</option>
            {data.modules.filter((m) => !m.archived).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
          <div className="mt-4 flex flex-wrap gap-2">
            <button className="btn btn-primary" onClick={run}>{deck.cards.length} Karten übernehmen</button>
            <button className="btn btn-ghost" onClick={onClose}>Abbrechen</button>
          </div>
        </>
      )}
    </Modal>
  );
}
