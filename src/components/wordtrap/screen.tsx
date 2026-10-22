import { Crown, Send, Volume2, VolumeX } from "lucide-react";
import { useEffect, useState } from "react";
import type { Action, TableView } from "@/lib/wordtrap/engine";
import { isMuted, playCue, setMuted, unlockAudio } from "@/lib/wordtrap/audio";
import { Avatar } from "./avatar";

function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

function phaseBudget(view: TableView): number {
  switch (view.phase) {
    case "reveal":
      return view.settings.revealSeconds * 1000;
    case "describe":
      return view.settings.speakerSeconds * 1000;
    case "vote":
      return view.settings.voteSeconds * 1000;
    case "guess":
      return view.settings.guessSeconds * 1000;
    case "resolve":
      return view.settings.resolveSeconds * 1000;
    case "tiebreak":
      return 3200;
    default:
      return 0;
  }
}

export function TableScreen({
  view,
  now,
  notice,
  netNote,
  onAct,
  onLeave,
}: {
  view: TableView;
  now: number;
  notice: string | null;
  netNote?: string;
  onAct: (action: Action) => void;
  onLeave: () => void;
}) {
  const [draft, setDraft] = useState("");
  const [chat, setChat] = useState("");
  const [soundOff, setSoundOff] = useState(false);
  const you = view.youId;

  useEffect(() => {
    setDraft("");
  }, [view.phase, view.speakerIndex, view.round]);

  const totalMs = phaseBudget(view);
  const left = view.phaseDeadline > 0 ? Math.max(0, view.phaseDeadline - now) : 0;
  const seconds = Math.ceil(left / 1000);
  const speaking = view.phase === "describe" && view.speakerOrder[view.speakerIndex] === you;

  useEffect(() => {
    if (speaking && seconds > 0 && seconds <= 5) playCue("warn");
  }, [speaking, seconds]);

  function submitClue(text: string) {
    unlockAudio();
    onAct({ type: "clue", id: you, text });
    setDraft("");
    playCue("clue");
  }

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col px-4 py-4 sm:px-6">
      <header className="flex items-center justify-between gap-3">
        <div>
          <p className="font-display text-2xl leading-none tracking-tight">WordTrap</p>
          <p className="mt-1 text-sm text-muted">
            {view.phase === "lobby"
              ? "Lobby"
              : view.phase === "podium"
                ? "Final table"
                : `Round ${view.round} of ${view.settings.rounds}`}
            {view.tieStreak > 0 && view.phase !== "lobby" ? ` · retake ${view.tieStreak}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="grid size-11 place-items-center rounded-full border border-line bg-surface"
            aria-label={soundOff ? "Unmute" : "Mute"}
            onClick={() => {
              unlockAudio();
              const next = !isMuted();
              setMuted(next);
              setSoundOff(next);
              if (!next) playCue("ui");
            }}
          >
            {soundOff ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
          </button>
          <button
            type="button"
            className="min-h-11 rounded-full border border-line px-4 text-sm text-muted"
            onClick={onLeave}
          >
            Leave
          </button>
        </div>
      </header>

      {netNote ? <p className="mt-3 text-sm text-muted">{netNote}</p> : null}

      <p className="mt-4 rounded-xl border border-line bg-surface px-4 py-3 text-sm" aria-live="polite">
        {view.banner}
      </p>
      {notice ? <p className="mt-2 text-sm text-accent">{notice}</p> : null}

      {totalMs > 0 && view.phase !== "lobby" && view.phase !== "podium" ? (
        <div className="mt-4">
          <div className="flex items-end justify-between">
            <span className="text-sm text-muted">Timer</span>
            <span className={cx("font-display text-4xl leading-none", seconds <= 5 ? "text-accent" : "text-fg")}>
              {seconds}
            </span>
          </div>
          <div className="mt-2 h-1 overflow-hidden rounded-full bg-surface-2">
            <div
              className="h-full origin-left bg-accent"
              style={{ transform: `scaleX(${Math.max(0, Math.min(1, left / totalMs))})` }}
            />
          </div>
        </div>
      ) : null}

      <section className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {view.seats.map((seat) => {
          const voting = view.phase === "vote" && !seat.isYou && seat.connected;
          return (
            <button
              key={seat.id}
              type="button"
              disabled={!voting}
              onClick={() => {
                unlockAudio();
                onAct({ type: "vote", id: you, targetId: seat.id });
                playCue("vote");
              }}
              className={cx(
                "rounded-xl border bg-surface p-3 text-left disabled:cursor-default",
                seat.isSpeaker ? "border-accent" : view.yourVote === seat.id ? "border-fg" : "border-line",
                !seat.connected && "opacity-50",
              )}
            >
              <div className="flex items-center gap-2">
                <Avatar id={seat.id} />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {seat.name}
                    {seat.isYou ? " · you" : ""}
                  </p>
                  <p className="text-sm text-muted">{seat.score} pts</p>
                </div>
              </div>
              <p className="mt-2 flex items-center gap-1 text-xs uppercase tracking-wide text-muted">
                {seat.isHost ? <Crown className="size-3 text-accent" aria-hidden /> : null}
                {seat.isSpeaker
                  ? "Speaking"
                  : view.phase === "vote" && seat.hasVoted
                    ? "Voted"
                    : view.phase === "reveal" && seat.ready
                      ? "Ready"
                      : seat.isBot
                        ? "Bot"
                        : seat.connected
                          ? "Seated"
                          : "Away"}
              </p>
            </button>
          );
        })}
      </section>

      <section className="mt-4 flex-1 rounded-xl border border-line bg-surface p-4 sm:p-6">
        {view.phase === "lobby" ? (
          <Lobby view={view} onAct={onAct} />
        ) : view.phase === "reveal" ? (
          <Reveal view={view} onAct={onAct} />
        ) : view.phase === "describe" ? (
          <Describe
            view={view}
            draft={draft}
            speaking={speaking}
            onDraft={setDraft}
            onSubmit={() => submitClue(draft)}
            onPass={() => submitClue("Pass")}
          />
        ) : view.phase === "vote" ? (
          <Vote view={view} />
        ) : view.phase === "guess" ? (
          <Guess view={view} draft={draft} onDraft={setDraft} onSubmit={() => onAct({ type: "guess", id: you, text: draft })} />
        ) : view.phase === "tiebreak" ? (
          <div>
            <h2 className="font-display text-3xl leading-tight">Deadlock</h2>
            <p className="mt-3 max-w-prose text-muted">
              The vote split. The same imposter stays in the chair and a new word is dealt. Ties do not reveal anyone.
            </p>
          </div>
        ) : view.phase === "resolve" && view.lastResult ? (
          <Result view={view} />
        ) : view.phase === "podium" ? (
          <Podium view={view} onAct={onAct} />
        ) : (
          <p className="text-muted">Shuffling the deck.</p>
        )}
      </section>

      <section className="mt-4 mb-2 rounded-xl border border-line bg-surface p-4">
        <h2 className="text-sm font-medium">Table talk</h2>
        <div className="mt-2 flex max-h-36 flex-col gap-1 overflow-auto text-sm">
          {view.feed.length === 0 ? <p className="text-muted">Quiet so far.</p> : null}
          {view.feed.map((item) => (
            <p key={item.id} className={item.kind === "system" ? "text-muted" : "text-fg"}>
              {item.kind === "chat" ? <span className="text-muted">{item.name}: </span> : null}
              {item.text}
            </p>
          ))}
        </div>
        {view.chatOpen ? (
          <form
            className="mt-3 flex gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              unlockAudio();
              onAct({ type: "chat", id: you, text: chat });
              setChat("");
            }}
          >
            <input
              value={chat}
              onChange={(event) => setChat(event.target.value)}
              maxLength={80}
              placeholder="Say something"
              className="min-h-11 min-w-0 flex-1 rounded-lg border border-line bg-bg px-3 text-base text-fg"
            />
            <button type="submit" className="grid size-11 place-items-center rounded-lg bg-accent text-accent-fg" aria-label="Send chat">
              <Send className="size-4" />
            </button>
          </form>
        ) : (
          <p className="mt-3 text-sm text-muted">Chat is sealed until this round resolves.</p>
        )}
      </section>
    </div>
  );
}

function Lobby({ view, onAct }: { view: TableView; onAct: (action: Action) => void }) {
  const you = view.youId;
  return (
    <div>
      <h2 className="font-display text-3xl leading-tight">Before the deal</h2>
      <p className="mt-2 max-w-prose text-muted">
        One imposter. Everyone else shares a word. Clues go in order, then you vote. A tie replays with the same imposter.
      </p>
      {view.youAreHost ? (
        <div className="mt-5 flex flex-col gap-4">
          <Choice
            label="Rounds"
            value={String(view.settings.rounds)}
            options={["3", "5", "7"]}
            onPick={(value) => onAct({ type: "configure", by: you, patch: { rounds: Number(value) } })}
          />
          <Choice
            label="Imposter sees"
            value={view.settings.hint}
            options={[
              ["decoy", "A cover word"],
              ["category", "Only the category"],
            ]}
            onPick={(value) => onAct({ type: "configure", by: you, patch: { hint: value === "category" ? "category" : "decoy" } })}
          />
          <Choice
            label="Seats"
            value={String(view.settings.seats)}
            options={["3", "4", "5", "6"]}
            onPick={(value) => {
              onAct({ type: "configure", by: you, patch: { seats: Number(value) } });
              onAct({ type: "fill", by: you });
            }}
          />
          <Choice
            label="Seconds per clue"
            value={String(view.settings.speakerSeconds)}
            options={["16", "24", "36"]}
            onPick={(value) => onAct({ type: "configure", by: you, patch: { speakerSeconds: Number(value) } })}
          />
          <div className="flex flex-wrap gap-2">
            {view.seats.length > 3
              ? view.seats
                  .filter((seat) => seat.isBot)
                  .map((seat) => (
                    <button
                      key={seat.id}
                      type="button"
                      className="min-h-11 rounded-full border border-line px-3 text-sm"
                      onClick={() => {
                        onAct({ type: "removeBot", by: you, id: seat.id });
                        onAct({ type: "configure", by: you, patch: { seats: Math.max(3, view.seats.length - 1) } });
                      }}
                    >
                      Dismiss {seat.name}
                    </button>
                  ))
              : null}
            <button
              type="button"
              className="min-h-11 rounded-full border border-line px-3 text-sm"
              onClick={() => onAct({ type: "fill", by: you })}
            >
              Fill empty seats
            </button>
          </div>
        </div>
      ) : (
        <p className="mt-4 text-sm text-muted">The host is setting the rules.</p>
      )}
      {view.youAreHost ? (
        <button
          type="button"
          className="mt-6 min-h-12 rounded-full bg-accent px-6 text-accent-fg"
          onClick={() => {
            unlockAudio();
            onAct({ type: "start", by: you });
            playCue("deal");
          }}
        >
          Deal the first word
        </button>
      ) : null}
    </div>
  );
}

function Choice({
  label,
  value,
  options,
  onPick,
}: {
  label: string;
  value: string;
  options: Array<string | [string, string]>;
  onPick: (value: string) => void;
}) {
  return (
    <div>
      <p className="text-sm text-muted">{label}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {options.map((option) => {
          const id = Array.isArray(option) ? option[0] : option;
          const text = Array.isArray(option) ? option[1] : option;
          const on = value === id;
          return (
            <button
              key={id}
              type="button"
              aria-pressed={on}
              onClick={() => onPick(id)}
              className={cx(
                "min-h-11 rounded-full border px-4 text-sm",
                on ? "border-accent bg-accent text-accent-fg" : "border-line bg-bg text-fg",
              )}
            >
              {text}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Reveal({ view, onAct }: { view: TableView; onAct: (action: Action) => void }) {
  const ready = view.seats.find((seat) => seat.isYou)?.ready;
  return (
    <div>
      <p className="text-sm uppercase tracking-wide text-muted">{view.category}</p>
      {view.yourRole === "imposter" ? (
        <>
          <h2 className="mt-2 font-display text-4xl leading-none text-accent">Imposter</h2>
          {view.yourHint ? (
            <>
              <p className="mt-4 text-muted">They were dealt a different word. Describe this cover.</p>
              <p className="mt-3 font-display text-5xl leading-none">{view.yourHint}</p>
            </>
          ) : (
            <p className="mt-4 max-w-prose text-muted">You were not dealt a word. You only know the category. Bluff.</p>
          )}
        </>
      ) : (
        <>
          <h2 className="mt-2 font-display text-4xl leading-none">Innocent</h2>
          <p className="mt-4 text-muted">This is the word. Do not say it.</p>
          <p className="mt-3 font-display text-5xl leading-none">{view.yourWord}</p>
        </>
      )}
      <button
        type="button"
        disabled={ready}
        className="mt-6 min-h-12 rounded-full bg-fg px-6 text-bg disabled:opacity-50"
        onClick={() => {
          unlockAudio();
          onAct({ type: "ready", id: view.youId });
        }}
      >
        {ready ? "Waiting on the table" : "I've got it"}
      </button>
    </div>
  );
}

function Describe({
  view,
  draft,
  speaking,
  onDraft,
  onSubmit,
  onPass,
}: {
  view: TableView;
  draft: string;
  speaking: boolean;
  onDraft: (value: string) => void;
  onSubmit: () => void;
  onPass: () => void;
}) {
  const order = view.speakerOrder.map((id) => view.seats.find((seat) => seat.id === id)?.name ?? "Seat");
  return (
    <div>
      <p className="text-sm text-muted">Category · {view.category}</p>
      <h2 className="mt-2 font-display text-3xl leading-tight">
        {speaking ? "Your clue" : `${order[view.speakerIndex] ?? "Someone"} is speaking`}
      </h2>
      {view.yourRole === "innocent" ? (
        <p className="mt-2 text-sm text-muted">
          Your word is <span className="text-fg">{view.yourWord}</span>. Keep it off your tongue.
        </p>
      ) : view.yourHint ? (
        <p className="mt-2 text-sm text-muted">
          Cover word <span className="text-fg">{view.yourHint}</span>. The table has another.
        </p>
      ) : (
        <p className="mt-2 text-sm text-muted">You only know the category.</p>
      )}
      <ol className="mt-4 flex flex-col gap-2">
        {view.clues.map((clue, index) => (
          <li key={`${clue.playerId}-${index}`} className="flex justify-between gap-3 text-sm">
            <span className="text-muted">
              {index + 1}. {clue.name}
            </span>
            <span>{clue.text}</span>
          </li>
        ))}
      </ol>
      <p className="mt-4 text-sm text-muted">{order.join(" → ")}</p>
      {speaking ? (
        <form
          className="mt-4 flex flex-col gap-2 sm:flex-row"
          onSubmit={(event) => {
            event.preventDefault();
            onSubmit();
          }}
        >
          <input
            autoFocus
            value={draft}
            onChange={(event) => onDraft(event.target.value)}
            maxLength={48}
            placeholder="A short clue"
            className="min-h-12 min-w-0 flex-1 rounded-lg border border-line bg-bg px-3 text-base"
          />
          <button type="submit" className="min-h-12 rounded-full bg-accent px-5 text-accent-fg">
            Give clue
          </button>
          <button type="button" className="min-h-12 rounded-full border border-line px-5" onClick={onPass}>
            Pass
          </button>
        </form>
      ) : null}
    </div>
  );
}

function Vote({ view }: { view: TableView }) {
  const mine = view.seats.find((seat) => seat.id === view.yourVote);
  return (
    <div>
      <h2 className="font-display text-3xl leading-tight">Who is lying?</h2>
      <p className="mt-2 text-muted">
        {mine ? `Locked on ${mine.name}. Tap another seat to switch.` : "Tap a seat. You cannot vote for yourself."}
      </p>
      <ol className="mt-4 flex flex-col gap-2">
        {view.clues.map((clue, index) => (
          <li key={`${clue.playerId}-${index}`} className="flex justify-between gap-3 text-sm">
            <span className="text-muted">{clue.name}</span>
            <span>{clue.text}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function Guess({
  view,
  draft,
  onDraft,
  onSubmit,
}: {
  view: TableView;
  draft: string;
  onDraft: (value: string) => void;
  onSubmit: () => void;
}) {
  const imposter = view.yourRole === "imposter";
  return (
    <div>
      <h2 className="font-display text-3xl leading-tight">{imposter ? "Name their word" : "The imposter is guessing"}</h2>
      <p className="mt-2 max-w-prose text-muted">
        {imposter
          ? "You were caught. Guess the table's word. A close spelling still counts."
          : "If they hit it, they steal the points. If they miss, every innocent scores."}
      </p>
      {imposter ? (
        <form
          className="mt-4 flex flex-col gap-2 sm:flex-row"
          onSubmit={(event) => {
            event.preventDefault();
            unlockAudio();
            onSubmit();
          }}
        >
          <input
            autoFocus
            value={draft}
            onChange={(event) => onDraft(event.target.value)}
            maxLength={32}
            placeholder="Your guess"
            className="min-h-12 min-w-0 flex-1 rounded-lg border border-line bg-bg px-3 text-base"
          />
          <button type="submit" className="min-h-12 rounded-full bg-accent px-5 text-accent-fg">
            Guess
          </button>
        </form>
      ) : null}
    </div>
  );
}

function Result({ view }: { view: TableView }) {
  const result = view.lastResult;
  if (!result) return null;
  const title =
    result.kind === "caught-steal"
      ? "Stolen"
      : result.kind === "caught-miss"
        ? "Caught"
        : result.kind === "escaped"
          ? "They walked"
          : "Stalemate";
  return (
    <div>
      <p className="text-sm uppercase tracking-wide text-accent">{title}</p>
      <h2 className="mt-2 font-display text-5xl leading-none">{result.word}</h2>
      <p className="mt-3 text-muted">
        {result.imposterName} was the imposter. Cover word {result.decoy}. Category {result.category}.
        {result.guess ? ` Guessed “${result.guess}”.` : ""}
      </p>
      <ul className="mt-4 flex flex-col gap-1 text-sm">
        {result.deltas.map((delta) => (
          <li key={delta.playerId} className="flex justify-between">
            <span>{delta.name}</span>
            <span className="text-muted">{delta.delta > 0 ? `+${delta.delta}` : "0"}</span>
          </li>
        ))}
      </ul>
      <ul className="mt-4 flex flex-col gap-1 text-sm text-muted">
        {result.votes.map((vote) => (
          <li key={vote.voterId}>
            {vote.voterName} → {vote.targetName ?? "no vote"}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Podium({ view, onAct }: { view: TableView; onAct: (action: Action) => void }) {
  const ranked = [...view.seats].sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  return (
    <div>
      <h2 className="font-display text-4xl leading-none">The table</h2>
      <ol className="mt-4 flex flex-col gap-2">
        {ranked.map((seat, index) => (
          <li key={seat.id} className="flex items-center justify-between rounded-lg border border-line px-3 py-3">
            <span>
              {index + 1}. {seat.name}
            </span>
            <span className="font-display text-2xl">{seat.score}</span>
          </li>
        ))}
      </ol>
      {view.youAreHost ? (
        <button
          type="button"
          className="mt-6 min-h-12 rounded-full bg-accent px-6 text-accent-fg"
          onClick={() => onAct({ type: "again", by: view.youId })}
        >
          Play again
        </button>
      ) : (
        <p className="mt-4 text-sm text-muted">Waiting for the host to reset.</p>
      )}
    </div>
  );
}
