/* Einstellungen → Aufräumen: Doppel und Leeres finden, gruppenweise löschen (über den Papierkorb, mit Rückgängig) */
import React, { useEffect, useMemo, useState } from "react";
import { findCleanup, orphanFiles, removeDuplicateCards, removeDuplicateSessions, removeEmptyNotes } from "../lib/cleanup.js";
import { fmtSize, getLocal, listLocal, removeLocal } from "../lib/files.js";
import { fmtShort } from "../lib/util.js";
import { Card, ConfirmButton } from "../ui/primitives.jsx";
import { btnGhost } from "../ui/styles.js";

const PREVIEW = 3;
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

function Group({ title, lines, action, note }) {
  const more = lines.length - PREVIEW;
  return (
    <li className="cleanup-group">
      <div className="flex items-center gap-2">
        <p className="min-w-0 flex-1 text-sm font-medium">{title}</p>
        {action}
      </div>
      <ul className="cleanup-preview">
        {lines.slice(0, PREVIEW).map((l, i) => <li key={i} className="truncate">{l}</li>)}
        {more > 0 && <li>+ {more} weitere</li>}
        {note && <li>{note}</li>}
      </ul>
    </li>
  );
}

export function CleanupCard({ db }) {
  const { data } = db;
  const found = useMemo(() => findCleanup(data), [data.sessions, data.cards, data.notes, data.logs]);
  const [orphans, setOrphans] = useState(null);
  const [scan, setScan] = useState(0);
  const mod = useMemo(() => new Map(data.modules.map((m) => [m.id, m.name])), [data.modules]);

  /* lokal gespeicherte Dateien ohne Eintrag (samt Größe) */
  useEffect(() => {
    let live = true;
    (async () => {
      const ids = orphanFiles(data, await listLocal());
      const list = [];
      for (const id of ids) { const b = await getLocal(id); list.push({ id, size: b?.size || 0, type: b?.type || "" }); }
      if (live) setOrphans(list);
    })();
    return () => { live = false; };
  }, [scan, data.notes, data.homework, data.cards, data.meta?.trash]);

  const del = (label, fn, name) => db.withTrash(label, fn, name);
  const s = found.sessions, c = found.cards, n = found.notes;
  const orphanSize = (orphans || []).reduce((t, f) => t + f.size, 0);
  const nothing = !s.count && !c.count && !n.count && !orphans?.length;

  return (
    <Card title="Aufräumen">
      {nothing ? <p className="text-xs text-slate-500">Nichts gefunden: keine Doppel, leeren Notizen oder verwaisten Anhänge.</p> : (
        <ul className="space-y-2">
          {s.count > 0 && (
            <Group title={`Doppelte Termine (${s.count})`}
              lines={s.groups.map((g) => `${fmtShort(g.keep.date)} ${g.keep.start} · ${g.keep.type || "Termin"}${mod.get(g.keep.moduleId) ? ` · ${mod.get(g.keep.moduleId)}` : ""} (${g.remove.length + 1}×)`)}
              action={<button className={btnGhost} onClick={() => del(`${plural(s.count, "doppelter Termin", "doppelte Termine")} gelöscht.`, (d) => removeDuplicateSessions(d), "Doppelte Termine")}>Löschen</button>} />
          )}
          {c.count > 0 && (
            <Group title={`Doppelte Karteikarten (${c.count})`}
              lines={c.groups.map((g) => `${g.keep.front}${mod.get(g.keep.moduleId) ? ` · ${mod.get(g.keep.moduleId)}` : ""} (${g.remove.length + 1}×)`)}
              action={<button className={btnGhost} onClick={() => del(`${plural(c.count, "doppelte Karte", "doppelte Karten")} gelöscht.`, (d) => removeDuplicateCards(d), "Doppelte Karteikarten")}>Löschen</button>} />
          )}
          {n.count > 0 && (
            <Group title={`Leere Notizen (${n.count})`}
              lines={n.items.map((x) => `Leere Notiz${mod.get(x.moduleId) ? ` · ${mod.get(x.moduleId)}` : ""}${x.updated ? ` · ${new Date(x.updated).toLocaleDateString("de-DE")}` : ""}`)}
              action={<button className={btnGhost} onClick={() => del(`${plural(n.count, "leere Notiz", "leere Notizen")} gelöscht.`, (d) => removeEmptyNotes(d), "Leere Notizen")}>Löschen</button>} />
          )}
          {orphans && orphans.length > 0 && (
            <Group title={`Verwaiste Anhänge (${orphans.length}, ${fmtSize(orphanSize)})`}
              lines={orphans.map((f) => `${f.type.startsWith("image/") ? "Bild" : f.type === "application/pdf" ? "PDF" : "Datei"}, ${fmtSize(f.size)}`)}
              note="Auf diesem Gerät, ohne Eintrag. Löschen ist endgültig."
              action={<ConfirmButton label="Löschen" confirmLabel="Endgültig?" className={btnGhost} onConfirm={async () => { await Promise.all(orphans.map((f) => removeLocal(f.id))); setScan((x) => x + 1); }} />} />
          )}
        </ul>
      )}
    </Card>
  );
}
