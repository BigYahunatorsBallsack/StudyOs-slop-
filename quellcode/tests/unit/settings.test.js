import { describe, it, expect } from "vitest";
import { SETTINGS, SETTING_GROUPS, matchSettings } from "../../src/lib/settings.js";
import { matchCommands } from "../../src/lib/commands.js";
import { freshItems, itemTitle, parseChangelog } from "../../src/lib/whatsnew.js";
import { readFileSync } from "node:fs";

describe("Einstellungen durchsuchen", () => {
  it("jede Einstellung gehört zu einer Gruppe, ids sind eindeutig", () => {
    const groups = new Set(SETTING_GROUPS.map((g) => g[0]));
    expect(SETTINGS.every(([, g]) => groups.has(g))).toBe(true);
    expect(new Set(SETTINGS.map((s) => s[0])).size).toBe(SETTINGS.length);
  });
  it("findet nach Bezeichnung, Stichwort und Wortanfang, auch mit Umlauten", () => {
    expect(matchSettings("mensa")[0]).toMatchObject({ id: "mensa", group: "studium", groupTitle: "Studium" });
    expect(matchSettings("schriftgr")[0].id).toBe("size");
    expect(matchSettings("gameboy")[0].id).toBe("palette");
    expect(matchSettings("schrift größe")[0].id).toBe("size");
    expect(matchSettings("losgehen").map((h) => h.id)).toContain("pushLeave");
  });
  it("alle Push-Arten liegen unter Benachrichtigungen", () => {
    const push = matchSettings("push", 50);
    expect(push.length).toBeGreaterThan(5);
    expect(push.every((h) => h.group === "benachrichtigungen")).toBe(true);
  });
  it("Treffer in der Bezeichnung zuerst, leere Eingabe ergibt nichts", () => {
    expect(matchSettings("sicherung export")[0].id).toBe("export");
    expect(matchSettings("export").map((h) => h.id)).toEqual(expect.arrayContaining(["export", "icsExport"]));
    expect(matchSettings("  ")).toEqual([]);
    expect(matchSettings("xyzzy")).toEqual([]);
  });
  it("Strg + K bietet Einstellungen mit Sprung in die Gruppe an", () => {
    const hit = matchCommands("farbpalette").find((c) => c.title === "Farbpalette");
    expect(hit).toMatchObject({ sub: "Einstellung · Darstellung & Klang", act: { type: "more", sub: "daten", group: "darstellung", item: "palette" } });
    /* der Befehl „Papierkorb“ kommt nur einmal */
    expect(matchCommands("papierkorb").filter((c) => c.title === "Papierkorb")).toHaveLength(1);
    expect(matchCommands("was ist neu")[0].act).toEqual({ type: "more", sub: "neu" });
  });
});

describe("Was ist neu", () => {
  const text = `# Änderungen

## Unveröffentlicht
- **Fester Weg zur Uni:** Mit den Öffis …
- **Lange drücken öffnet ein Schnellmenü** (am PC Rechtsklick): …
- ohne Fettdruck zählt nicht

## 2.11.0
- **Behoben: Lernzeit konnte länger sein.** Ein Termin …

## 2.10.0
- **Alt:** a

## 2.9.0
- **Ganz alt:** b
`;
  it("liest nur die fett gedruckten Überschriften, neueste Abschnitte zuerst", () => {
    const s = parseChangelog(text);
    expect(s).toHaveLength(3);
    expect(s[0]).toEqual({ version: null, items: ["Fester Weg zur Uni", "Lange drücken öffnet ein Schnellmenü"] });
    expect(s[1]).toEqual({ version: "2.11.0", items: ["Behoben: Lernzeit konnte länger sein"] });
    expect(itemTitle("- kein Punkt")).toBe("");
  });
  it("leeres „Unveröffentlicht“ fällt weg, dann zählt die aktuelle Version", () => {
    const s = parseChangelog("## Unveröffentlicht\n\n## 3.0.0\n- **Neu:** x\n");
    expect(s[0]).toEqual({ version: "3.0.0", items: ["Neu"] });
  });
  it("neue Nutzer sehen nichts, bestehende alles, danach nur Ungesehenes", () => {
    const sec = { version: null, items: ["A", "B", "C"] };
    expect(freshItems(sec, null, false)).toEqual([]);
    expect(freshItems(sec, null, true)).toEqual(["A", "B", "C"]);
    expect(freshItems(sec, ["A", "B"], true)).toEqual(["C"]);
    expect(freshItems(undefined, [], true)).toEqual([]);
  });
  it("das echte CHANGELOG.md ergibt Punkte", () => {
    const s = parseChangelog(readFileSync("CHANGELOG.md", "utf8"));
    expect(s[0].items.length).toBeGreaterThan(0);
    expect(s[0].items.every((t) => t && !t.includes("**"))).toBe(true);
  });
});
