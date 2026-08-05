import { useState } from "react";
import { GameState } from "@canos/shared";
import { HexBoard, BuildMode } from "./HexBoard";

interface Props {
  state: GameState;
  myPlayerId: string;
  sendAction: (action: any) => void;
}

const RESOURCE_LABELS: Record<string, string> = {
  wood: "🪵 Holz",
  brick: "🧱 Lehm",
  ore: "⛏️ Erz",
  wheat: "🌾 Weizen",
  sheep: "🐑 Wolle",
};

export function GameView({ state, myPlayerId, sendAction }: Props) {
  const [buildMode, setBuildMode] = useState<BuildMode>(null);
  const me = state.players.find((p) => p.id === myPlayerId);
  const currentPlayerId = state.turnOrder[state.currentPlayerIndex];
  const currentPlayer = state.players.find((p) => p.id === currentPlayerId);
  const isMyTurn = currentPlayerId === myPlayerId;

  return (
    <div className="game-root">
      <div className="board-area">
        <HexBoard state={state} myPlayerId={myPlayerId} buildMode={buildMode} sendAction={sendAction} />
        <div className="turn-banner">
          {state.phase === "setup" && (
            <span>
              Aufbauphase — {currentPlayer?.name} platziert {state.setupStepAwaitingRoad ? "eine Straße" : "eine Siedlung"}
            </span>
          )}
          {state.phase === "turnOrderRoll" && <span>Würfeln um die Startreihenfolge</span>}
          {state.phase === "mainGame" && <span>Am Zug: {currentPlayer?.name}</span>}
          {state.phase === "ended" && <span>{state.players.find((p) => p.id === state.winnerId)?.name} hat gewonnen! 🏆</span>}
        </div>
      </div>

      <div className="sidebar">
        <div className="player-cards">
          {state.players.map((p) => (
            <div key={p.id} className={`player-card ${p.id === currentPlayerId ? "active" : ""}`} style={{ borderColor: p.color }}>
              <span className="player-dot" style={{ background: p.color }} />
              <span className="player-name">{p.name}</span>
              <span className="player-vp">{p.victoryPoints} VP</span>
              {!p.connected && <span className="offline-badge">offline</span>}
            </div>
          ))}
        </div>

        {me && (
          <div className="resource-panel">
            {Object.entries(RESOURCE_LABELS).map(([key, label]) => (
              <div key={key} className="resource-chip">
                {label}: {me.resources[key as keyof typeof me.resources]}
              </div>
            ))}
          </div>
        )}

        {state.phase === "turnOrderRoll" && me?.turnOrderRoll === null && (
          <button className="primary-button" onClick={() => sendAction({ type: "rollTurnOrder" })}>
            Würfeln
          </button>
        )}

        {state.phase === "mainGame" && isMyTurn && (
          <div className="action-bar">
            {!state.lastDiceRoll && (
              <button className="primary-button" onClick={() => sendAction({ type: "rollDice" })}>
                Würfeln
              </button>
            )}
            {state.lastDiceRoll?.total === 7 && !state.robberTileCoord && (
              <p className="hint">Wähle ein Feld für den Räuber (Tippen aufs Feld)</p>
            )}
            {state.lastDiceRoll && (
              <>
                <button className={buildMode === "road" ? "toggle-active" : ""} onClick={() => setBuildMode(buildMode === "road" ? null : "road")}>
                  🛤️ Straße
                </button>
                <button
                  className={buildMode === "settlement" ? "toggle-active" : ""}
                  onClick={() => setBuildMode(buildMode === "settlement" ? null : "settlement")}
                >
                  🏠 Siedlung
                </button>
                <button className={buildMode === "city" ? "toggle-active" : ""} onClick={() => setBuildMode(buildMode === "city" ? null : "city")}>
                  🏙️ Stadt
                </button>
                <button className="primary-button" onClick={() => sendAction({ type: "endTurn" })}>
                  Zug beenden
                </button>
              </>
            )}
          </div>
        )}

        {state.lastDiceRoll && (
          <div className="dice-display">
            🎲 {state.lastDiceRoll.die1} + {state.lastDiceRoll.die2} = {state.lastDiceRoll.total}
          </div>
        )}

        <div className="log-panel">
          {state.log
            .slice(-30)
            .reverse()
            .map((entry, i) => (
              <div key={i} className="log-entry">
                {entry}
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}
