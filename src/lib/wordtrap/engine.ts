import { chooseVote, imposterClue, imposterGuess, innocentClue, mulberry32 } from "./bots.ts";
import { cardById, wordsInCategory, WORDS, type WordCard } from "./words.ts";

export type Phase = "lobby" | "reveal" | "describe" | "vote" | "guess" | "resolve" | "tiebreak" | "podium";
export type HintMode = "decoy" | "category";
export type ResultKind = "caught-miss" | "caught-steal" | "escaped" | "stalemate";

export interface Settings {
  rounds: number;
  speakerSeconds: number;
  voteSeconds: number;
  revealSeconds: number;
  guessSeconds: number;
  resolveSeconds: number;
  hint: HintMode;
  seats: number;
}

export const DEFAULT_SETTINGS: Settings = {
  rounds: 3,
  speakerSeconds: 24,
  voteSeconds: 22,
  revealSeconds: 14,
  guessSeconds: 20,
  resolveSeconds: 9,
  hint: "decoy",
  seats: 4,
};

export interface RoundResult {
  kind: ResultKind;
  imposterId: string;
  imposterName: string;
  word: string;
  decoy: string;
  category: string;
  votes: { voterId: string; voterName: string; targetId: string | null; targetName: string | null }[];
  deltas: { playerId: string; name: string; delta: number }[];
  guess: string | null;
}

export interface FeedItem {
  id: number;
  kind: "chat" | "system";
  name?: string;
  text: string;
}

export interface SeatView {
  id: string;
  name: string;
  isBot: boolean;
  connected: boolean;
  score: number;
  isHost: boolean;
  isYou: boolean;
  ready: boolean;
  hasVoted: boolean;
  isSpeaker: boolean;
}

export interface ClueView {
  playerId: string;
  name: string;
  text: string;
  timedOut: boolean;
}

export interface TableView {
  phase: Phase;
  settings: Settings;
  seats: SeatView[];
  hostId: string;
  youId: string;
  yourRole: "innocent" | "imposter" | null;
  yourWord: string | null;
  yourHint: string | null;
  category: string | null;
  round: number;
  speakerIndex: number;
  speakerOrder: string[];
  clues: ClueView[];
  phaseDeadline: number;
  feed: FeedItem[];
  banner: string;
  lastResult: RoundResult | null;
  tieStreak: number;
  youAreHost: boolean;
  yourVote: string | null;
  revision: number;
  chatOpen: boolean;
  wordRevealed: boolean;
}

interface Player {
  id: string;
  name: string;
  isBot: boolean;
  connected: boolean;
  score: number;
  joinOrder: number;
}

interface Clue {
  playerId: string;
  text: string;
  timedOut: boolean;
}

interface Secret {
  word: WordCard;
  decoy: WordCard;
  imposterId: string;
}

interface BotJob {
  id: string;
  at: number;
  kind: "clue" | "vote" | "guess";
}

export type Action =
  | { type: "join"; id: string; name: string; isBot?: boolean }
  | { type: "reconnect"; id: string }
  | { type: "leave"; id: string }
  | { type: "transferHost"; by: string; to: string }
  | { type: "configure"; by: string; patch: Partial<Settings> }
  | { type: "fill"; by: string }
  | { type: "removeBot"; by: string; id: string }
  | { type: "start"; by: string }
  | { type: "ready"; id: string }
  | { type: "clue"; id: string; text: string }
  | { type: "vote"; id: string; targetId: string }
  | { type: "guess"; id: string; text: string }
  | { type: "chat"; id: string; text: string }
  | { type: "again"; by: string };

export interface SealedMatch {
  settings: Settings;
  players: Player[];
  hostId: string;
  phase: Phase;
  round: number;
  tieStreak: number;
  secret: { wordId: string; decoyId: string; imposterId: string } | null;
  usedWordIds: string[];
  speakerOrder: string[];
  speakerIndex: number;
  clues: Clue[];
  ready: string[];
  votes: Record<string, string>;
  phaseDeadline: number;
  feed: FeedItem[];
  feedSeq: number;
  banner: string;
  lastResult: RoundResult | null;
  lastChatAt: Record<string, number>;
  botQueue: BotJob[];
  rng: number;
  revision: number;
  joinSeq: number;
}

const CHAT_COOLDOWN_MS = 2000;
const MAX_TIES = 2;
const BOT_NAMES = ["Mara", "Jules", "Kenji", "Noor", "Ivo", "Sable", "Quinn", "Ren"];

export interface ActResult {
  ok: boolean;
  error?: string;
}

function cleanName(name: string): string {
  const trimmed = name.replace(/\s+/g, " ").trim().slice(0, 16);
  return trimmed.length > 0 ? trimmed : "Player";
}

export function normalizeToken(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function wordMatch(guess: string, word: string): boolean {
  const g = normalizeToken(guess);
  const w = normalizeToken(word);
  if (!g || !w) return false;
  if (g === w || g.includes(w)) return true;
  if (g.length >= w.length - 1 && w.includes(g)) return true;
  return w.length >= 5 && levenshtein(g, w) <= 1;
}

function containsSecret(text: string, word: string): boolean {
  const w = normalizeToken(word);
  return w.length >= 3 && normalizeToken(text).includes(w);
}

function levenshtein(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0]!;
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cur = row[j]!;
      row[j] = a[i - 1] === b[j - 1] ? prev : 1 + Math.min(prev, row[j]!, row[j - 1]!);
      prev = cur;
    }
  }
  return row[b.length]!;
}

function clampSettings(patch: Partial<Settings>, base: Settings): Settings {
  const rounds = patch.rounds ?? base.rounds;
  const seats = patch.seats ?? base.seats;
  const hint = patch.hint ?? base.hint;
  return {
    rounds: rounds === 5 || rounds === 7 ? rounds : 3,
    seats: Math.min(6, Math.max(3, Math.round(seats))),
    speakerSeconds: clamp(patch.speakerSeconds ?? base.speakerSeconds, 12, 40),
    voteSeconds: clamp(patch.voteSeconds ?? base.voteSeconds, 12, 40),
    revealSeconds: clamp(patch.revealSeconds ?? base.revealSeconds, 8, 25),
    guessSeconds: clamp(patch.guessSeconds ?? base.guessSeconds, 12, 35),
    resolveSeconds: base.resolveSeconds,
    hint: hint === "category" ? "category" : "decoy",
  };
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(n)));
}

export class Table {
  private settings: Settings;
  private players: Player[] = [];
  private hostId = "";
  private phase: Phase = "lobby";
  private round = 0;
  private tieStreak = 0;
  private secret: Secret | null = null;
  private usedWordIds: string[] = [];
  private speakerOrder: string[] = [];
  private speakerIndex = 0;
  private clues: Clue[] = [];
  private ready = new Set<string>();
  private votes: Record<string, string> = {};
  private phaseDeadline = 0;
  private feed: FeedItem[] = [];
  private feedSeq = 1;
  private banner = "Set the table, then deal the first word.";
  private lastResult: RoundResult | null = null;
  private lastChatAt: Record<string, number> = {};
  private botQueue: BotJob[] = [];
  private rng: ReturnType<typeof mulberry32>;
  private revision = 1;
  private joinSeq = 1;

  constructor(opts?: { seed?: number; settings?: Partial<Settings> }) {
    this.rng = mulberry32(opts?.seed ?? 1);
    this.settings = clampSettings(opts?.settings ?? {}, DEFAULT_SETTINGS);
  }

  view(youId: string): TableView {
    const you = this.players.find((p) => p.id === youId);
    const role = this.roleOf(youId);
    const showSecret = this.phase === "resolve" || this.phase === "podium";
    const inRound = this.phase !== "lobby" && this.phase !== "podium";
    return {
      phase: this.phase,
      settings: this.settings,
      seats: this.players.map((p) => ({
        id: p.id,
        name: p.name,
        isBot: p.isBot,
        connected: p.connected,
        score: p.score,
        isHost: p.id === this.hostId,
        isYou: p.id === youId,
        ready: this.ready.has(p.id),
        hasVoted: this.votes[p.id] !== undefined,
        isSpeaker: this.phase === "describe" && this.speakerOrder[this.speakerIndex] === p.id,
      })),
      hostId: this.hostId,
      youId,
      yourRole: inRound && role ? role : null,
      yourWord: inRound && role === "innocent" ? (this.secret?.word.word ?? null) : null,
      yourHint:
        inRound && role === "imposter"
          ? this.settings.hint === "decoy"
            ? (this.secret?.decoy.word ?? null)
            : null
          : null,
      category: inRound ? (this.secret?.word.category ?? null) : null,
      round: this.round,
      speakerIndex: this.speakerIndex,
      speakerOrder: [...this.speakerOrder],
      clues: this.clues.map((clue) => ({
        playerId: clue.playerId,
        name: this.nameOf(clue.playerId),
        text: clue.text,
        timedOut: clue.timedOut,
      })),
      phaseDeadline: this.phaseDeadline,
      feed: this.feed.slice(-24),
      banner: this.banner,
      lastResult: showSecret ? this.lastResult : this.phase === "tiebreak" ? null : null,
      tieStreak: this.tieStreak,
      youAreHost: youId === this.hostId,
      yourVote: this.votes[youId] ?? null,
      revision: this.revision,
      chatOpen: this.phase === "lobby" || this.phase === "resolve" || this.phase === "podium",
      wordRevealed: showSecret,
    };
  }

  /** Result is only public once the round is over. The tiebreak hides it. */
  resultIfPublic(): RoundResult | null {
    if (this.phase === "resolve" || this.phase === "podium") return this.lastResult;
    return null;
  }

  act(action: Action, now: number): ActResult {
    const result = this.apply(action, now);
    if (result.ok) this.after(now);
    return result;
  }

  tick(now: number): void {
    for (let i = 0; i < 16; i++) {
      const before = this.revision;
      this.applyDeadline(now);
      this.applyDueBots(now);
      if (this.revision === before) break;
    }
  }

  seal(): SealedMatch {
    return {
      settings: this.settings,
      players: this.players.map((p) => ({ ...p })),
      hostId: this.hostId,
      phase: this.phase,
      round: this.round,
      tieStreak: this.tieStreak,
      secret: this.secret
        ? { wordId: this.secret.word.id, decoyId: this.secret.decoy.id, imposterId: this.secret.imposterId }
        : null,
      usedWordIds: [...this.usedWordIds],
      speakerOrder: [...this.speakerOrder],
      speakerIndex: this.speakerIndex,
      clues: this.clues.map((c) => ({ ...c })),
      ready: [...this.ready],
      votes: { ...this.votes },
      phaseDeadline: this.phaseDeadline,
      feed: this.feed.map((f) => ({ ...f })),
      feedSeq: this.feedSeq,
      banner: this.banner,
      lastResult: this.lastResult,
      lastChatAt: { ...this.lastChatAt },
      botQueue: this.botQueue.map((b) => ({ ...b })),
      rng: this.rng.state(),
      revision: this.revision,
      joinSeq: this.joinSeq,
    };
  }

  static restore(sealed: SealedMatch): Table {
    const table = new Table({ seed: 1 });
    table.settings = clampSettings(sealed.settings, DEFAULT_SETTINGS);
    table.players = sealed.players.map((p) => ({ ...p }));
    table.hostId = sealed.hostId;
    table.phase = sealed.phase;
    table.round = sealed.round;
    table.tieStreak = sealed.tieStreak;
    const word = sealed.secret ? cardById(sealed.secret.wordId) : undefined;
    const decoy = sealed.secret ? cardById(sealed.secret.decoyId) : undefined;
    table.secret = word && decoy && sealed.secret ? { word, decoy, imposterId: sealed.secret.imposterId } : null;
    table.usedWordIds = [...sealed.usedWordIds];
    table.speakerOrder = [...sealed.speakerOrder];
    table.speakerIndex = sealed.speakerIndex;
    table.clues = sealed.clues.map((c) => ({ ...c }));
    table.ready = new Set(sealed.ready);
    table.votes = { ...sealed.votes };
    table.phaseDeadline = sealed.phaseDeadline;
    table.feed = sealed.feed.map((f) => ({ ...f }));
    table.feedSeq = sealed.feedSeq;
    table.banner = sealed.banner;
    table.lastResult = sealed.lastResult;
    table.lastChatAt = { ...sealed.lastChatAt };
    table.botQueue = sealed.botQueue.map((b) => ({ ...b }));
    table.rng.set(sealed.rng);
    table.revision = sealed.revision;
    table.joinSeq = sealed.joinSeq;
    return table;
  }

  private apply(action: Action, now: number): ActResult {
    switch (action.type) {
      case "join":
        return this.join(action.id, action.name, Boolean(action.isBot), now);
      case "reconnect":
        return this.reconnect(action.id);
      case "leave":
        return this.leave(action.id);
      case "transferHost":
        return this.transfer(action.by, action.to);
      case "configure":
        return this.configure(action.by, action.patch);
      case "fill":
        return this.fill(action.by);
      case "removeBot":
        return this.removeBot(action.by, action.id);
      case "start":
        return this.start(action.by, now);
      case "ready":
        return this.readyUp(action.id, now);
      case "clue":
        return this.submitClue(action.id, action.text, false, now);
      case "vote":
        return this.castVote(action.id, action.targetId, now);
      case "guess":
        return this.submitGuess(action.id, action.text, now);
      case "chat":
        return this.chat(action.id, action.text, now);
      case "again":
        return this.again(action.by);
      default:
        return { ok: false, error: "Unknown action." };
    }
  }

  private after(now: number): void {
    this.tick(now);
  }

  private join(id: string, name: string, isBot: boolean, _now: number): ActResult {
    if (this.players.some((p) => p.id === id)) return this.reconnect(id);
    if (this.phase !== "lobby") return { ok: false, error: "This table is already mid-round." };
    if (this.players.length >= 6) return { ok: false, error: "The table is full." };
    const player: Player = {
      id,
      name: cleanName(name),
      isBot,
      connected: true,
      score: 0,
      joinOrder: this.joinSeq++,
    };
    this.players.push(player);
    if (!this.hostId) this.hostId = id;
    this.say("system", `${player.name} sits down.`);
    this.touch();
    return { ok: true };
  }

  private reconnect(id: string): ActResult {
    const player = this.players.find((p) => p.id === id);
    if (!player) return { ok: false, error: "No seat saved for you at this table." };
    player.connected = true;
    if (!this.players.some((p) => p.connected && p.id === this.hostId)) this.promoteHost();
    this.say("system", `${player.name} is back.`);
    this.touch();
    return { ok: true };
  }

  private leave(id: string): ActResult {
    const player = this.players.find((p) => p.id === id);
    if (!player) return { ok: false, error: "That seat is empty." };
    if (this.phase === "lobby") {
      this.players = this.players.filter((p) => p.id !== id);
      if (this.hostId === id) this.promoteHost();
      this.touch();
      return { ok: true };
    }
    player.connected = false;
    if (this.hostId === id) this.promoteHost();
    this.say("system", `${player.name} dropped. Their seat is held.`);
    this.touch();
    return { ok: true };
  }

  private promoteHost(): void {
    const humans = this.players.filter((p) => p.connected && !p.isBot).sort((a, b) => a.joinOrder - b.joinOrder);
    const anyone = this.players.filter((p) => p.connected).sort((a, b) => a.joinOrder - b.joinOrder);
    const next = humans[0] ?? anyone[0];
    this.hostId = next?.id ?? "";
    if (next) this.say("system", `${next.name} takes the host chair.`);
  }

  private transfer(by: string, to: string): ActResult {
    if (by !== this.hostId) return { ok: false, error: "Only the host can pass the chair." };
    const target = this.players.find((p) => p.id === to && p.connected);
    if (!target) return { ok: false, error: "That player is not at the table." };
    this.hostId = target.id;
    this.say("system", `${target.name} is now host.`);
    this.touch();
    return { ok: true };
  }

  private configure(by: string, patch: Partial<Settings>): ActResult {
    if (by !== this.hostId) return { ok: false, error: "Only the host can change the rules." };
    if (this.phase !== "lobby") return { ok: false, error: "Rules lock once a round starts." };
    this.settings = clampSettings(patch, this.settings);
    this.trimBots();
    this.touch();
    return { ok: true };
  }

  private fill(by: string): ActResult {
    if (by !== this.hostId) return { ok: false, error: "Only the host can seat bots." };
    if (this.phase !== "lobby") return { ok: false, error: "Wait for the lobby." };
    this.fillBots();
    this.touch();
    return { ok: true };
  }

  private removeBot(by: string, id: string): ActResult {
    if (by !== this.hostId) return { ok: false, error: "Only the host can dismiss a bot." };
    if (this.phase !== "lobby") return { ok: false, error: "Bots stay until the match ends." };
    const bot = this.players.find((p) => p.id === id && p.isBot);
    if (!bot) return { ok: false, error: "That is not a bot." };
    this.players = this.players.filter((p) => p.id !== id);
    this.touch();
    return { ok: true };
  }

  private start(by: string, now: number): ActResult {
    if (by !== this.hostId) return { ok: false, error: "Only the host can deal." };
    if (this.phase !== "lobby") return { ok: false, error: "A round is already running." };
    this.fillBots();
    const living = this.players.filter((p) => p.connected);
    if (living.length < 3) return { ok: false, error: "WordTrap needs at least three players." };
    for (const p of this.players) p.score = 0;
    this.round = 0;
    this.tieStreak = 0;
    this.usedWordIds = [];
    this.lastResult = null;
    this.deal(now, false);
    return { ok: true };
  }

  private again(by: string): ActResult {
    if (by !== this.hostId) return { ok: false, error: "Only the host can clear the table." };
    if (this.phase !== "podium") return { ok: false, error: "Finish the match first." };
    this.phase = "lobby";
    this.secret = null;
    this.clues = [];
    this.votes = {};
    this.ready.clear();
    this.speakerOrder = [];
    this.lastResult = null;
    this.banner = "Same seats. Deal whenever you are ready.";
    this.phaseDeadline = 0;
    this.touch();
    return { ok: true };
  }

  private readyUp(id: string, now: number): ActResult {
    if (this.phase !== "reveal") return { ok: false, error: "Nothing to lock in yet." };
    const player = this.livingPlayer(id);
    if (!player) return { ok: false, error: "You are not in this round." };
    this.ready.add(id);
    this.touch();
    if (this.humansReady()) this.enterDescribe(now);
    return { ok: true };
  }

  private submitClue(id: string, text: string, timedOut: boolean, now: number): ActResult {
    if (this.phase !== "describe") return { ok: false, error: "It is not time to describe." };
    if (this.speakerOrder[this.speakerIndex] !== id) return { ok: false, error: "Wait for your turn." };
    const player = this.livingPlayer(id);
    if (!player) return { ok: false, error: "You are not in this round." };
    const secret = this.secret;
    if (!secret) return { ok: false, error: "No word is dealt." };
    const spoken = timedOut ? "…" : text.replace(/\s+/g, " ").trim().slice(0, 48);
    if (!timedOut && spoken.length < 2) return { ok: false, error: "Give a real clue, or pass." };
    if (!timedOut && containsSecret(spoken, secret.word.word)) {
      return { ok: false, error: "That clue is too close to the secret word." };
    }
    this.clues.push({ playerId: id, text: spoken, timedOut });
    this.touch();
    this.advanceSpeaker(now);
    return { ok: true };
  }

  private castVote(id: string, targetId: string, now: number): ActResult {
    if (this.phase !== "vote") return { ok: false, error: "Voting is closed." };
    const player = this.livingPlayer(id);
    if (!player) return { ok: false, error: "You cannot vote from outside the round." };
    if (id === targetId) return { ok: false, error: "You cannot vote for yourself." };
    const target = this.players.find((p) => p.id === targetId);
    if (!target) return { ok: false, error: "That seat is not at the table." };
    this.votes[id] = targetId;
    this.touch();
    if (this.everyoneVoted()) this.resolveVote(now);
    return { ok: true };
  }

  private submitGuess(id: string, text: string, now: number): ActResult {
    if (this.phase !== "guess") return { ok: false, error: "Nobody is guessing right now." };
    const secret = this.secret;
    if (!secret || secret.imposterId !== id) return { ok: false, error: "Only the imposter may guess." };
    if (!this.livingPlayer(id) && !this.players.some((p) => p.id === id)) {
      return { ok: false, error: "You are not in this round." };
    }
    const guess = text.replace(/\s+/g, " ").trim().slice(0, 32);
    if (guess.length < 2) return { ok: false, error: "Type a word." };
    const stole = wordMatch(guess, secret.word.word);
    this.finishRound(stole ? "caught-steal" : "caught-miss", guess, now);
    return { ok: true };
  }

  private chat(id: string, text: string, now: number): ActResult {
    const player = this.players.find((p) => p.id === id && p.connected);
    if (!player) return { ok: false, error: "Join the table before chatting." };
    if (this.phase !== "lobby" && this.phase !== "resolve" && this.phase !== "podium") {
      return { ok: false, error: "Chat is sealed while the round is live." };
    }
    const previous = this.lastChatAt[id] ?? -Infinity;
    if (now - previous < CHAT_COOLDOWN_MS) return { ok: false, error: "Slow down a moment." };
    let body = text.replace(/\s+/g, " ").trim().slice(0, 80);
    if (body.length < 1) return { ok: false, error: "Empty message." };
    if (this.secret && this.phase !== "podium") {
      const token = normalizeToken(this.secret.word.word);
      if (token && normalizeToken(body).includes(token)) body = body.replace(new RegExp(this.secret.word.word, "ig"), "▒▒▒");
    }
    this.lastChatAt[id] = now;
    this.say("chat", body, player.name);
    this.touch();
    return { ok: true };
  }

  private applyDeadline(now: number): void {
    if (this.phaseDeadline <= 0 || now < this.phaseDeadline) return;
    if (this.phase === "reveal") this.enterDescribe(now);
    else if (this.phase === "describe") {
      const id = this.speakerOrder[this.speakerIndex];
      if (id) this.submitClue(id, "", true, now);
    } else if (this.phase === "vote") this.resolveVote(now);
    else if (this.phase === "guess") {
      const id = this.secret?.imposterId;
      if (id) this.finishRound("caught-miss", null, now);
    } else if (this.phase === "resolve" || this.phase === "tiebreak") this.advanceAfterResolve(now);
  }

  private applyDueBots(now: number): void {
    const due = this.botQueue.filter((job) => job.at <= now);
    if (due.length === 0) return;
    this.botQueue = this.botQueue.filter((job) => job.at > now);
    const secret = this.secret;
    for (const job of due) {
      if (job.kind === "clue" && this.phase === "describe" && this.speakerOrder[this.speakerIndex] === job.id && secret) {
        const text = this.botClue(job.id, secret);
        this.submitClue(job.id, text, false, now);
      } else if (job.kind === "vote" && this.phase === "vote" && this.votes[job.id] === undefined && secret) {
        const target = chooseVote({
          selfId: job.id,
          isImposter: secret.imposterId === job.id,
          seatIds: this.players.map((p) => p.id),
          clues: this.clues,
          truth: secret.word,
          decoy: secret.decoy,
          category: secret.word.category,
          rng: () => this.rng.next(),
        });
        if (target !== job.id) this.castVote(job.id, target, now);
      } else if (job.kind === "guess" && this.phase === "guess" && secret?.imposterId === job.id) {
        const guess = imposterGuess(wordsInCategory(secret.word.category), secret.decoy.id, () => this.rng.next());
        this.submitGuess(job.id, guess, now);
      }
    }
  }

  private botClue(id: string, secret: Secret): string {
    const used = this.clues.map((c) => c.text);
    const rng = () => this.rng.next();
    const text =
      secret.imposterId === id
        ? imposterClue({
            hint: this.settings.hint,
            decoy: secret.decoy,
            category: secret.word.category,
            used,
            rng,
          })
        : innocentClue(secret.word, used, rng);
    return containsSecret(text, secret.word.word) ? "hard to describe" : text;
  }

  private deal(now: number, keepImposter: boolean): void {
    const living = this.players.filter((p) => p.connected);
    const previous = keepImposter ? this.secret?.imposterId : undefined;
    const imposter =
      previous && living.some((p) => p.id === previous)
        ? previous
        : living[Math.floor(this.rng.next() * living.length)]!.id;
    const card = this.drawWord();
    const siblings = wordsInCategory(card.category).filter((w) => w.id !== card.id);
    const decoy = siblings[Math.floor(this.rng.next() * siblings.length)] ?? card;
    this.secret = { word: card, decoy, imposterId: imposter };
    this.speakerOrder = this.shuffle(living.map((p) => p.id));
    this.speakerIndex = 0;
    this.clues = [];
    this.votes = {};
    this.ready = new Set(living.filter((p) => p.isBot).map((p) => p.id));
    if (!keepImposter) {
      this.round += 1;
      this.tieStreak = 0;
    }
    this.phase = "reveal";
    this.phaseDeadline = now + this.settings.revealSeconds * 1000;
    this.banner = keepImposter
      ? `Deadlock. Same imposter. Round ${this.round} is dealt again.`
      : `Round ${this.round} of ${this.settings.rounds}. Read your card.`;
    this.botQueue = [];
    this.say("system", this.banner);
    this.touch();
    if (this.humansReady()) this.enterDescribe(now);
  }

  private drawWord(): WordCard {
    const open = WORDS.filter((card) => !this.usedWordIds.includes(card.id));
    const pool = open.length > 0 ? open : WORDS;
    const card = pool[Math.floor(this.rng.next() * pool.length)]!;
    if (!this.usedWordIds.includes(card.id)) this.usedWordIds.push(card.id);
    return card;
  }

  private enterDescribe(now: number): void {
    if (!this.secret) return;
    this.phase = "describe";
    this.speakerIndex = 0;
    this.banner = `${this.nameOf(this.speakerOrder[0] ?? "")} describes first.`;
    this.armSpeaker(now);
    this.touch();
  }

  private advanceSpeaker(now: number): void {
    this.speakerIndex += 1;
    if (this.speakerIndex >= this.speakerOrder.length) {
      this.enterVote(now);
      return;
    }
    this.banner = `${this.nameOf(this.speakerOrder[this.speakerIndex] ?? "")} describes.`;
    this.armSpeaker(now);
    this.touch();
  }

  private armSpeaker(now: number): void {
    this.phaseDeadline = now + this.settings.speakerSeconds * 1000;
    this.botQueue = this.botQueue.filter((job) => job.kind !== "clue");
    const id = this.speakerOrder[this.speakerIndex];
    const speaker = this.players.find((p) => p.id === id);
    if (speaker?.isBot) {
      this.botQueue.push({ id: speaker.id, at: now + 1100 + this.rng.next() * 2600, kind: "clue" });
    }
  }

  private enterVote(now: number): void {
    this.phase = "vote";
    this.votes = {};
    this.phaseDeadline = now + this.settings.voteSeconds * 1000;
    this.banner = "Vote for the imposter. A tie resets the word, not the liar.";
    this.botQueue = [];
    const bots = this.players.filter((p) => p.isBot && p.connected);
    bots.forEach((bot, index) => {
      this.botQueue.push({
        id: bot.id,
        at: now + 800 + index * 650 + this.rng.next() * 900,
        kind: "vote",
      });
    });
    this.touch();
  }

  private resolveVote(now: number): void {
    if (this.phase !== "vote" || !this.secret) return;
    const tally = new Map<string, number>();
    for (const target of Object.values(this.votes)) tally.set(target, (tally.get(target) ?? 0) + 1);
    let top = 0;
    for (const count of tally.values()) top = Math.max(top, count);
    const leaders = [...tally.entries()].filter(([, count]) => count === top && top > 0).map(([id]) => id);
    if (leaders.length !== 1) {
      this.tieStreak += 1;
      if (this.tieStreak > MAX_TIES) {
        this.finishRound("stalemate", null, now);
        return;
      }
      this.phase = "tiebreak";
      this.phaseDeadline = now + 3200;
      this.banner = "Tie. The round replays with the same imposter.";
      this.botQueue = [];
      this.say("system", this.banner);
      this.touch();
      return;
    }
    const accused = leaders[0]!;
    if (accused === this.secret.imposterId) {
      this.phase = "guess";
      this.phaseDeadline = now + this.settings.guessSeconds * 1000;
      this.banner = `${this.nameOf(accused)} was caught. One guess at the word.`;
      this.botQueue = [];
      const imposter = this.players.find((p) => p.id === accused);
      if (imposter?.isBot) {
        this.botQueue.push({ id: accused, at: now + 1400 + this.rng.next() * 1800, kind: "guess" });
      }
      this.touch();
      return;
    }
    this.finishRound("escaped", null, now);
  }

  private finishRound(kind: ResultKind, guess: string | null, now: number): void {
    const secret = this.secret;
    if (!secret) return;
    const deltas = new Map<string, number>();
    for (const p of this.players) deltas.set(p.id, 0);
    if (kind === "escaped") deltas.set(secret.imposterId, 2);
    else if (kind === "caught-steal") deltas.set(secret.imposterId, 2);
    else if (kind === "caught-miss") {
      for (const p of this.players) if (p.id !== secret.imposterId) deltas.set(p.id, 1);
    }
    for (const p of this.players) p.score += deltas.get(p.id) ?? 0;
    const votes = this.players.map((p) => {
      const targetId = this.votes[p.id] ?? null;
      return {
        voterId: p.id,
        voterName: p.name,
        targetId,
        targetName: targetId ? this.nameOf(targetId) : null,
      };
    });
    this.lastResult = {
      kind,
      imposterId: secret.imposterId,
      imposterName: this.nameOf(secret.imposterId),
      word: secret.word.word,
      decoy: secret.decoy.word,
      category: secret.word.category,
      votes,
      deltas: this.players.map((p) => ({ playerId: p.id, name: p.name, delta: deltas.get(p.id) ?? 0 })),
      guess,
    };
    this.phase = "resolve";
    this.phaseDeadline = now + this.settings.resolveSeconds * 1000;
    this.botQueue = [];
    this.banner =
      kind === "escaped"
        ? `${this.lastResult.imposterName} walked. The word was ${secret.word.word}.`
        : kind === "caught-steal"
          ? `${this.lastResult.imposterName} guessed ${secret.word.word} and stole the round.`
          : kind === "caught-miss"
            ? `${this.lastResult.imposterName} missed. Innocents score.`
            : `Two ties. The round is a stalemate. The word was ${secret.word.word}.`;
    this.say("system", this.banner);
    this.touch();
  }

  private advanceAfterResolve(now: number): void {
    if (this.phase === "tiebreak") {
      this.deal(now, true);
      return;
    }
    if (this.round >= this.settings.rounds) {
      this.phase = "podium";
      this.phaseDeadline = 0;
      this.banner = "Match over.";
      this.botQueue = [];
      this.touch();
      return;
    }
    this.deal(now, false);
  }

  private humansReady(): boolean {
    const humans = this.players.filter((p) => p.connected && !p.isBot);
    return humans.every((p) => this.ready.has(p.id));
  }

  private everyoneVoted(): boolean {
    return this.players.filter((p) => p.connected).every((p) => this.votes[p.id] !== undefined);
  }

  private fillBots(): void {
    while (this.players.length < this.settings.seats) {
      const name = BOT_NAMES.find((n) => !this.players.some((p) => p.name === n)) ?? `Bot ${this.players.length + 1}`;
      this.players.push({
        id: `bot-${name.toLowerCase()}-${this.joinSeq}`,
        name,
        isBot: true,
        connected: true,
        score: 0,
        joinOrder: this.joinSeq++,
      });
    }
  }

  private trimBots(): void {
    while (this.players.length > this.settings.seats) {
      const index = [...this.players].reverse().findIndex((p) => p.isBot);
      if (index < 0) break;
      const real = this.players.length - 1 - index;
      this.players.splice(real, 1);
    }
  }

  private livingPlayer(id: string): Player | undefined {
    return this.players.find((p) => p.id === id && p.connected);
  }

  private roleOf(id: string): "innocent" | "imposter" | null {
    if (!this.secret || this.phase === "lobby") return null;
    if (!this.players.some((p) => p.id === id)) return null;
    return this.secret.imposterId === id ? "imposter" : "innocent";
  }

  private nameOf(id: string): string {
    return this.players.find((p) => p.id === id)?.name ?? "Empty";
  }

  private shuffle(ids: string[]): string[] {
    const copy = [...ids];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(this.rng.next() * (i + 1));
      const tmp = copy[i]!;
      copy[i] = copy[j]!;
      copy[j] = tmp;
    }
    return copy;
  }

  private say(kind: "chat" | "system", text: string, name?: string): void {
    this.feed.push({ id: this.feedSeq++, kind, text, name });
    if (this.feed.length > 40) this.feed.splice(0, this.feed.length - 40);
  }

  private touch(): void {
    this.revision += 1;
  }
}
