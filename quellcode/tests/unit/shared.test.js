import { describe, it, expect } from "vitest";
import { sharedNote } from "../../src/lib/shared.js";

describe("Teilen-Ziel", () => {
  it("Titel aus Titel, erster Zeile, Adresse oder Dateiname", () => {
    expect(sharedNote({ title: "Folien", text: "VL 4", url: "" }, "2026-10-20")).toMatchObject({ title: "Folien", text: "VL 4" });
    expect(sharedNote({ text: "Erste Zeile\nZweite" }, "2026-10-20")).toMatchObject({ title: "Erste Zeile", text: "Erste Zeile\nZweite" });
    expect(sharedNote({ text: "Erste Zeile" }, "2026-10-20")).toMatchObject({ title: "Erste Zeile", text: "" });
    expect(sharedNote({ url: "https://live.rbg.tum.de/w/eidi" }, "2026-10-20")).toMatchObject({ title: "live.rbg.tum.de", text: "https://live.rbg.tum.de/w/eidi" });
    expect(sharedNote({ files: [{ id: "f1", name: "blatt3.pdf", type: "application/pdf", size: 10 }] }, "2026-10-20")).toMatchObject({ title: "blatt3.pdf", files: [{ id: "f1", name: "blatt3.pdf", added: "2026-10-20", cloud: false }] });
    expect(sharedNote({}, "2026-10-20").title).toBe("Geteilt");
  });
  it("Adresse im Text nicht doppelt", () => {
    expect(sharedNote({ text: "Schau mal https://x.de", url: "https://x.de" }, "2026-10-20").text).toBe("");
  });
});
