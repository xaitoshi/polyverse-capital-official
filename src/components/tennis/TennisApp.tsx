import { useEffect, useState } from "react";
import { loadBoard, loadPlayer, loadRecord } from "../../lib/tennis/load";
import type { BoardView, PlayerProfile, RecordView } from "../../lib/tennis/types";
import PlayerPage from "./PlayerPage";
import RecordPage from "./RecordPage";
import TennisPage from "./TennisPage";
import "./tennis.css";

type Route =
  | { kind: "board" }
  | { kind: "record" }
  | { kind: "player"; id: string };

function routeOf(path: string): Route {
  if (path === "/tennis/record") return { kind: "record" };
  const player = path.match(/^\/tennis\/players\/([^/]+)\/?$/);
  if (player) return { kind: "player", id: decodeURIComponent(player[1]!) };
  return { kind: "board" };
}

export default function TennisApp() {
  const route = routeOf(window.location.pathname);
  const [board, setBoard] = useState<BoardView | null>(null);
  const [record, setRecord] = useState<RecordView | null | undefined>(undefined);
  const [player, setPlayer] = useState<PlayerProfile | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancel = false;
    if (route.kind === "board") {
      loadBoard()
        .then((b) => { if (!cancel) setBoard(b); })
        .catch((e: unknown) => { if (!cancel) setError(e instanceof Error ? e.message : "Failed to load"); });
    } else if (route.kind === "record") {
      loadRecord()
        .then((r) => { if (!cancel) setRecord(r); })
        .catch((e: unknown) => { if (!cancel) setError(e instanceof Error ? e.message : "Failed to load"); });
    } else {
      loadPlayer(route.id)
        .then((p) => { if (!cancel) setPlayer(p); })
        .catch(() => { if (!cancel) setPlayer(null); });
    }
    return () => { cancel = true; };
  }, [route.kind, route.kind === "player" ? route.id : ""]);

  if (error) {
    return (
      <div className="tennis-root">
        <div className="empty">
          <h1>Could not load the tennis book</h1>
          <p>{error}</p>
        </div>
      </div>
    );
  }

  if (route.kind === "board") {
    if (!board) return <Loading label="LOADING TENNIS" />;
    return <TennisPage board={board} />;
  }
  if (route.kind === "record") {
    if (record === undefined) return <Loading label="LOADING RECORD" />;
    return <RecordPage record={record} />;
  }
  if (player === undefined) return <Loading label="LOADING PLAYER" />;
  return <PlayerPage id={route.id} profile={player} />;
}

function Loading({ label }: { label: string }) {
  return (
    <div className="tennis-root" style={{ display: "flex", minHeight: "100vh", alignItems: "center", justifyContent: "center" }}>
      <span style={{ letterSpacing: "0.22em", fontSize: 12, color: "#8b8b96" }}>{label}</span>
    </div>
  );
}
