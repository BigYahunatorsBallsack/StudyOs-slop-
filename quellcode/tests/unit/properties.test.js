/* Eigenschaftsbasierte Tests (fast-check): zufällige Änderungen auf zwei Geräten, danach müssen beide
   Zusammenführungsrichtungen denselben Stand liefern. Außerdem: migrate ist idempotent und verliert nichts. */
import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { mergeData, stampChanges } from "../../src/lib/sync.js";
import { emptyData, migrate } from "../../src/lib/data.js";
import { COLLS } from "../../src/lib/constants.js";

const START = Date.parse("2026-10-01T08:00:00.000Z");
const IDS = ["a", "b", "c", "d", "e"];

/* Eine Änderung auf Gerät A oder B: Eintrag anlegen/ändern, löschen oder Einstellung ändern */
const op = fc.record({
  dev: fc.constantFrom("A", "B"),
  kind: fc.constantFrom("put", "put", "del", "setting"),
  coll: fc.constantFrom("modules", "notes", "homework"),
  id: fc.constantFrom(...IDS),
  value: fc.string({ maxLength: 6 }),
});

function apply(d, o, now) {
  let next;
  if (o.kind === "setting") next = { ...d, settings: { ...d.settings, name: o.value } };
  else if (o.kind === "del") next = { ...d, [o.coll]: d[o.coll].filter((x) => x.id !== o.id) };
  else {
    const exists = d[o.coll].some((x) => x.id === o.id);
    const item = { id: o.id, title: o.value };
    next = { ...d, [o.coll]: exists ? d[o.coll].map((x) => (x.id === o.id ? { ...x, ...item } : x)) : [...d[o.coll], item] };
  }
  return stampChanges(d, next, now);
}

/* Vergleichbare Form: Einträge je Sammlung nach id sortiert, Grabsteine sortiert, Einstellungen */
const canon = (d) => ({
  ...Object.fromEntries(COLLS.map((c) => [c, [...(d[c] || [])].sort((x, y) => x.id.localeCompare(y.id))])),
  deleted: [...(d.deleted || [])].map((t) => `${t.c}:${t.id}@${t.at}`).sort(),
  settings: d.settings,
});

function run(baseOps, ops) {
  let base = emptyData(), t = START;
  const tick = () => new Date((t += 60000)).toISOString();
  for (const o of baseOps) base = apply(base, o, tick());
  let A = base, B = base;
  const effective = []; /* Aktionen, die auf ihrem Gerät etwas bewirkt haben (Löschen nur, wenn der Eintrag dort existierte) */
  for (const o of ops) {
    const cur = o.dev === "A" ? A : B;
    if (o.kind === "put" || (o.kind === "del" && cur[o.coll].some((x) => x.id === o.id))) effective.push(o);
    if (o.dev === "A") A = apply(A, o, tick()); else B = apply(B, o, tick());
  }
  return { A, B, now: tick(), effective };
}

describe("mergeData (Eigenschaften)", () => {
  it("beide Richtungen ergeben denselben Stand", () => {
    fc.assert(fc.property(fc.array(op, { maxLength: 8 }), fc.array(op, { maxLength: 25 }), (baseOps, ops) => {
      const { A, B, now } = run(baseOps, ops);
      expect(canon(mergeData(A, B, now).data)).toEqual(canon(mergeData(B, A, now).data));
    }), { numRuns: 400 });
  });

  it("erneutes Zusammenführen ändert nichts mehr", () => {
    fc.assert(fc.property(fc.array(op, { maxLength: 8 }), fc.array(op, { maxLength: 25 }), (baseOps, ops) => {
      const { A, B, now } = run(baseOps, ops);
      const once = mergeData(A, B, now).data;
      expect(canon(mergeData(once, B, now).data)).toEqual(canon(once));
      expect(canon(mergeData(once, A, now).data)).toEqual(canon(once));
      expect(mergeData(once, once, now).stats).toEqual({ added: 0, updated: 0, removed: 0 });
    }), { numRuns: 300 });
  });

  it("jüngste Änderung gewinnt: ein Eintrag existiert genau dann, wenn seine letzte wirksame Aktion kein Löschen war", () => {
    fc.assert(fc.property(fc.array(op, { maxLength: 30 }), (ops) => {
      const { A, B, now, effective } = run([], ops);
      const merged = mergeData(A, B, now).data;
      for (const coll of ["modules", "notes", "homework"]) {
        for (const id of IDS) {
          const last = [...effective].reverse().find((o) => o.coll === coll && o.id === id);
          expect(merged[coll].some((x) => x.id === id), `${coll}/${id}`).toBe(!!last && last.kind === "put");
        }
      }
    }), { numRuns: 300 });
  });
});

/* Beliebige, auch kaputte Sicherungen: Einträge mit und ohne id, falsche Typen */
const anyItem = fc.oneof(
  fc.record({ id: fc.string({ minLength: 1, maxLength: 4 }), title: fc.string({ maxLength: 5 }), date: fc.constantFrom("2026-10-01", "2026-10-08", undefined), seriesId: fc.constantFrom("s1", undefined) }, { requiredKeys: ["id"] }),
  fc.constant(null), fc.constant(42), fc.record({ title: fc.string() }),
);
const backup = fc.record({
  version: fc.constantFrom(1, 2, 3),
  settings: fc.option(fc.record({ name: fc.string({ maxLength: 5 }) }), { nil: undefined }),
  ...Object.fromEntries(COLLS.map((c) => [c, fc.option(fc.array(anyItem, { maxLength: 6 }), { nil: undefined })])),
  deleted: fc.option(fc.array(fc.record({ c: fc.constantFrom(...COLLS, "x"), id: fc.string({ maxLength: 3 }), at: fc.constantFrom("2026-10-01T00:00:00.000Z", 5) })), { nil: undefined }),
}, { requiredKeys: [] });

describe("migrate (Eigenschaften)", () => {
  it("ist idempotent", () => {
    fc.assert(fc.property(backup, (b) => {
      const once = migrate(structuredClone(b));
      expect(migrate(structuredClone(once))).toEqual(once);
    }), { numRuns: 300 });
  });

  it("behält jeden Eintrag mit id und verwirft nur ungültige", () => {
    fc.assert(fc.property(backup, (b) => {
      const out = migrate(structuredClone(b));
      for (const c of COLLS) {
        const valid = (Array.isArray(b[c]) ? b[c] : []).filter((x) => x && typeof x === "object" && x.id);
        expect(out[c].map((x) => x.id)).toEqual(valid.map((x) => x.id));
        expect(out[c].map((x) => x.title)).toEqual(valid.map((x) => x.title));
      }
      expect(out.deleted.every((t) => COLLS.includes(t.c) && typeof t.at === "string")).toBe(true);
    }), { numRuns: 300 });
  });
});
