import { describe, it, expect } from "vitest";
import { LEGACY_COMMUTE } from "../../src/lib/transit.js";
import { commuteAlert, commuteWindow } from "../../src/server/commute.js";
import { lineMessages, mvg } from "../../src/server/mvg.js";
import { deadlinesFromData } from "../../src/lib/push.js";
import { emptyData } from "../../src/lib/data.js";
import { zonedInstant } from "../../src/server/reminders.js";

const TZ = "Europe/Berlin", DAY = "2026-10-20";
const ms = (hm) => zonedInstant(DAY, hm, TZ).getTime();
const commute = { station: { id: "de:09184:2222" }, line: "230", towards: "Forschungszentrum", avoid: "", travel: 50, walk: 5, buffer: 10,
  feeder: { station: { id: "de:09175:4020" }, line: "S6", towards: "", avoid: "Grafing", travel: 8, transfer: 4 } };
const entry = { id: "weg-" + DAY, kind: "commute", title: "Diskrete Strukturen", date: DAY, time: "09:15", commute };

/* MVG-Rohdaten wie von /departures; delay in Minuten, cancel = fällt aus */
const raw = (label, destination, hm, delay = 0, cancel = false) => ({ label, destination, transportType: "BUS", plannedDepartureTime: ms(hm), realtimeDepartureTime: ms(hm) + delay * 60000, delayInMinutes: delay, realtime: true, cancelled: cancel });
function fakeFetch({ bus, s6 }) {
  return async (url) => new Response(JSON.stringify(String(url).includes("de:09175:4020") ? s6 : bus), { status: 200 });
}
const S6 = [raw("S6", "Leuchtenbergring", "07:32"), raw("S6", "Leuchtenbergring", "07:52"), raw("S6", "Grafing-Bahnhof", "07:59")];

describe("Weg zur Uni: Push bei Verspätung", () => {
  it("prüft nur im Fenster vor dem Losgehen", () => {
    const w = commuteWindow(entry, TZ);
    // 9:15 − 10 − 50 − 5 − 8 − 4 = 7:58 spätestens los (ohne Wartezeiten); geprüft 6:43 bis 7:53
    expect([w.from, w.to]).toEqual([ms("06:43"), ms("07:53")]);
  });

  it("meldet, wenn der passende Bus Verspätung hat und eine frühere S6 nötig ist", async () => {
    const bus = [raw("230", "Garching, Forschungszentrum", "07:53"), raw("230", "Garching, Forschungszentrum", "08:13", 4)];
    const a = await commuteAlert(entry, new Date(ms("07:00")), TZ, fakeFetch({ bus, s6: S6 }));
    // Plan: Bus 8:13 → S6 7:52 → los 7:47. Echtzeit: 8:17 kommt zu spät (9:07 > 9:05) → Bus 7:53 → S6 7:32 → los 7:27
    expect(a).toMatchObject({ title: "Früher los: 07:27", body: "Für Diskrete Strukturen um 09:15 um 07:27 statt 07:47 losgehen (Bus 230 um 08:13 +4).", tag: "commute-" + DAY });
    expect(a.key).toBe(`commute:weg-${DAY}:${DAY}:07:27`);
  });

  it("meldet einen Ausfall des Zubringers", async () => {
    const bus = [raw("230", "Garching, Forschungszentrum", "07:53"), raw("230", "Garching, Forschungszentrum", "08:13")];
    const s6 = [raw("S6", "Leuchtenbergring", "07:32"), raw("S6", "Leuchtenbergring", "07:52", 0, true)];
    const a = await commuteAlert(entry, new Date(ms("07:10")), TZ, fakeFetch({ bus, s6 }));
    expect(a.body).toBe("Für Diskrete Strukturen um 09:15 um 07:27 statt 07:47 losgehen (S6 um 07:52 fällt aus).");
  });

  it("schweigt bei pünktlichen Fahrten, kleinen Verspätungen und außerhalb des Fensters", async () => {
    const bus = [raw("230", "Garching, Forschungszentrum", "07:53"), raw("230", "Garching, Forschungszentrum", "08:13", 1)];
    expect(await commuteAlert(entry, new Date(ms("07:00")), TZ, fakeFetch({ bus, s6: S6 }))).toBeNull();
    expect(await commuteAlert(entry, new Date(ms("05:00")), TZ, fakeFetch({ bus, s6: S6 }))).toBeNull();
  });

  it("die App lädt die erste Veranstaltung je Tag nur hoch, wenn eingeschaltet", () => {
    const d = { ...emptyData(), modules: [{ id: "ds", name: "Diskrete Strukturen" }],
      sessions: [{ id: "a", moduleId: "ds", type: "Übung", date: DAY, start: "12:00", end: "14:00" }, { id: "b", moduleId: "ds", type: "Vorlesung", date: DAY, start: "09:15", end: "10:45" }, { id: "c", moduleId: "ds", type: "Vorlesung", date: "2026-10-21", start: "08:00", end: "10:00", cancelled: true }] };
    expect(deadlinesFromData(d, DAY).filter((x) => x.kind === "commute")).toEqual([]);
    const on = deadlinesFromData({ ...d, settings: { ...d.settings, pushCommute: true, commute: LEGACY_COMMUTE } }, DAY).filter((x) => x.kind === "commute");
    expect(on.map((x) => [x.date, x.time, x.title])).toEqual([[DAY, "09:15", "Diskrete Strukturen"]]);
    expect(on[0].commute).toMatchObject({ line: "230", buffer: 10, feeder: { line: "S6", transfer: 4 } });
  });
});

describe("MVG-Störungsmeldungen", () => {
  const msgs = [
    { title: "Bauarbeiten <b>S6</b>", description: "Zwischen A und B<br>Ersatzverkehr&nbsp;mit Bussen", type: "SCHEDULE_CHANGE", validFrom: 1000, validTo: 9e12, lines: [{ label: "S6" }, { label: "S6" }] },
    { title: "Weichenstörung", description: "", type: "INCIDENT", validFrom: 1000, validTo: 9e12, lines: [{ label: "S6" }, { label: "S2" }] },
    { title: "Vorbei", type: "INCIDENT", validFrom: 1, validTo: 2, lines: [{ label: "230" }] },
    { title: "Andere Linie", type: "INCIDENT", validFrom: 1000, validTo: 9e12, lines: [{ label: "U6" }] },
  ];
  it("filtert nach Linie und Gültigkeit, Störungen zuerst, HTML als Text", () => {
    expect(lineMessages(msgs, ["S6", "230"], 5000)).toEqual([
      { title: "Weichenstörung", text: "", incident: true, from: 1000, to: 9e12, lines: ["S6"] },
      { title: "Bauarbeiten S6", text: "Zwischen A und B\nErsatzverkehr mit Bussen", incident: false, from: 1000, to: 9e12, lines: ["S6"] },
    ]);
  });
  it("prüft die Linien der Anfrage", async () => {
    expect((await mvg({ kind: "messages", lines: ["S6; drop"] }, async () => new Response("[]"))).status).toBe(400);
    expect((await mvg({ kind: "messages", lines: ["S6"], now: 5000 }, async () => new Response(JSON.stringify(msgs)))).data.length).toBe(2);
  });
});
