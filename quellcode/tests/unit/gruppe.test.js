/* Links pro Modul, Gruppenabgaben und Inhaltsverzeichnis für Notizen */
import { describe, expect, it } from "vitest";
import { artemisCourseUrl, cleanLinks, linkName, linksError, moduleLinks, normalizeUrl } from "../../src/lib/modlinks.js";
import { cleanPartners, fixAssignees, lastPartners, partnerSuggestions, splitNames, withText } from "../../src/lib/partners.js";
import { noteHeadings, plainHeading, tocDepth } from "../../src/lib/toc.js";
import { formDef } from "../../src/lib/forms.js";
import { emptyData } from "../../src/lib/data.js";
import { mergeData, stampChanges } from "../../src/lib/sync.js";

describe("Links pro Modul", () => {
  it("erkennt bekannte Seiten", () => {
    expect(linkName("https://www.moodle.tum.de/course/view.php?id=12")).toBe("Moodle");
    expect(linkName("https://artemis.tum.de/courses/300")).toBe("Artemis");
    expect(linkName("https://zulip.in.tum.de/#narrow/stream/1")).toBe("Zulip");
    expect(linkName("https://live.rbg.tum.de/?course=x")).toBe("TUM-Live");
    expect(linkName("https://www.cs.cit.tum.de/skript.pdf")).toBe("cs.cit.tum.de");
    expect(linkName("kein link")).toBe("");
  });

  it("vervollständigt Adressen und lehnt Unsinn ab", () => {
    expect(normalizeUrl("moodle.tum.de/course/view.php?id=1")).toBe("https://moodle.tum.de/course/view.php?id=1");
    expect(normalizeUrl("http://example.org")).toBe("http://example.org/");
    expect(normalizeUrl("javascript:alert(1)")).toBeNull();
    expect(normalizeUrl("hallo")).toBeNull();
  });

  it("räumt beim Speichern auf und ergänzt Namen", () => {
    const out = cleanLinks([{ id: "1", name: "", url: " zulip.in.tum.de " }, { id: "2", name: "", url: "" }, { id: "3", name: "Skript", url: "https://x.de/s.pdf" }]);
    expect(out).toEqual([{ id: "1", name: "Zulip", url: "https://zulip.in.tum.de/" }, { id: "3", name: "Skript", url: "https://x.de/s.pdf" }]);
    expect(linksError([{ name: "Skript", url: "kaputt" }])).toMatch(/Skript/);
    expect(linksError([{ name: "", url: "" }])).toBe("");
  });

  it("Knopfzeile: eigene Links, Aufzeichnungen und Artemis-Kurs aus dem Abo, ohne Doppelte", () => {
    const feed = "https://artemis.tum.de/api/core/calendar/courses/417/calendar-events-ics?token=abc";
    expect(artemisCourseUrl(feed)).toBe("https://artemis.tum.de/courses/417");
    const m = { id: "m1", liveUrl: "https://live.rbg.tum.de/?course=eidi", links: [{ id: "a", name: "", url: "https://www.moodle.tum.de/course/view.php?id=9" }, { id: "b", name: "Live", url: "https://live.rbg.tum.de/?course=eidi" }] };
    const settings = { artemisFeeds: [{ id: "f", moduleId: "m1", url: feed }, { id: "g", moduleId: "m2", url: feed }] };
    expect(moduleLinks(m, settings).map((l) => l.name)).toEqual(["Moodle", "Live", "Artemis"]);
    const own = { ...m, links: [...m.links, { id: "c", name: "Übung", url: "https://artemis.tum.de/courses/417" }] };
    expect(moduleLinks(own, settings).map((l) => l.name)).toEqual(["Moodle", "Live", "Übung"]);
    expect(moduleLinks({ id: "x" })).toEqual([]);
  });

  it("Modul-Formular prüft und säubert die Links", () => {
    const def = formDef("module", { modules: [] });
    expect(def.fields.some((f) => f.k === "links" && f.t === "links")).toBe(true);
    expect(def.validate({ links: [{ name: "x", url: "nope" }] })).toMatch(/keine gültige Adresse/);
    expect(def.prepare({ name: "A", links: [{ id: "1", name: "", url: "artemis.tum.de/courses/1" }] }).links).toEqual([{ id: "1", name: "Artemis", url: "https://artemis.tum.de/courses/1" }]);
  });

  it("Links werden beim Sync pro Element zusammengeführt", () => {
    const T = (h) => `2026-10-17T${String(h).padStart(2, "0")}:00:00.000Z`;
    const edit = (d, fn, at) => stampChanges(d, fn(d), at);
    const base = edit({ ...emptyData(), modules: [] }, (d) => ({ ...d, modules: [{ id: "m", name: "EIDI", links: [{ id: "a", name: "Moodle", url: "https://moodle.tum.de/" }] }] }), T(8));
    const add = (l) => (d) => ({ ...d, modules: d.modules.map((m) => ({ ...m, links: [...m.links, l] })) });
    const a = edit(base, add({ id: "b", name: "Zulip", url: "https://zulip.in.tum.de/" }), T(9));
    const b = edit(base, add({ id: "c", name: "Skript", url: "https://x.de/" }), T(10));
    const m = mergeData(a, b, T(23)).data;
    expect(m.modules[0].links.map((l) => l.id).sort()).toEqual(["a", "b", "c"]);
  });
});

describe("Gruppenabgaben", () => {
  it("säubert Namen und trennt Eingaben", () => {
    expect(cleanPartners([" Max ", "max", "", "Lea  Sophie"])).toEqual(["Max", "Lea Sophie"]);
    expect(cleanPartners(splitNames("Max, Lea und Tom"))).toEqual(["Max", "Lea", "Tom"]);
    expect(cleanPartners(undefined)).toEqual([]);
  });

  it("zeigt „mit …“ an", () => {
    expect(withText([])).toBe("");
    expect(withText(["Max"])).toBe("mit Max");
    expect(withText(["Max", "Lea"])).toBe("mit Max und Lea");
    expect(withText(["Max", "Lea", "Tom"])).toBe("mit Max, Lea und Tom");
  });

  it("merkt sich das Team pro Modul über das zuletzt angelegte Blatt", () => {
    const d = { homework: [
      { id: "1", moduleId: "m", created: "2026-10-01", partners: ["Max"] },
      { id: "2", moduleId: "m", created: "2026-10-08", partners: ["Max", "Lea"] },
      { id: "3", moduleId: "m", created: "2026-10-15" },
      { id: "4", moduleId: "x", created: "2026-10-16", partners: ["Tom"] },
      { id: "5", moduleId: "m", created: "2026-10-20", partners: ["Ole"], deleted: true },
    ] };
    expect(lastPartners(d, "m")).toEqual(["Max", "Lea"]);
    expect(lastPartners(d, "m", "2")).toEqual(["Max"]);
    expect(lastPartners(d, "y")).toEqual([]);
    expect(partnerSuggestions(d, "m")).toEqual(["Max", "Lea"]);
    /* bewusst allein: leeres Team gilt fürs nächste Blatt */
    expect(lastPartners({ homework: [...d.homework, { id: "6", moduleId: "m", created: "2026-10-18", partners: [] }] }, "m")).toEqual([]);
  });

  it("Zuständige außerhalb des Teams fallen auf „ich“ zurück", () => {
    const subs = [{ id: "a", title: "a", by: "Max" }, { id: "b", title: "b", by: "Lea" }, { id: "c", title: "c" }];
    expect(fixAssignees(subs, ["Max"])).toEqual([{ id: "a", title: "a", by: "Max" }, { id: "b", title: "b" }, { id: "c", title: "c" }]);
    expect(fixAssignees(undefined, ["Max"])).toBeUndefined();
  });

  it("Formular: Partner-Feld und Aufräumen beim Speichern", () => {
    const def = formDef("homework", { modules: [] });
    expect(def.fields.find((f) => f.k === "partners")?.t).toBe("people");
    const out = def.prepare({ partners: [" Max ", "Max"], subtasks: [{ id: "a", title: "a", by: "Tom" }] });
    expect(out.partners).toEqual(["Max"]);
    expect(out.subtasks).toEqual([{ id: "a", title: "a" }]);
  });
});

describe("Inhaltsverzeichnis", () => {
  it("findet Überschriften mit Zeilennummer, nicht in Code- oder Formelblöcken", () => {
    const text = ["# Einleitung", "Text", "```", "# kein Titel", "```", "## **Beweis** von `x`", "$$", "# auch nicht", "$$", "$$a$$", "### [[Graphen|Bäume]]", "#### zu tief", "#ohneLeer"].join("\n");
    expect(noteHeadings(text)).toEqual([
      { level: 1, text: "Einleitung", line: 0 },
      { level: 2, text: "Beweis von x", line: 5 },
      { level: 3, text: "Bäume", line: 10 },
    ]);
  });

  it("Text der Überschrift und Einzug", () => {
    expect(plainHeading("[Link](https://x.de) *kursiv*")).toBe("Link kursiv");
    const items = noteHeadings("## A\n### B\n## C");
    expect(items.map(tocDepth(items))).toEqual([0, 1, 0]);
    expect(noteHeadings("")).toEqual([]);
  });
});
