import { useEffect, useRef, useState } from "react";
import { P2PRoom, type PeerInfo } from "@/lib/multiplayer";
import { playCue } from "@/lib/wordtrap/audio";
import { Table, type Action, type Phase, type SealedMatch, type TableView } from "@/lib/wordtrap/engine";
import { loadPlayerId } from "@/lib/wordtrap/id";
import { TableScreen } from "./screen";

type NetMsg =
  | { t: "hello"; name: string }
  | { t: "resume" }
  | { t: "intent"; action: Action }
  | { t: "seal"; seal: SealedMatch; serverNow: number }
  | { t: "error"; error: string };

function bindIntent(action: Action, from: string): Action | null {
  switch (action.type) {
    case "ready":
    case "clue":
    case "vote":
    case "guess":
    case "chat":
    case "reconnect":
    case "leave":
      return { ...action, id: from };
    case "start":
    case "again":
    case "fill":
    case "configure":
    case "removeBot":
      return { ...action, by: from };
    case "transferHost":
      return { ...action, by: from };
    default:
      return null;
  }
}

function successorId(seal: SealedMatch, online: Set<string>): string {
  const humans = seal.players
    .filter((player) => !player.isBot && online.has(player.id))
    .sort((a, b) => a.joinOrder - b.joinOrder);
  return humans[0]?.id ?? "";
}

export function RoomTable({ code, name, onLeave }: { code: string; name: string; onLeave: () => void }) {
  const selfId = useRef("");
  if (!selfId.current) selfId.current = loadPlayerId();
  const [host, setHost] = useState(false);
  const [booted, setBooted] = useState(false);
  const [joined, setJoined] = useState(false);
  const [peers, setPeers] = useState<PeerInfo[]>([]);
  const [view, setView] = useState<TableView | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [offset, setOffset] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  const roomRef = useRef<P2PRoom | null>(null);
  const tableRef = useRef<Table | null>(null);
  const sealRef = useRef<SealedMatch | null>(null);
  const hostRef = useRef(false);
  const phaseRef = useRef<Phase | null>(null);
  const peersRef = useRef<PeerInfo[]>([]);
  const tookRef = useRef(false);
  hostRef.current = host;
  peersRef.current = peers;

  function publish() {
    const table = tableRef.current;
    const link = roomRef.current;
    if (!table || !link) return;
    const seal = table.seal();
    sealRef.current = seal;
    link.send({ t: "seal", seal, serverNow: Date.now() } satisfies NetMsg);
    setView(table.view(selfId.current));
  }

  function adopt(seal: SealedMatch, serverNow: number) {
    sealRef.current = seal;
    setOffset(serverNow - Date.now());
    if (hostRef.current) {
      tableRef.current = Table.restore(seal);
      setView(tableRef.current.view(selfId.current));
    } else {
      setView(Table.restore(seal).view(selfId.current));
    }
  }

  useEffect(() => {
    const hosting = sessionStorage.getItem("wordtrap-host") === code;
    setHost(hosting);
    hostRef.current = hosting;
    setBooted(true);
  }, [code]);

  useEffect(() => {
    if (!booted) return;
    const link = new P2PRoom({
      room: `wt-${code}`.slice(0, 64),
      selfId: selfId.current,
      name: name.trim() || "Player",
      onPeersChanged: setPeers,
      onConnected: () => setJoined(true),
      onMessage: (from, data) => {
        const msg = data as NetMsg;
        if (!msg || typeof msg !== "object" || !("t" in msg)) return;
        if (msg.t === "error" && !hostRef.current) {
          setNotice(msg.error);
          return;
        }
        if (msg.t === "resume" && sealRef.current && sealRef.current.hostId === from) {
          roomRef.current?.send({ t: "seal", seal: sealRef.current, serverNow: Date.now() } satisfies NetMsg, from);
          return;
        }
        if (msg.t === "seal") {
          if (msg.seal.hostId !== from) return;
          const prev = sealRef.current;
          const online = new Set([selfId.current, ...peersRef.current.map((peer) => peer.id)]);
          const allowed = !prev || from === prev.hostId || successorId(prev, online) === from;
          if (!allowed) return;
          if (hostRef.current && msg.seal.hostId === selfId.current) {
            const current = tableRef.current?.seal().revision ?? -1;
            if (msg.seal.revision >= current) adopt(msg.seal, msg.serverNow);
            return;
          }
          if (!hostRef.current) adopt(msg.seal, msg.serverNow);
          return;
        }
        if (!hostRef.current || !tableRef.current) return;
        const table = tableRef.current;
        const clock = Date.now();
        if (msg.t === "hello") {
          const result = table.act(
            { type: "join", id: from, name: msg.name || "Player", isBot: false },
            clock,
          );
          if (!result.ok) roomRef.current?.send({ t: "error", error: result.error ?? "Could not sit." } satisfies NetMsg, from);
          publish();
          return;
        }
        if (msg.t === "intent") {
          const action = bindIntent(msg.action, from);
          if (!action) return;
          const result = table.act(action, clock);
          if (!result.ok) {
            roomRef.current?.send({ t: "error", error: result.error ?? "Not allowed." } satisfies NetMsg, from);
          }
          setNotice(null);
          publish();
        }
      },
    });
    roomRef.current = link;
    void link.join();
    return () => {
      link.close();
      roomRef.current = null;
    };
  }, [booted, code, name]);

  useEffect(() => {
    if (!booted || !joined) return;
    const link = roomRef.current;
    if (!link) return;
    if (hostRef.current) link.send({ t: "resume" } satisfies NetMsg);
    else link.send({ t: "hello", name: name.trim() || "Player" } satisfies NetMsg);
  }, [booted, joined, peers, name]);

  useEffect(() => {
    if (!booted || !host) return;
    const wait = window.setTimeout(() => {
      if (tableRef.current) return;
      const table = new Table({ seed: code.split("").reduce((sum, char) => sum + char.charCodeAt(0), 1) });
      table.act({ type: "join", id: selfId.current, name: name.trim() || "Player", isBot: false }, Date.now());
      tableRef.current = table;
      publish();
    }, 900);
    return () => window.clearTimeout(wait);
  }, [booted, host, code, name]);

  useEffect(() => {
    if (!host) return;
    let frame = 0;
    let last = 0;
    let beat = 0;
    const loop = (stamp: number) => {
      const clock = Date.now();
      if (stamp - last > 150) {
        last = stamp;
        const before = tableRef.current?.seal().revision;
        tableRef.current?.tick(clock);
        setNow(clock);
        if (tableRef.current && tableRef.current.seal().revision !== before) {
          publish();
        } else if (tableRef.current) {
          setView(tableRef.current.view(selfId.current));
        }
        if (stamp - beat > 1000 && tableRef.current) {
          beat = stamp;
          publish();
        }
      }
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [host]);

  useEffect(() => {
    if (host) return;
    let frame = 0;
    let last = 0;
    const loop = (stamp: number) => {
      if (stamp - last > 200) {
        last = stamp;
        setNow(Date.now());
      }
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [host]);

  useEffect(() => {
    if (!sealRef.current || host || tookRef.current) return;
    const online = new Set<string>([
      selfId.current,
      ...peers.filter((peer) => peer.connectionState === "connected").map((peer) => peer.id),
    ]);
    const seal = sealRef.current;
    if (online.has(seal.hostId)) return;
    if (successorId(seal, online) !== selfId.current) return;
    tookRef.current = true;
    const table = Table.restore(seal);
    const clock = Date.now();
    for (const player of seal.players) {
      if (!player.isBot && !online.has(player.id)) table.act({ type: "leave", id: player.id }, clock);
    }
    if (table.seal().hostId !== selfId.current) return;
    tableRef.current = table;
    hostRef.current = true;
    setHost(true);
    sessionStorage.setItem("wordtrap-host", code);
    publish();
    setNotice("The host dropped. You have the chair.");
  }, [peers, host, code]);

  useEffect(() => {
    if (!view) return;
    if (phaseRef.current && phaseRef.current !== view.phase) {
      if (view.phase === "reveal") playCue("deal");
      if (view.phase === "resolve" && view.lastResult?.kind === "caught-steal") playCue("steal");
      else if (view.phase === "resolve" && view.lastResult?.kind === "caught-miss") playCue("catch");
      else if (view.phase === "resolve" && view.lastResult?.kind === "escaped") playCue("escape");
    }
    phaseRef.current = view.phase;
  }, [view]);

  function onAct(action: Action) {
    if (hostRef.current && tableRef.current) {
      const result = tableRef.current.act(action, Date.now());
      setNotice(result.ok ? null : (result.error ?? "Not allowed."));
      publish();
      return;
    }
    roomRef.current?.send({ t: "intent", action } satisfies NetMsg);
    setNotice(null);
  }

  const displayNow = now + (host ? 0 : offset);
  const onlinePeers = peers.filter((peer) => peer.connectionState === "connected").length;
  const netNote = !joined
    ? `Table ${code} · finding the room`
    : host
      ? `Table ${code} · you are host · ${onlinePeers} other ${onlinePeers === 1 ? "player" : "players"} linked`
      : view
        ? `Table ${code} · seated`
        : `Table ${code} · waiting for the host`;

  if (!view) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-3xl flex-col justify-center px-4">
        <p className="font-display text-4xl">WordTrap</p>
        <p className="mt-3 text-muted">{netNote}</p>
        <button type="button" className="mt-6 min-h-12 w-fit rounded-full border border-line px-5" onClick={onLeave}>
          Leave
        </button>
      </main>
    );
  }

  return (
    <TableScreen view={view} now={displayNow} notice={notice} netNote={netNote} onAct={onAct} onLeave={onLeave} />
  );
}
