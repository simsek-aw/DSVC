import { useState } from "react";
import { GameState } from "@canos/shared";
import { shareInvite } from "../invite";

interface Props {
  state: GameState;
  myPlayerId: string;
  roomId: string;
  sendAction: (action: any) => void;
  onLeave: () => void;
}

export function WaitingRoom({ state, myPlayerId, roomId, sendAction, onLeave }: Props) {
  const isHost = state.players[0]?.id === myPlayerId;
  const [shareNote, setShareNote] = useState<string | null>(null);
  const [manualLink, setManualLink] = useState<string | null>(null);

  const onShare = async () => {
    const res = await shareInvite(roomId);
    if (res.kind === "copied") {
      setShareNote("Link kopiert! 📋");
      setTimeout(() => setShareNote(null), 2500);
    } else if (res.kind === "manual") {
      setManualLink(res.url);
    }
  };

  return (
    <div className="lobby-screen">
      <h1>Canos Incognita</h1>
      <p className="subtitle">
        Raum-Code: <span className="room-code">{roomId}</span> — teile ihn mit deinen Mitspielern
      </p>

      <button className="primary-button" onClick={onShare}>
        🔗 Einladungslink teilen
      </button>
      {shareNote && <p className="hint">{shareNote}</p>}
      {manualLink && (
        <input
          className="text-input"
          readOnly
          value={manualLink}
          onFocus={(e) => e.currentTarget.select()}
          aria-label="Einladungslink"
        />
      )}

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

      <div className="room-settings">
        <p className="room-settings-title">Zusatzregeln</p>
        <label className={`room-toggle ${!isHost ? "readonly" : ""}`}>
          <input
            type="checkbox"
            checked={state.settings.secretObjectives}
            disabled={!isHost}
            onChange={(e) => sendAction({ type: "setRoomSettings", settings: { secretObjectives: e.target.checked } })}
          />
          <span className="room-toggle-text">
            <strong>🎯 Geheime Aufträge</strong>
            <span className="hint">Jeder bekommt eine verdeckte Mission für versteckte Siegpunkte.</span>
          </span>
        </label>
      </div>

      {isHost ? (
        <button className="primary-button" disabled={state.players.length < 2} onClick={() => sendAction({ type: "startGame" })}>
          Spiel starten
        </button>
      ) : (
        <p className="hint">Warte, bis der Host das Spiel startet …</p>
      )}

      <button className="secondary-button" onClick={onLeave}>
        Raum verlassen
      </button>
    </div>
  );
}
