let ctx: AudioContext | null = null;
let muted = false;

export function isMuted(): boolean {
  return muted;
}

export function setMuted(next: boolean): void {
  muted = next;
}

export function unlockAudio(): void {
  const Ctx = window.AudioContext;
  if (!Ctx) return;
  if (!ctx) ctx = new Ctx();
  if (ctx.state === "suspended") void ctx.resume();
}

function tone(freq: number, duration: number, gain: number, type: OscillatorType, delay = 0): void {
  if (!ctx || muted || ctx.state !== "running") return;
  const start = ctx.currentTime + delay;
  const osc = ctx.createOscillator();
  const amp = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  amp.gain.setValueAtTime(0.0001, start);
  amp.gain.exponentialRampToValueAtTime(gain, start + 0.02);
  amp.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  osc.connect(amp);
  amp.connect(ctx.destination);
  osc.start(start);
  osc.stop(start + duration + 0.02);
}

export function playCue(kind: "deal" | "clue" | "vote" | "warn" | "catch" | "steal" | "escape" | "ui"): void {
  if (kind === "deal") {
    tone(220, 0.12, 0.05, "triangle");
    tone(330, 0.16, 0.04, "triangle", 0.08);
  } else if (kind === "clue") tone(520, 0.08, 0.04, "sine");
  else if (kind === "vote") tone(180, 0.14, 0.06, "sine");
  else if (kind === "warn") tone(760, 0.05, 0.03, "square");
  else if (kind === "catch") {
    tone(196, 0.2, 0.06, "sawtooth");
    tone(155, 0.28, 0.05, "triangle", 0.12);
  } else if (kind === "steal") {
    tone(392, 0.12, 0.05, "triangle");
    tone(523, 0.16, 0.05, "triangle", 0.1);
    tone(659, 0.22, 0.04, "triangle", 0.2);
  } else if (kind === "escape") tone(146, 0.3, 0.05, "triangle");
  else tone(640, 0.05, 0.03, "sine");
}
