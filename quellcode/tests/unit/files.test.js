import { describe, it, expect } from "vitest";
import { imageFiles, imageMd, pastedName } from "../../src/lib/files.js";

describe("Bilder einfügen", () => {
  it("benennt eingefügte Bilder ohne eigenen Namen", () => {
    const now = new Date(2026, 9, 20, 9, 5);
    expect(pastedName({ name: "image.png", type: "image/png" }, now)).toBe("Bild 20.10. 09-05.png");
    expect(pastedName({ name: "", type: "image/jpeg" }, now)).toBe("Bild 20.10. 09-05.jpg");
    expect(pastedName({ name: "Tafel.jpg", type: "image/jpeg" }, now)).toBe("Tafel.jpg");
  });
  it("Markdown verweist auf den Anhang, nur Bilddateien zählen", () => {
    expect(imageMd({ id: "abc123", name: "Bild [1].png" })).toBe("![Bild 1.png](att:abc123)");
    expect(imageFiles({ files: [{ type: "image/png" }, { type: "application/pdf" }] })).toHaveLength(1);
    expect(imageFiles(null)).toEqual([]);
  });
});
