import { describe, it, expect } from "vitest";
import { deckFrom, importDeck, openDeck, parseShareLocation, sealDeck, shareUrl } from "../../src/lib/share.js";

describe("Stapel teilen", () => {
  it("verschlüsselt und entschlüsselt, ohne Lernstand", async () => {
    const deck = deckFrom([{ front: "Was ist ein Graph?", back: "G = (V, E)", tags: "graphen", ease: 1.3, interval: 40 }], "Diskrete Strukturen", "Waltuh");
    const { token, key, blob } = await sealDeck(deck);
    expect(blob).not.toContain("Graph");
    const out = await openDeck(blob, key);
    expect(out.cards).toEqual([{ front: "Was ist ein Graph?", back: "G = (V, E)", tags: "graphen" }]);
    expect(out.by).toBe("Waltuh");
    const url = new URL(shareUrl("https://x.test/app/", token, key));
    expect(parseShareLocation(url)).toEqual({ token, key });
  });
  it("falscher Schlüssel → verständlicher Fehler", async () => {
    const a = await sealDeck(deckFrom([{ front: "a" }], "x")), b = await sealDeck(deckFrom([{ front: "b" }], "y"));
    await expect(openDeck(a.blob, b.key)).rejects.toThrow("beschädigt");
  });
  it("Import überspringt doppelte Vorderseiten", () => {
    let n = 0;
    const data = { cards: [{ id: "c", moduleId: "m", front: "a" }] };
    const r = importDeck(data, { cards: [{ front: "a", back: "" }, { front: "b", back: "" }] }, "m", "2026-10-18", () => `n${n++}`);
    expect([r.added, r.skipped]).toEqual([1, 1]);
    expect(r.data.cards[1]).toMatchObject({ front: "b", moduleId: "m", due: "2026-10-18", reps: 0 });
  });
  it("ignoriert ungültige Kennungen", () => {
    expect(parseShareLocation({ search: "?teilen=<script>", hash: "" })).toBeNull();
  });
});
