import { useEffect, useState } from "react";
import { GameState } from "@canos/shared";
import { socket } from "./socket";
import { Lobby } from "./components/Lobby";
import { WaitingRoom } from "./components/WaitingRoom";
import { GameView } from "./components/GameView";

interface Session {
  roomId: string;
  playerId: string;
}

const SESSION_KEY = "canos-session";

function loadSession(): Session | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export default function App() {
  const [session, setSession] = useState<Session | null>(loadSession());
  const [state, setState] = useState<GameState | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onJoined = (payload: Session) => {
      setSession(payload);
      localStorage.setItem(SESSION_KEY, JSON.stringify(payload));
    };
    const onState = (s: GameState) => setState(s);
    const onError = (msg: string) => {
      setError(msg);
      setTimeout(() => setError(null), 4000);
    };

    socket.on("joined", onJoined);
    socket.on("state", onState);
    socket.on("errorMessage", onError);

    if (session) {
      socket.on("connect", () => socket.emit("rejoin", session));
      if (socket.connected) socket.emit("rejoin", session);
    }

    return () => {
      socket.off("joined", onJoined);
      socket.off("state", onState);
      socket.off("errorMessage", onError);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sendAction = (action: any) => {
    if (!session) return;
    socket.emit("action", { roomId: session.roomId, action });
  };

  return (
    <div className="app-root">
      {error && <div className="toast-error">{error}</div>}
      {!session && <Lobby />}
      {session && !state && <div className="centered-message">Verbinde …</div>}
      {session && state && state.phase === "lobby" && (
        <WaitingRoom state={state} myPlayerId={session.playerId} roomId={session.roomId} sendAction={sendAction} />
      )}
      {session && state && state.phase !== "lobby" && (
        <GameView state={state} myPlayerId={session.playerId} sendAction={sendAction} />
      )}
    </div>
  );
}
