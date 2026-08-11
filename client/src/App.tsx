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

interface Toast {
  id: number;
  kind: "error" | "info" | "success";
  text: string;
}

let toastSeq = 0;

export default function App() {
  const [session, setSession] = useState<Session | null>(loadSession());
  const [state, setState] = useState<GameState | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);

  // A small stacked-toast system: server errors and local notices land here as
  // dismissible cards that auto-expire, instead of failing silently.
  const pushToast = useRef((kind: Toast["kind"], text: string) => {
    const id = ++toastSeq;
    setToasts((cur) => [...cur.slice(-3), { id, kind, text }]);
    setTimeout(() => setToasts((cur) => cur.filter((t) => t.id !== id)), kind === "error" ? 4500 : 2600);
  });
  const dismissToast = (id: number) => setToasts((cur) => cur.filter((t) => t.id !== id));
  // True only once the CURRENT socket connection has confirmed which player
  // it is (via "joined", from createRoom/joinRoom/rejoin). False in between —
  // e.g. right after a reconnect, before "rejoin" round-trips — so actions
  // can be blocked instead of silently being sent under the wrong identity.
  const [identityConfirmed, setIdentityConfirmed] = useState(false);

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
      setIdentityConfirmed(true);
    };
    const onState = (s: GameState) => {
      hasStateRef.current = true;
      setState(s);
    };
    const onConnect = () => {
      if (sessionRef.current) socket.emit("rejoin", sessionRef.current);
    };
    const onDisconnect = () => {
      // The socket will get a new id on reconnect; nothing sent before the
      // next "joined" confirms our identity again should be trusted.
      setIdentityConfirmed(false);
    };
    const onError = (msg: string) => {
      pushToast.current("error", msg);
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
    socket.on("disconnect", onDisconnect);

    if (sessionRef.current && socket.connected) socket.emit("rejoin", sessionRef.current);

    return () => {
      socket.off("joined", onJoined);
      socket.off("state", onState);
      socket.off("errorMessage", onError);
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
    };
  }, []);

  // In a demo room this device speaks for whichever seat is currently
  // selected; everywhere else it is always the session's own player.
  const [demoActivePlayerId, setDemoActivePlayerId] = useState<string | null>(null);
  const prevTurnPlayerRef = useRef<string | null>(null);

  const isDemo = !!state?.demoMode;
  const effectivePlayerId = (isDemo ? demoActivePlayerId : null) ?? session?.playerId ?? "";

  // Follow the turn automatically in demo mode so solo testing doesn't need a
  // manual switch every round — but only when the turn actually moves, so a
  // deliberate manual switch (e.g. to answer a trade) isn't overridden.
  useEffect(() => {
    if (!isDemo || !state) return;
    // Keyed on the player actually holding the turn rather than the index:
    // the index stays 0 when the game moves from turn-order rolling into
    // setup, even though turnOrder only gets populated at that moment.
    const turnPlayer = state.turnOrder[state.currentPlayerIndex] ?? null;
    if (turnPlayer && turnPlayer !== prevTurnPlayerRef.current) {
      prevTurnPlayerRef.current = turnPlayer;
      setDemoActivePlayerId(turnPlayer);
    }
  }, [isDemo, state?.currentPlayerIndex, state?.turnOrder]);

  useEffect(() => {
    if (isDemo && !demoActivePlayerId && state?.players.length) setDemoActivePlayerId(state.players[0].id);
  }, [isDemo, demoActivePlayerId, state?.players]);

  const sendAction = (action: any) => {
    if (!session) return;
    if (!identityConfirmed) {
      pushToast.current("info", "Verbindung wird wiederhergestellt, bitte kurz warten …");
      return;
    }
    socket.emit("action", {
      roomId: session.roomId,
      action,
      ...(isDemo ? { asPlayerId: effectivePlayerId } : {}),
    });
  };

  const leaveRoom = () => {
    if (sessionRef.current) socket.emit("leaveRoom", { roomId: sessionRef.current.roomId });
    localStorage.removeItem(SESSION_KEY);
    sessionRef.current = null;
    setSession(null);
    setState(null);
  };

  return (
    <div className="app-root">
      {toasts.length > 0 && (
        <div className="toast-stack">
          {toasts.map((t) => (
            <div key={t.id} className={`toast toast-${t.kind}`} onClick={() => dismissToast(t.id)} role="status">
              <span className="toast-icon" aria-hidden="true">
                {t.kind === "error" ? "⚠️" : t.kind === "success" ? "✅" : "ℹ️"}
              </span>
              <span>{t.text}</span>
            </div>
          ))}
        </div>
      )}
      {!session && <Lobby />}
      {session && !state && <div className="centered-message">Verbinde …</div>}
      {session && state && !identityConfirmed && <div className="reconnect-banner">Verbindung wird wiederhergestellt …</div>}
      {session && state && isDemo && (
        <div className="demo-switcher">
          <span className="demo-label">DEMO</span>
          {state.players.map((p) => (
            <button
              key={p.id}
              className={p.id === effectivePlayerId ? "active" : ""}
              style={{ borderColor: p.color }}
              onClick={() => setDemoActivePlayerId(p.id)}
            >
              <span className="player-dot" style={{ background: p.color }} />
              {p.name}
            </button>
          ))}
        </div>
      )}
      {session && state && state.phase === "lobby" && (
        <WaitingRoom state={state} myPlayerId={effectivePlayerId} roomId={session.roomId} sendAction={sendAction} onLeave={leaveRoom} />
      )}
      {session && state && state.phase !== "lobby" && (
        <GameView state={state} myPlayerId={effectivePlayerId} sendAction={sendAction} onLeave={leaveRoom} />
      )}
    </div>
  );
}
