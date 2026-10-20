import { describe, it, expect } from "vitest";
import { drive, driveProvider } from "../../src/server/drive.js";
import { carPlan, commuteIncomplete, commuteOf, DEFAULT_COMMUTE, LEGACY_COMMUTE, mapsLink } from "../../src/lib/transit.js";
import { deadlinesFromData } from "../../src/lib/push.js";
import { emptyData } from "../../src/lib/data.js";

const ok = (body) => new Response(JSON.stringify(body), { status: 200 });

describe("Weg zur Uni mit dem Auto: Server", () => {
  it("ohne Schlüssel: verständlicher Hinweis statt Abfrage", async () => {
    let called = false;
    const r = await drive({ from: "Zorneding", to: "Garching" }, {}, async () => { called = true; return ok({}); });
    expect(r.status).toBe(501);
    expect(r.error).toMatch(/GOOGLE_MAPS_KEY oder TOMTOM_KEY/);
    expect(called).toBe(false);
  });

  it("prüft Start und Ziel", async () => {
    expect((await drive({ from: "", to: "Garching" }, { TOMTOM_KEY: "k" }, fetch)).status).toBe(400);
    expect((await drive({ from: "x".repeat(121), to: "Garching" }, { TOMTOM_KEY: "k" }, fetch)).status).toBe(400);
  });

  it("Google: Routes API mit Verkehr, Schlüssel nur im Header", async () => {
    const calls = [];
    const fetchImpl = async (url, opts) => { calls.push({ url, opts }); return ok({ routes: [{ duration: "2520s", staticDuration: "2100s", distanceMeters: 38420 }] }); };
    const r = await drive({ from: "Zorneding", to: "Boltzmannstraße 15, Garching" }, { GOOGLE_MAPS_KEY: "geheim", TOMTOM_KEY: "t" }, fetchImpl);
    expect(r.data).toEqual({ minutes: 42, normal: 35, km: 38.4, provider: "google" });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).not.toContain("geheim");
    expect(calls[0].opts.headers["X-Goog-Api-Key"]).toBe("geheim");
    expect(JSON.parse(calls[0].opts.body)).toMatchObject({ travelMode: "DRIVE", routingPreference: "TRAFFIC_AWARE", origin: { address: "Zorneding" } });
  });

  it("TomTom: erst Adressen suchen (Koordinaten direkt), dann Route mit Verkehr", async () => {
    const urls = [];
    const fetchImpl = async (url) => {
      urls.push(String(url));
      if (String(url).includes("/geocode/")) return ok({ results: [{ position: { lat: 48.0868, lon: 11.8259 } }] });
      return ok({ routes: [{ summary: { lengthInMeters: 37950, travelTimeInSeconds: 2700, noTrafficTravelTimeInSeconds: 2160, trafficDelayInSeconds: 540 } }] });
    };
    const r = await drive({ from: "Zorneding Tomtom-Test", to: "48.2656, 11.6698" }, { TOMTOM_KEY: "t" }, fetchImpl);
    expect(r.data).toEqual({ minutes: 45, normal: 36, km: 38, provider: "tomtom" });
    expect(urls.filter((u) => u.includes("/geocode/"))).toHaveLength(1);
    expect(urls.at(-1)).toContain("/calculateRoute/48.0868,11.8259:48.2656,11.6698/json?");
    expect(urls.at(-1)).toContain("traffic=true");
    // zweite Abfrage: Adresse kommt aus dem Zwischenspeicher
    await drive({ from: "Zorneding Tomtom-Test", to: "48.2656, 11.6698" }, { TOMTOM_KEY: "t" }, fetchImpl);
    expect(urls.filter((u) => u.includes("/geocode/"))).toHaveLength(1);
  });

  it("abgelehnter Schlüssel und unbekannte Adresse", async () => {
    const denied = await drive({ from: "A-Dorf", to: "B-Stadt" }, { GOOGLE_MAPS_KEY: "x" }, async () => new Response("{}", { status: 403 }));
    expect(denied).toMatchObject({ status: 502, error: expect.stringMatching(/lehnt den Schlüssel ab/) });
    const none = await drive({ from: "Nirgendwo-123", to: "48.2,11.6" }, { TOMTOM_KEY: "t" }, async () => ok({ results: [] }));
    expect(none).toMatchObject({ status: 404, error: "„Nirgendwo-123“ wurde nicht gefunden." });
  });

  it("Google: Standort als Koordinaten", async () => {
    let sent;
    await drive({ from: "48.1500,11.6000", to: "Garching" }, { GOOGLE_MAPS_KEY: "g" }, async (url, opts) => { sent = JSON.parse(opts.body); return ok({ routes: [{ duration: "600s" }] }); });
    expect(sent.origin).toEqual({ location: { latLng: { latitude: 48.15, longitude: 11.6 } } });
    expect(sent.destination).toEqual({ address: "Garching" });
  });

  it("Google hat Vorrang, wenn beide Schlüssel gesetzt sind", () => {
    expect(driveProvider({ GOOGLE_MAPS_KEY: "g", TOMTOM_KEY: "t" })).toBe("google");
    expect(driveProvider({ TOMTOM_KEY: "t" })).toBe("tomtom");
    expect(driveProvider({})).toBe(null);
  });
});

describe("Weg zur Uni mit dem Auto: App", () => {
  it("bisherige Vorgabe: Öffis, Auto von Zorneding nach Garching", () => {
    const c = commuteOf({ commute: LEGACY_COMMUTE });
    expect(c.mode).toBe("transit");
    expect(c.car.from).toBe("Zorneding");
    expect(c.car.to).toMatch(/Garching/);
    expect(commuteOf({ commute: { mode: "car", car: { from: "Haar" } } }).car).toMatchObject({ from: "Zorneding", campus: "garching", park: 10 });
  });

  it("fester Weg: Öffis S6 und Bus 230 nach Garching, Auto ab Zorneding zum gewählten Campus", () => {
    expect(commuteOf({})).toBe(null);
    const c = commuteOf({ commute: DEFAULT_COMMUTE });
    expect(c).toMatchObject({ line: "230", station: { name: "Haar" }, feeder: { line: "S6", station: { name: "Zorneding" } }, car: { from: "Zorneding", campus: "garching" } });
    expect(commuteIncomplete(c)).toBe(false);
    expect(commuteIncomplete({ ...c, mode: "car" })).toBe(false);
    /* eigene Haltestellen von früher gelten nicht mehr */
    expect(commuteOf({ commute: { station: { id: "x", name: "Freising" }, line: "U6", feeder: null } })).toMatchObject({ line: "230", feeder: { line: "S6" } });
    /* Campus wählbar; ohne Wahl nach Studiengang bzw. alter Zieladresse */
    expect(commuteOf({ commute: { car: { campus: "weihenstephan" } } }).car).toMatchObject({ campus: "weihenstephan", to: "Alte Akademie 8, 85354 Freising" });
    expect(commuteOf({ curriculum: "tum-bsc-pbt-2022", commute: DEFAULT_COMMUTE }).car.campus).toBe("weihenstephan");
    expect(commuteOf({ commute: { car: { to: "Weihenstephaner Steig 22, Freising" } } }).car.campus).toBe("weihenstephan");
    expect(commuteOf({ commute: { car: { campus: "weihenstephan", fromHere: true } } }).car.fromHere).toBe(true);
  });

  it("Losfahren = Beginn − Puffer − Parken − Fahrzeit mit Verkehr", () => {
    const c = commuteOf({ commute: { mode: "car", buffer: 10, car: { park: 5 } } });
    const p = carPlan({ minutes: 45 }, { date: "2026-10-20", start: "09:15" }, c);
    expect(new Date(p.leaveAt).toTimeString().slice(0, 5)).toBe("08:15");
    expect(new Date(p.arriveAt).toTimeString().slice(0, 5)).toBe("09:00");
    expect(carPlan(null, { date: "2026-10-20", start: "09:15" }, c)).toBe(null);
  });

  it("Google-Maps-Link ab Standort: ohne origin", () => {
    expect(mapsLink({ from: "Zorneding", to: "Garching" }, true)).toBe("https://www.google.com/maps/dir/?api=1&destination=Garching&travelmode=driving");
  });

  it("Google-Maps-Link ohne Schlüssel", () => {
    expect(mapsLink({ from: "Zorneding", to: "Boltzmannstraße 15, Garching" })).toBe("https://www.google.com/maps/dir/?api=1&origin=Zorneding&destination=Boltzmannstra%C3%9Fe%2015%2C%20Garching&travelmode=driving");
  });

  it("im Auto-Modus kein Verspätungs-Push", () => {
    const DAY = "2026-10-20";
    const d = { ...emptyData(), sessions: [{ id: "s1", type: "Vorlesung", date: DAY, start: "09:15", end: "10:45" }] };
    const commute = (settings) => deadlinesFromData({ ...d, settings: { ...d.settings, ...settings } }, DAY).filter((x) => x.kind === "commute").length;
    expect(commute({ pushCommute: true, commute: LEGACY_COMMUTE })).toBe(1);
    expect(commute({ pushCommute: true, commute: { ...LEGACY_COMMUTE, mode: "car" } })).toBe(0);
    expect(commute({ pushCommute: true, commute: DEFAULT_COMMUTE })).toBe(1); /* fester Weg, sofort bereit */
  });
});
