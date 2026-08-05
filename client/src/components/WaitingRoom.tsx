import { GameState } from "@canos/shared";

interface Props {
  state: GameState;
  myPlayerId: string;
  roomId: string;
  sendAction: (action: any) => void;
}

export function WaitingRoom({ state, myPlayerId, roomId, sendAction }: Props) {
  const isHost = state.players[0]?.id === myPlayerId;

  return (
    <div className="lobby-screen">
      <h1>Canos Incognita</h1>
      <p className="subtitle">
        Raum-Code: <span className="room-code">{roomId}</span> — teile ihn mit deinen Mitspielern
      </p>

      <ul className="player-list">
        {state.players.map((p) => (
          <li key={p.id} style={{ borderColor: p.color }}>
            <span className="player-dot" style={{ background: p.color }} />
            {p.name}
            {p.id === myPlayerId && " (du)"}
            {!p.connected && " · offline"}
          </li>
        ))}
      </ul>

      <p className="hint">{state.players.length} / 6 Spieler</p>

      {isHost ? (
        <button className="primary-button" disabled={state.players.length < 2} onClick={() => sendAction({ type: "startGame" })}>
          Spiel starten
        </button>
      ) : (
        <p className="hint">Warte, bis der Host das Spiel startet …</p>
      )}
    </div>
  );
}
