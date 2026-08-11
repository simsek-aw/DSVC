import { useState } from "react";
import { GameState } from "@canos/shared";
import { Wordmark } from "./Wordmark";
import { shareInvite } from "../invite";

interface Props {
  state: GameState;
  myPlayerId: string;
  roomId: string;
  sendAction: (action: any) => void;
  onLeave: () => void;
}

const SCENARIOS: { name: string; icon: string; settings: { secretObjectives: boolean; specialBuildings: boolean; knightForcesDiscard: boolean } }[] = [
  { name: "Klassisch", icon: "🎲", settings: { secretObjectives: false, specialBuildings: false, knightForcesDiscard: false } },
  { name: "Missionen", icon: "🎯", settings: { secretObjectives: true, specialBuildings: false, knightForcesDiscard: false } },
  { name: "Chaos", icon: "🌪️", settings: { secretObjectives: true, specialBuildings: true, knightForcesDiscard: true } },
];

export function WaitingRoom({ state, myPlayerId, roomId, sendAction, onLeave }: Props) {
  const isHost = state.players[0]?.id === myPlayerId;
  const [shareNote, setShareNote] = useState<string | null>(null);
  const [manualLink, setManualLink] = useState<string | null>(null);
  const [seedText, setSeedText] = useState("");

  const applySeed = (text: string) => {
    setSeedText(text);
    const trimmed = text.trim();
    const seed = trimmed === "" ? undefined : Math.abs(parseInt(trimmed, 10)) >>> 0;
    sendAction({ type: "setRoomSettings", settings: { mapSeed: Number.isFinite(seed as number) ? seed : undefined } });
  };

  const activeScenario = SCENARIOS.find(
    (sc) =>
      sc.settings.secretObjectives === state.settings.secretObjectives &&
      sc.settings.specialBuildings === state.settings.specialBuildings &&
      sc.settings.knightForcesDiscard === state.settings.knightForcesDiscard,
  );

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
    <div className="lobby-screen dark">
      <Wordmark />
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
        <p className="room-settings-title">Szenario</p>
        <div className="scenario-row">
          {SCENARIOS.map((sc) => (
            <button
              key={sc.name}
              className={`scenario-chip ${activeScenario?.name === sc.name ? "active" : ""}`}
              disabled={!isHost}
              onClick={() => sendAction({ type: "setRoomSettings", settings: sc.settings })}
            >
              {sc.icon} {sc.name}
            </button>
          ))}
        </div>

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
        <label className={`room-toggle ${!isHost ? "readonly" : ""}`}>
          <input
            type="checkbox"
            checked={state.settings.specialBuildings}
            disabled={!isHost}
            onChange={(e) => sendAction({ type: "setRoomSettings", settings: { specialBuildings: e.target.checked } })}
          />
          <span className="room-toggle-text">
            <strong>🗼 Sonderbauten</strong>
            <span className="hint">Leuchtturm oder Späherturm — mit Effekt, aber nur EINER pro Spieler und keine Siegpunkte.</span>
          </span>
        </label>
        <label className={`room-toggle ${!isHost ? "readonly" : ""}`}>
          <input
            type="checkbox"
            checked={state.settings.knightForcesDiscard}
            disabled={!isHost}
            onChange={(e) => sendAction({ type: "setRoomSettings", settings: { knightForcesDiscard: e.target.checked } })}
          />
          <span className="room-toggle-text">
            <strong>⚔️ Ritter erzwingt Abwerfen</strong>
            <span className="hint">Hausregel: Auch beim Ausspielen eines Ritters wirft jeder mit mehr als 7 Karten die Hälfte ab (sonst nur bei einer gewürfelten 7).</span>
          </span>
        </label>

        <label className={`room-toggle seed-row ${!isHost ? "readonly" : ""}`}>
          <span className="room-toggle-text">
            <strong>🗺️ Karten-Seed</strong>
            <span className="hint">Leer lassen für eine zufällige Insel — oder einen Seed eintragen, um eine bestimmte Karte erneut zu spielen.</span>
          </span>
          <input
            className="seed-input"
            type="text"
            inputMode="numeric"
            placeholder="zufällig"
            value={seedText}
            disabled={!isHost}
            onChange={(e) => applySeed(e.target.value)}
            aria-label="Karten-Seed"
          />
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
