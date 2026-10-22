import { useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { playCue, unlockAudio } from "@/lib/wordtrap/audio";
import { Table, type Action, type Phase, type TableView } from "@/lib/wordtrap/engine";
import { loadName, loadPlayerId, saveName } from "@/lib/wordtrap/id";
import { RoomTable } from "./room";
import { TableScreen } from "./screen";

const RULES = [
  ["Deal", "Everyone but one sees the same word. The imposter gets a cover word, or only the category."],
  ["Clues", "You speak in order, on a timer. The secret word is rejected if you try to say it."],
  ["Vote", "A single leader is accused. A tie throws the word out and keeps the same imposter."],
  ["Steal", "A caught imposter gets one guess. Hit the word, even with a typo, and they take the round."],
];

export function WordTrapApp({ room }: { room: string }) {
  const navigate = useNavigate();
  const [name, setName] = useState("Player");
  const [joinCode, setJoinCode] = useState("");
  const [solo, setSolo] = useState(false);
  const [client, setClient] = useState(false);

  useEffect(() => {
    setName(loadName());
    setClient(true);
  }, []);

  if (room && !client) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-3xl flex-col justify-center px-4">
        <p className="font-display text-4xl">WordTrap</p>
        <p className="mt-3 text-muted">Pulling up the table.</p>
      </main>
    );
  }

  if (room) {
    return (
      <RoomTable
        code={room}
        name={name}
        onLeave={() => {
          sessionStorage.removeItem("wordtrap-host");
          void navigate({ to: "/", search: { room: "" } });
        }}
      />
    );
  }

  if (solo) {
    return (
      <SoloTable
        name={name}
        onLeave={() => setSolo(false)}
      />
    );
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col px-4 py-5 sm:px-6 sm:py-8">
      <p className="text-sm uppercase tracking-wide text-muted">Parlor game</p>
      <h1 className="mt-2 font-display text-4xl leading-none sm:text-6xl">WordTrap</h1>
      <p className="mt-3 max-w-prose text-muted">
        A real-time word table. One imposter, a shared secret, timed clues, and a vote that can deadlock.
      </p>

      <label className="mt-6 text-sm text-muted" htmlFor="seat-name">
        Your name
      </label>
      <input
        id="seat-name"
        value={name}
        maxLength={16}
        onChange={(event) => {
          setName(event.target.value);
          saveName(event.target.value);
        }}
        className="mt-2 min-h-12 rounded-xl border border-line bg-surface px-4 text-base"
      />

      <button
        type="button"
        className="mt-4 min-h-12 rounded-full bg-accent px-6 text-accent-fg"
        onClick={() => {
          unlockAudio();
          saveName(name);
          playCue("ui");
          setSolo(true);
        }}
      >
        Sit down with bots
      </button>

      <div className="mt-6 flex flex-col gap-2 sm:flex-row">
        <button
          type="button"
          className="min-h-12 rounded-full border border-line px-6"
          onClick={() => {
            unlockAudio();
            saveName(name);
            const code = makeCode();
            sessionStorage.setItem("wordtrap-host", code);
            void navigate({ to: "/", search: { room: code } });
          }}
        >
          Host a private table
        </button>
        <form
          className="flex flex-1 gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            const code = joinCode.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4);
            if (code.length < 4) return;
            unlockAudio();
            saveName(name);
            sessionStorage.removeItem("wordtrap-host");
            void navigate({ to: "/", search: { room: code } });
          }}
        >
          <input
            value={joinCode}
            onChange={(event) => setJoinCode(event.target.value.toUpperCase())}
            maxLength={4}
            placeholder="Code"
            aria-label="Table code"
            className="min-h-12 min-w-0 flex-1 rounded-xl border border-line bg-surface px-4 text-base uppercase"
          />
          <button type="submit" className="min-h-12 rounded-full border border-line px-5">
            Join
          </button>
        </form>
      </div>

      <ol className="mt-8 grid gap-3 sm:grid-cols-2">
        {RULES.map(([title, body], index) => (
          <li key={title} className="rounded-xl border border-line bg-surface p-4">
            <p className="text-sm text-accent">0{index + 1}</p>
            <h2 className="mt-1 font-display text-2xl leading-tight">{title}</h2>
            <p className="mt-2 text-sm text-muted">{body}</p>
          </li>
        ))}
      </ol>
      <p className="mt-6 text-sm text-muted">
        Caught and wrong: each innocent scores 1. Imposter escapes or guesses the word: they score 2. Two ties in a row void the round.
      </p>
    </main>
  );
}

function SoloTable({ name, onLeave }: { name: string; onLeave: () => void }) {
  const idRef = useRef("");
  const tableRef = useRef<Table | null>(null);
  const [view, setView] = useState<TableView | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [notice, setNotice] = useState<string | null>(null);
  const phaseRef = useRef<Phase | null>(null);

  if (!tableRef.current) {
    idRef.current = loadPlayerId();
    const table = new Table({ seed: Math.floor(Math.random() * 1_000_000_000) });
    const now0 = Date.now();
    table.act({ type: "join", id: idRef.current, name: name.trim() || "Player", isBot: false }, now0);
    table.act({ type: "fill", by: idRef.current }, now0);
    tableRef.current = table;
  }

  const viewNow = view ?? tableRef.current.view(idRef.current);

  useEffect(() => {
    let frame = 0;
    let last = 0;
    const loop = (stamp: number) => {
      if (stamp - last > 150) {
        last = stamp;
        const clock = Date.now();
        tableRef.current?.tick(clock);
        setNow(clock);
        setView(tableRef.current?.view(idRef.current) ?? null);
      }
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (!view) return;
    if (phaseRef.current && phaseRef.current !== view.phase) {
      if (view.phase === "reveal") playCue("deal");
      if (view.lastResult?.kind === "caught-steal" && view.phase === "resolve") playCue("steal");
      else if (view.lastResult?.kind === "caught-miss" && view.phase === "resolve") playCue("catch");
      else if (view.lastResult?.kind === "escaped" && view.phase === "resolve") playCue("escape");
    }
    phaseRef.current = view.phase;
  }, [view]);

  function onAct(action: Action) {
    const table = tableRef.current;
    if (!table) return;
    const clock = Date.now();
    const result = table.act(action, clock);
    setNotice(result.ok ? null : (result.error ?? "Not allowed."));
    setNow(clock);
    setView(table.view(idRef.current));
  }

  return <TableScreen view={viewNow} now={now} notice={notice} onAct={onAct} onLeave={onLeave} />;
}

function makeCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 4; i++) code += alphabet[Math.floor(Math.random() * alphabet.length)]!;
  return code;
}
