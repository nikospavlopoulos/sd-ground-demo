import { describe, expect, it } from "vitest";
import { editDistance, findNearDuplicate, normalizeName } from "../src/normalize.js";

describe("normalizeName", () => {
  it("folds the transliteration variants that create duplicate people", () => {
    // The motivating case: one person, typed three ways. "th" and the ου/οy
    // ending are both choices the typist makes without thinking about them.
    expect(normalizeName("Theodorou")).toBe("8eodoru");
    expect(normalizeName("Theodoroy")).toBe("8eodoru");
    expect(normalizeName("theodorou")).toBe("8eodoru");
  });

  it("folds the digraphs that carry no information once transliterated", () => {
    expect(normalizeName("Papadopoulos")).toBe("papadopulos");   // ου -> u
    expect(normalizeName("Christodoulou")).toBe("xristodulu");   // ch -> x, ου -> u
    expect(normalizeName("Chrysanthou")).toBe("xrisan8u");       // ch -> x, y -> i, th -> 8
  });

  it("folds Greek script onto the same form as its Latin transliteration", () => {
    expect(normalizeName("Νικολάου")).toBe(normalizeName("Nikolaou"));
  });

  it("strips diacritics, doubles and punctuation", () => {
    expect(normalizeName("  Pappás ")).toBe("papas");
  });
});

describe("editDistance", () => {
  it("measures single edits", () => {
    expect(editDistance("8eodoru", "8eodoru")).toBe(0);
    expect(editDistance("8eodoru", "8eodor")).toBe(1);
    expect(editDistance("", "abc")).toBe(3);
  });
});

describe("findNearDuplicate", () => {
  const candidates = [
    { id: "1", displayName: "Theodorou", normalizedName: "8eodoru" },
    { id: "2", displayName: "Nikolaou", normalizedName: "nikolau" },
  ];

  it("offers the existing person for a transliteration variant", () => {
    expect(findNearDuplicate("Theodoroy", candidates)?.candidate.id).toBe("1");
  });

  it("offers the existing person for a one-character typo", () => {
    expect(findNearDuplicate("Thedorou", candidates)?.candidate.id).toBe("1");
  });

  it("does not offer anything for a genuinely different name", () => {
    expect(findNearDuplicate("Stavrou", candidates)).toBeNull();
  });
});
