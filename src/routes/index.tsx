import { createFileRoute } from "@tanstack/react-router";
import { WordTrapApp } from "@/components/wordtrap/app";

type Search = { room: string };

export const Route = createFileRoute("/")({
  validateSearch: (search: Record<string, unknown>): Search => ({
    room: typeof search.room === "string" ? search.room.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4) : "",
  }),
  component: Home,
});

function Home() {
  const { room } = Route.useSearch();
  return <WordTrapApp room={room} />;
}
