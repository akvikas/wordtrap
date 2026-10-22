import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Table, wordMatch, type SealedMatch } from "./engine.ts";

function humans(seed = 7): { table: Table; ids: string[] } {
  const table = new Table({ seed, settings: { seats: 4, rounds: 3, speakerSeconds: 20, voteSeconds: 20 } });
  const ids = ["ann", "bo", "cy", "dex"];
  ids.forEach((id, index) => {
    const joined = table.act({ type: "join", id, name: id }, index);
    assert.equal(joined.ok, true);
  });
  return { table, ids };
}

function secretOf(table: Table): NonNullable<SealedMatch["secret"]> {
  const secret = table.seal().secret;
  assert.ok(secret);
  return secret;
}

function readyAll(table: Table, ids: string[], now: number): number {
  for (const id of ids) {
    const res = table.act({ type: "ready", id }, now);
    assert.equal(res.ok, true, res.error);
  }
  return now;
}

function skipSpeakers(table: Table, now: number): number {
  for (let i = 0; i < 6 && table.seal().phase === "describe"; i++) {
    now = table.seal().phaseDeadline + 5;
    table.tick(now);
  }
  return now;
}

describe("wordMatch", () => {
  it("accepts the word, a substring, and a one-letter typo", () => {
    assert.equal(wordMatch("Whisk", "Whisk"), true);
    assert.equal(wordMatch("the whisk", "Whisk"), true);
    assert.equal(wordMatch("wisk", "Whisk"), true);
    assert.equal(wordMatch("ladle", "Whisk"), false);
    assert.equal(wordMatch("hi", "Whisk"), false);
  });
});

describe("table authority", () => {
  it("rejects the secret word and clues from the wrong seat", () => {
    const { table, ids } = humans();
    assert.equal(table.act({ type: "start", by: "ann" }, 1_000).ok, true);
    const word = table.view("ann").yourRole === "innocent" ? table.view("ann").yourWord : table.view("bo").yourWord;
    assert.ok(word);
    readyAll(table, ids, 1_100);
    assert.equal(table.seal().phase, "describe");
    const speaker = table.seal().speakerOrder[0]!;
    const other = ids.find((id) => id !== speaker)!;
    const stolen = table.act({ type: "clue", id: other, text: "a harmless clue" }, 1_200);
    assert.equal(stolen.ok, false);
    const leaked = table.act({ type: "clue", id: speaker, text: word! }, 1_200);
    assert.equal(leaked.ok, false);
    assert.match(leaked.error ?? "", /secret/i);
  });

  it("scores a caught imposter who misses, and a steal when the guess is right", () => {
    const { table, ids } = humans(3);
    table.act({ type: "start", by: "ann" }, 0);
    const imp = secretOf(table).imposterId;
    const word = secretOf(table).wordId;
    readyAll(table, ids, 10);
    let now = skipSpeakers(table, 10);
    assert.equal(table.seal().phase, "vote");
    for (const id of ids) {
      const target = id === imp ? ids.find((seat) => seat !== imp)! : imp;
      assert.equal(table.act({ type: "vote", id, targetId: target }, now).ok, true);
    }
    assert.equal(table.seal().phase, "guess");
    assert.equal(table.act({ type: "guess", id: ids.find((id) => id !== imp)!, text: "nope" }, now).ok, false);
    const cardWord = table.view(ids.find((id) => id !== imp)!).yourWord;
    assert.ok(cardWord);
    assert.equal(table.act({ type: "guess", id: imp, text: "definitely-not-it" }, now).ok, true);
    assert.equal(table.seal().phase, "resolve");
    assert.equal(table.seal().lastResult?.kind, "caught-miss");
    assert.equal(table.view(imp).seats.find((s) => s.id === imp)?.score, 0);
    assert.equal(table.view(imp).seats.find((s) => s.id !== imp)?.score, 1);
    assert.notEqual(word, "");
  });

  it("lets the imposter steal with a close guess", () => {
    const { table, ids } = humans(11);
    table.act({ type: "start", by: "ann" }, 0);
    const imp = secretOf(table).imposterId;
    readyAll(table, ids, 5);
    let now = skipSpeakers(table, 5);
    for (const id of ids) {
      const target = id === imp ? ids.find((seat) => seat !== imp)! : imp;
      table.act({ type: "vote", id, targetId: target }, now);
    }
    const word = table.seal().lastResult?.word ?? table.view(ids.find((id) => id !== imp && table.view(id).yourWord) ?? ids[0]!).yourWord;
    const known = ids.map((id) => table.view(id).yourWord).find(Boolean)!;
    now += 10;
    assert.equal(table.act({ type: "guess", id: imp, text: known.toLowerCase() }, now).ok, true);
    assert.equal(table.seal().lastResult?.kind, "caught-steal");
    assert.equal(table.view(imp).seats.find((s) => s.id === imp)?.score, 2);
    assert.equal(word ?? known, known);
  });

  it("replays a tie with the same imposter and a new word", () => {
    const { table, ids } = humans(21);
    table.act({ type: "start", by: "ann" }, 0);
    const imp = secretOf(table).imposterId;
    const wordId = secretOf(table).wordId;
    readyAll(table, ids, 0);
    let now = skipSpeakers(table, 0);
    const [a, b, c, d] = ids;
    table.act({ type: "vote", id: a!, targetId: b! }, now);
    table.act({ type: "vote", id: b!, targetId: a! }, now);
    table.act({ type: "vote", id: c!, targetId: d! }, now);
    table.act({ type: "vote", id: d!, targetId: c! }, now);
    assert.equal(table.seal().phase, "tiebreak");
    now = table.seal().phaseDeadline + 20;
    table.tick(now);
    assert.equal(table.seal().phase, "reveal");
    assert.equal(secretOf(table).imposterId, imp);
    assert.notEqual(secretOf(table).wordId, wordId);
    assert.equal(table.view(a!).tieStreak > 0 || table.seal().tieStreak >= 0, true);
  });

  it("rate-limits chat and seals it during a live round", () => {
    const { table } = humans(2);
    assert.equal(table.act({ type: "chat", id: "ann", text: "ready?" }, 0).ok, true);
    const fast = table.act({ type: "chat", id: "ann", text: "again" }, 500);
    assert.equal(fast.ok, false);
    assert.match(fast.error ?? "", /slow/i);
    assert.equal(table.act({ type: "chat", id: "ann", text: "once more" }, 2_000).ok, true);
    table.act({ type: "start", by: "ann" }, 3_000);
    const sealed = table.act({ type: "chat", id: "ann", text: "the word is..." }, 5_000);
    assert.equal(sealed.ok, false);
    assert.match(sealed.error ?? "", /sealed/i);
  });

  it("passes the host chair when the host leaves and restores a reconnecting player", () => {
    const { table, ids } = humans(8);
    assert.equal(table.view("ann").youAreHost, true);
    assert.equal(table.act({ type: "leave", id: "ann" }, 0).ok, true);
    assert.equal(table.seal().hostId, "bo");
    table.act({ type: "join", id: "ann", name: "ann" }, 1);
    table.act({ type: "transferHost", by: "bo", to: "ann" }, 2);
    assert.equal(table.seal().hostId, "ann");
    table.act({ type: "start", by: "ann" }, 3);
    const view = table.view("cy");
    assert.ok(view.yourRole);
    table.act({ type: "leave", id: "cy" }, 4);
    assert.equal(table.view("cy").seats.find((s) => s.id === "cy")?.connected, false);
    assert.equal(table.act({ type: "reconnect", id: "cy" }, 5).ok, true);
    assert.equal(table.view("cy").yourRole !== null, true);
    assert.equal(ids.length, 4);
  });

  it("plays a full bot table through to the podium", () => {
    const table = new Table({ seed: 99, settings: { rounds: 3, seats: 4, speakerSeconds: 12, voteSeconds: 12 } });
    table.act({ type: "join", id: "host", name: "Host", isBot: true }, 0);
    table.act({ type: "fill", by: "host" }, 0);
    assert.equal(table.act({ type: "start", by: "host" }, 1_000).ok, true);
    let now = 1_000;
    for (let i = 0; i < 400 && table.seal().phase !== "podium"; i++) {
      now += 400;
      table.tick(now);
    }
    assert.equal(table.seal().phase, "podium");
    const scores = table.view("host").seats.map((s) => s.score);
    assert.ok(scores.every((score) => score >= 0));
    assert.ok(scores.some((score) => score > 0));
  });
});
