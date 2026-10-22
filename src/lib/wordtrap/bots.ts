import { CATEGORY_BLUFFS, type WordCard } from "./words.ts";

export function mulberry32(seed: number): { next: () => number; state: () => number; set: (n: number) => void } {
  let a = seed >>> 0;
  return {
    next() {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
    state: () => a >>> 0,
    set(n: number) {
      a = n >>> 0;
    },
  };
}

function pick<T>(items: readonly T[], rng: () => number): T {
  return items[Math.floor(rng() * items.length)]!;
}

function fresh(clues: readonly string[], used: readonly string[], rng: () => number): string {
  const open = clues.filter((clue) => !used.some((u) => u.toLowerCase() === clue.toLowerCase()));
  return pick(open.length > 0 ? open : clues, rng);
}

export function innocentClue(word: WordCard, used: readonly string[], rng: () => number): string {
  return fresh(word.clues, used, rng);
}

export function imposterClue(args: {
  hint: "decoy" | "category";
  decoy: WordCard | null;
  category: string;
  used: readonly string[];
  rng: () => number;
}): string {
  if (args.hint === "decoy" && args.decoy) return fresh(args.decoy.clues, args.used, args.rng);
  const bluffs = CATEGORY_BLUFFS[args.category] ?? ["hard to pin down", "pretty ordinary", "you know the one"];
  return fresh(bluffs, args.used, args.rng);
}

function suspicion(clue: string, truth: WordCard, decoy: WordCard | null, category: string): number {
  const text = clue.trim().toLowerCase();
  if (!text || text === "…" || text === "...") return 0.92;
  let score = 0.34;
  if (truth.clues.some((c) => text.includes(c.toLowerCase()) || c.toLowerCase().includes(text))) score -= 0.22;
  if (decoy && decoy.clues.some((c) => text.includes(c.toLowerCase()) || c.toLowerCase().includes(text))) score += 0.48;
  const bluffs = CATEGORY_BLUFFS[category] ?? [];
  if (bluffs.some((c) => text.includes(c.toLowerCase()) || c.toLowerCase().includes(text))) score += 0.28;
  if (text.length < 8) score += 0.08;
  return Math.min(0.95, Math.max(0.05, score));
}

export function chooseVote(args: {
  selfId: string;
  isImposter: boolean;
  seatIds: readonly string[];
  clues: readonly { playerId: string; text: string }[];
  truth: WordCard;
  decoy: WordCard | null;
  category: string;
  rng: () => number;
}): string {
  const others = args.seatIds.filter((id) => id !== args.selfId);
  if (others.length === 0) return args.selfId;
  if (args.isImposter) return pick(others, args.rng);
  const weights = others.map((id) => {
    const clue = args.clues.find((c) => c.playerId === id)?.text ?? "";
    return suspicion(clue, args.truth, args.decoy, args.category);
  });
  const total = weights.reduce((sum, w) => sum + w, 0);
  let roll = args.rng() * total;
  for (let i = 0; i < others.length; i++) {
    roll -= weights[i]!;
    if (roll <= 0) return others[i]!;
  }
  return others[others.length - 1]!;
}

export function imposterGuess(categoryWords: readonly WordCard[], decoyId: string, rng: () => number): string {
  const options = categoryWords.filter((card) => card.id !== decoyId);
  const pool = options.length > 0 ? options : categoryWords;
  return pick(pool, rng).word;
}
