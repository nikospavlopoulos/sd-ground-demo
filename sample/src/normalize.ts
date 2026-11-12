/**
 * Name folding for crew deduplication.
 *
 * Greek surnames get transliterated into Latin inconsistently: "Theodorou",
 * "Theodoroy" and "theodorou" are one person typed three ways. Folding collapses
 * the common transliteration variants so near-duplicates collide, and the UI can
 * offer the existing person instead of silently creating a second one.
 */

const GREEK_TO_LATIN: Record<string, string> = {
  α: "a", β: "v", γ: "g", δ: "d", ε: "e", ζ: "z", η: "i", θ: "th", ι: "i",
  κ: "k", λ: "l", μ: "m", ν: "n", ξ: "x", ο: "o", π: "p", ρ: "r", σ: "s",
  ς: "s", τ: "t", υ: "y", φ: "f", χ: "ch", ψ: "ps", ω: "o",
};

export function normalizeName(input: string): string {
  let s = input.toLowerCase().normalize("NFD").replace(/\p{M}+/gu, "");

  s = [...s].map((ch) => GREEK_TO_LATIN[ch] ?? ch).join("");

  // Digraphs first, so the single-letter rules below cannot eat their 'h'.
  s = s.replace(/ph/g, "f").replace(/kh/g, "x").replace(/ch/g, "x").replace(/th/g, "8");

  // Vowel clusters that differ only by transliteration choice.
  s = s.replace(/ou|oy/g, "u").replace(/oi|ei/g, "i").replace(/ai/g, "e");

  s = s.replace(/y/g, "i").replace(/h/g, "i");
  s = s.replace(/(.)\1+/g, "$1"); // doubled consonants carry no information here
  return s.replace(/[^a-z0-9]/g, "");
}

/** Standard Levenshtein, iterative two-row. Names are short; this is not hot. */
export function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  let curr = new Array<number>(b.length + 1);

  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1]! + 1, prev[j]! + 1, prev[j - 1]! + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[b.length]!;
}

export const NEAR_DUPLICATE_THRESHOLD = 2;

export interface NameCandidate {
  id: string;
  displayName: string;
  normalizedName: string;
}

/**
 * Closest existing name within the threshold, or null. An exact normalized match
 * returns distance 0 — the caller should reuse that person outright.
 */
export function findNearDuplicate(
  input: string,
  candidates: readonly NameCandidate[],
): { candidate: NameCandidate; distance: number } | null {
  const target = normalizeName(input);
  if (!target) return null;

  let best: { candidate: NameCandidate; distance: number } | null = null;
  for (const candidate of candidates) {
    const distance = editDistance(target, candidate.normalizedName);
    if (distance <= NEAR_DUPLICATE_THRESHOLD && (best === null || distance < best.distance)) {
      best = { candidate, distance };
    }
  }
  return best;
}
