import { useState } from "react";
import { DevelopmentCardType, EdgeId, GameState, ResourceType, RESOURCE_TYPES, bestBankRatio, totalVictoryPoints } from "@canos/shared";
import { HexBoard, BuildMode } from "./HexBoard";

interface Props {
  state: GameState;
  myPlayerId: string;
  sendAction: (action: any) => void;
}

const RESOURCE_LABELS: Record<ResourceType, string> = {
  wood: "🪵 Holz",
  brick: "🧱 Lehm",
  ore: "⛏️ Erz",
  wheat: "🌾 Weizen",
  sheep: "🐑 Wolle",
};

const CARD_LABELS: Record<DevelopmentCardType, string> = {
  knight: "⚔️ Ritter",
  roadBuilding: "🛤️ Straßenbau",
  invention: "💡 Erfindung",
  monopoly: "📈 Monopol",
  bribery: "💰 Bestechung",
};

export function GameView({ state, myPlayerId, sendAction }: Props) {
  const [buildMode, setBuildMode] = useState<BuildMode>(null);
  const [freeRoadEdges, setFreeRoadEdges] = useState<EdgeId[]>([]);
  const [inventionPicks, setInventionPicks] = useState<[ResourceType, ResourceType]>(["wood", "wood"]);
  const [monopolyPick, setMonopolyPick] = useState<ResourceType>("wood");
  const [bankGive, setBankGive] = useState<ResourceType>("wood");
  const [bankReceive, setBankReceive] = useState<ResourceType>("brick");
  const [tradeTarget, setTradeTarget] = useState<string>("");
  const [tradeGive, setTradeGive] = useState<Partial<Record<ResourceType, number>>>({});
  const [tradeReceive, setTradeReceive] = useState<Partial<Record<ResourceType, number>>>({});
  const [showTradePanel, setShowTradePanel] = useState(false);
  const [showCards, setShowCards] = useState(false);

  const me = state.players.find((p) => p.id === myPlayerId);
  const currentPlayerId = state.turnOrder[state.currentPlayerIndex];
  const currentPlayer = state.players.find((p) => p.id === currentPlayerId);
  const isMyTurn = currentPlayerId === myPlayerId;
  const otherPlayers = state.players.filter((p) => p.id !== myPlayerId);

  const exitBuildMode = () => {
    setBuildMode(null);
    setFreeRoadEdges([]);
  };

  const onSelectFreeRoadEdge = (edge: EdgeId) => {
    setFreeRoadEdges((prev) => (prev.length >= 2 ? prev : [...prev, edge]));
  };

  const confirmRoadBuilding = () => {
    if (freeRoadEdges.length !== 2) return;
    sendAction({ type: "playRoadBuilding", edges: [freeRoadEdges[0], freeRoadEdges[1]] });
    exitBuildMode();
  };

  const incomingTrade = state.pendingTrade && state.pendingTrade.toPlayerId === myPlayerId ? state.pendingTrade : null;
  const outgoingTrade = state.pendingTrade && state.pendingTrade.fromPlayerId === myPlayerId ? state.pendingTrade : null;

  return (
    <div className="game-root">
      <div className="board-area">
        <HexBoard
          state={state}
          myPlayerId={myPlayerId}
          buildMode={buildMode}
          sendAction={sendAction}
          freeRoadEdges={buildMode === "roadBuilding" ? freeRoadEdges : undefined}
          onSelectFreeRoadEdge={onSelectFreeRoadEdge}
        />
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
        {buildMode === "knight" && <div className="mode-hint">Wähle ein Feld für den Ritter-Räuber</div>}
        {buildMode === "bribery" && <div className="mode-hint">Wähle ein aufgedecktes Feld für die Bestechung</div>}
        {buildMode === "roadBuilding" && (
          <div className="mode-hint">
            {freeRoadEdges.length}/2 Straßen gewählt
            {freeRoadEdges.length === 2 && (
              <button className="primary-button small" onClick={confirmRoadBuilding}>
                Bestätigen
              </button>
            )}
          </div>
        )}
      </div>

      <div className="sidebar">
        <div className="player-cards">
          {state.players.map((p) => (
            <div key={p.id} className={`player-card ${p.id === currentPlayerId ? "active" : ""}`} style={{ borderColor: p.color }}>
              <span className="player-dot" style={{ background: p.color }} />
              <span className="player-name">{p.name}</span>
              <span className="player-vp">{totalVictoryPoints(state, p.id)} VP</span>
              {state.longestRoadPlayerId === p.id && <span className="badge" title="Längste Straße">🛣️</span>}
              {state.largestArmyPlayerId === p.id && <span className="badge" title="Größte Rittermacht">⚔️</span>}
              {!p.connected && <span className="offline-badge">offline</span>}
            </div>
          ))}
        </div>

        {me && (
          <div className="resource-panel">
            {RESOURCE_TYPES.map((key) => (
              <div key={key} className="resource-chip">
                {RESOURCE_LABELS[key]}: {me.resources[key]}
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
            {state.lastDiceRoll?.total === 7 && !state.robberTileCoord && <p className="hint">Wähle ein Feld für den Räuber (Tippen aufs Feld)</p>}
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
                <button onClick={() => sendAction({ type: "buyDevelopmentCard" })}>🃏 Karte kaufen</button>
                <button className={showCards ? "toggle-active" : ""} onClick={() => setShowCards((v) => !v)}>
                  ✋ Hand ({me?.developmentCards.length ?? 0})
                </button>
                <button className={showTradePanel ? "toggle-active" : ""} onClick={() => setShowTradePanel((v) => !v)}>
                  🔁 Handel
                </button>
                <button className="primary-button" onClick={() => sendAction({ type: "endTurn" })}>
                  Zug beenden
                </button>
              </>
            )}
          </div>
        )}

        {showCards && me && (
          <div className="card-panel">
            {me.developmentCards.length === 0 && <p className="hint">Keine Karten auf der Hand.</p>}
            {(["knight", "roadBuilding", "invention", "monopoly", "bribery"] as DevelopmentCardType[]).map((type) => {
              const count = me.developmentCards.filter((c) => c === type).length;
              if (count === 0) return null;
              return (
                <div key={type} className="card-row">
                  <span>
                    {CARD_LABELS[type]} × {count}
                  </span>
                  {type === "knight" && (
                    <button onClick={() => setBuildMode("knight")}>Spielen</button>
                  )}
                  {type === "roadBuilding" && (
                    <button
                      onClick={() => {
                        setBuildMode("roadBuilding");
                        setFreeRoadEdges([]);
                      }}
                    >
                      Spielen
                    </button>
                  )}
                  {type === "bribery" && <button onClick={() => setBuildMode("bribery")}>Spielen</button>}
                  {type === "invention" && (
                    <div className="inline-picker">
                      <select value={inventionPicks[0]} onChange={(e) => setInventionPicks([e.target.value as ResourceType, inventionPicks[1]])}>
                        {RESOURCE_TYPES.map((r) => (
                          <option key={r} value={r}>
                            {RESOURCE_LABELS[r]}
                          </option>
                        ))}
                      </select>
                      <select value={inventionPicks[1]} onChange={(e) => setInventionPicks([inventionPicks[0], e.target.value as ResourceType])}>
                        {RESOURCE_TYPES.map((r) => (
                          <option key={r} value={r}>
                            {RESOURCE_LABELS[r]}
                          </option>
                        ))}
                      </select>
                      <button onClick={() => sendAction({ type: "playInvention", resources: inventionPicks })}>OK</button>
                    </div>
                  )}
                  {type === "monopoly" && (
                    <div className="inline-picker">
                      <select value={monopolyPick} onChange={(e) => setMonopolyPick(e.target.value as ResourceType)}>
                        {RESOURCE_TYPES.map((r) => (
                          <option key={r} value={r}>
                            {RESOURCE_LABELS[r]}
                          </option>
                        ))}
                      </select>
                      <button onClick={() => sendAction({ type: "playMonopoly", resource: monopolyPick })}>OK</button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {showTradePanel && me && state.phase === "mainGame" && isMyTurn && (
          <div className="trade-panel">
            <h4>Bankhandel</h4>
            <div className="inline-picker">
              <select value={bankGive} onChange={(e) => setBankGive(e.target.value as ResourceType)}>
                {RESOURCE_TYPES.map((r) => (
                  <option key={r} value={r}>
                    {RESOURCE_LABELS[r]}
                  </option>
                ))}
              </select>
              <span>({bestBankRatio(state, myPlayerId, bankGive)}:1) →</span>
              <select value={bankReceive} onChange={(e) => setBankReceive(e.target.value as ResourceType)}>
                {RESOURCE_TYPES.map((r) => (
                  <option key={r} value={r}>
                    {RESOURCE_LABELS[r]}
                  </option>
                ))}
              </select>
              <button onClick={() => sendAction({ type: "bankTrade", give: bankGive, receive: bankReceive })}>Handeln</button>
            </div>

            <h4>Spielerhandel</h4>
            <div className="inline-picker">
              <select value={tradeTarget} onChange={(e) => setTradeTarget(e.target.value)}>
                <option value="">Spieler wählen …</option>
                {otherPlayers.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <ResourceCountEditor label="Ich gebe" values={tradeGive} onChange={setTradeGive} />
            <ResourceCountEditor label="Ich will" values={tradeReceive} onChange={setTradeReceive} />
            <button
              className="primary-button small"
              disabled={!tradeTarget || !!state.pendingTrade}
              onClick={() => sendAction({ type: "offerTrade", toPlayerId: tradeTarget, give: tradeGive, receive: tradeReceive })}
            >
              Angebot senden
            </button>
            {outgoingTrade && <p className="hint">Warte auf Antwort von {state.players.find((p) => p.id === outgoingTrade.toPlayerId)?.name} …</p>}
          </div>
        )}

        {incomingTrade && (
          <div className="trade-offer-banner">
            <p>
              {state.players.find((p) => p.id === incomingTrade.fromPlayerId)?.name} bietet dir:{" "}
              {describeResources(incomingTrade.give)} gegen {describeResources(incomingTrade.receive)}
            </p>
            <div className="inline-picker">
              <button className="primary-button small" onClick={() => sendAction({ type: "respondTrade", accept: true })}>
                Annehmen
              </button>
              <button className="small" onClick={() => sendAction({ type: "respondTrade", accept: false })}>
                Ablehnen
              </button>
            </div>
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

function describeResources(r: Partial<Record<ResourceType, number>>): string {
  const parts = RESOURCE_TYPES.filter((t) => (r[t] ?? 0) > 0).map((t) => `${r[t]}x ${RESOURCE_LABELS[t]}`);
  return parts.length > 0 ? parts.join(", ") : "nichts";
}

function ResourceCountEditor({
  label,
  values,
  onChange,
}: {
  label: string;
  values: Partial<Record<ResourceType, number>>;
  onChange: (v: Partial<Record<ResourceType, number>>) => void;
}) {
  return (
    <div className="resource-count-editor">
      <span className="editor-label">{label}</span>
      {RESOURCE_TYPES.map((r) => (
        <label key={r} className="count-field">
          {RESOURCE_LABELS[r]}
          <input
            type="number"
            min={0}
            max={9}
            value={values[r] ?? 0}
            onChange={(e) => onChange({ ...values, [r]: Math.max(0, Number(e.target.value)) })}
          />
        </label>
      ))}
    </div>
  );
}
