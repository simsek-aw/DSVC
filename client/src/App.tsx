import { useEffect, useRef, useState } from "react";
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

  // Mirrors `session`/whether we've ever received real state for the current
  // socket handlers below, which are bound once (empty deps) and would
  // otherwise only ever see the values captured at mount.
  const sessionRef = useRef<Session | null>(session);
  const hasStateRef = useRef(false);

  useEffect(() => {
    const onJoined = (payload: Session) => {
      sessionRef.current = payload;
      setSession(payload);
      localStorage.setItem(SESSION_KEY, JSON.stringify(payload));
    };
    const onState = (s: GameState) => {
      hasStateRef.current = true;
      setState(s);
    };
    const onConnect = () => {
      if (sessionRef.current) socket.emit("rejoin", sessionRef.current);
    };
    const onError = (msg: string) => {
      setError(msg);
      setTimeout(() => setError(null), 4000);
      // A stale session (e.g. the server restarted and forgot every room)
      // otherwise leaves the app stuck forever on "Verbinde …" — fall back
      // to the lobby so a new room can be created or joined.
      if (sessionRef.current && !hasStateRef.current) {
        localStorage.removeItem(SESSION_KEY);
        sessionRef.current = null;
        setSession(null);
      }
    };

    socket.on("joined", onJoined);
    socket.on("state", onState);
    socket.on("errorMessage", onError);
    socket.on("connect", onConnect);

    if (sessionRef.current && socket.connected) socket.emit("rejoin", sessionRef.current);

    return () => {
      socket.off("joined", onJoined);
      socket.off("state", onState);
      socket.off("errorMessage", onError);
      socket.off("connect", onConnect);
    };
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
