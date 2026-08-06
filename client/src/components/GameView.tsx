import { useEffect, useRef, useState } from "react";
import {
  BUILD_COSTS,
  CHAT_MAX_LENGTH,
  CHAT_PREFIX,
  PIECE_LIMITS,
  DevelopmentCardType,
  EdgeId,
  GameState,
  ResourceType,
  RESOURCE_TYPES,
  SCOUT_COST,
  bestBankRatio,
} from "@canos/shared";
import { HexBoard, BuildMode, MapInfo } from "./HexBoard";
import { NegotiationTable } from "./NegotiationTable";
import { DiscardPanel, StealPanel } from "./RobberPanels";
import { ResourceSprite, PixelDie } from "./PixelIcons";

interface Props {
  state: GameState;
  myPlayerId: string;
  sendAction: (action: any) => void;
  onLeave: () => void;
}

const RESOURCE_LABELS: Record<ResourceType, string> = {
  wood: "🪵 Holz",
  brick: "🧱 Lehm",
  ore: "⛏️ Erz",
  wheat: "🌾 Weizen",
  sheep: "🐑 Wolle",
};

const RESOURCE_NAMES: Record<ResourceType, string> = {
  wood: "Holz",
  brick: "Lehm",
  ore: "Erz",
  wheat: "Weizen",
  sheep: "Wolle",
};

const CARD_LABELS: Record<DevelopmentCardType, string> = {
  knight: "⚔️ Ritter",
  roadBuilding: "🛤️ Straßenbau",
  invention: "💡 Erfindung",
  monopoly: "📈 Monopol",
  bribery: "💰 Bestechung",
};

export function GameView({ state, myPlayerId, sendAction, onLeave }: Props) {
  const [buildMode, setBuildMode] = useState<BuildMode>(null);
  // Short explanation of whatever map element was tapped last (port, robber, …).
  const [mapInfo, setMapInfo] = useState<MapInfo | null>(null);
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
  const [confirmingBuyCard, setConfirmingBuyCard] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [logExpanded, setLogExpanded] = useState(false);
  const [chatDraft, setChatDraft] = useState("");
  const [playerMenuId, setPlayerMenuId] = useState<string | null>(null);

  const me = state.players.find((p) => p.id === myPlayerId);
  const currentPlayerId = state.turnOrder[state.currentPlayerIndex];
  const currentPlayer = state.players.find((p) => p.id === currentPlayerId);
  const isMyTurn = currentPlayerId === myPlayerId;
  const otherPlayers = state.players.filter((p) => p.id !== myPlayerId);

  // My remaining physical pieces (classic Catan stock), for the sidebar tally.
  const myPieces = {
    settlement: PIECE_LIMITS.settlement - state.buildings.filter((b) => b.ownerId === myPlayerId && b.type === "settlement").length,
    city: PIECE_LIMITS.city - state.buildings.filter((b) => b.ownerId === myPlayerId && b.type === "city").length,
    road: PIECE_LIMITS.road - state.roads.filter((r) => r.ownerId === myPlayerId).length,
  };

  // What the game is waiting for right now, phrased as a short prompt.
  const currentConnected = currentPlayer?.connected ?? true;
  const myActionHint =
    state.phase === "mainGame" && isMyTurn
      ? state.lastDiceRoll
        ? "Du bist dran — bauen, handeln oder Zug beenden."
        : "Du bist dran — würfeln!"
      : state.phase === "setup" && isMyTurn
      ? state.setupStepAwaitingRoad
        ? "Du bist dran — lege deine Straße."
        : "Du bist dran — setze deine Siedlung."
      : null;
  const waitingFor =
    !isMyTurn && (state.phase === "mainGame" || state.phase === "setup")
      ? `Wartet auf ${currentPlayer?.name ?? "…"}${currentConnected ? " …" : " (offline)"}`
      : null;

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

  const [turnPopup, setTurnPopup] = useState<string | null>(null);
  const [gains, setGains] = useState<{ id: string; resource: ResourceType; amount: number }[]>([]);
  const lastRollKeyRef = useRef<string>("");
  const prevPlayerIndexRef = useRef<number | null>(null);
  const prevResourcesRef = useRef(me?.resources);

  // Announce a fresh dice roll for whoever's turn it is — keyed by the roll's
  // own values (not object identity, since every broadcast recreates the
  // state object even when nothing about the roll actually changed).
  useEffect(() => {
    const key = `${state.lastDiceRoll?.die1 ?? "x"}-${state.lastDiceRoll?.die2 ?? "x"}-${state.currentPlayerIndex}-${state.phase}`;
    if (state.lastDiceRoll && key !== lastRollKeyRef.current) {
      lastRollKeyRef.current = key;
      const roller = state.players.find((p) => p.id === state.turnOrder[state.currentPlayerIndex]);
      setTurnPopup(`🎲 ${roller?.name ?? "Jemand"} würfelt ${state.lastDiceRoll.total}!`);
      const t = setTimeout(() => setTurnPopup(null), 2500);
      return () => clearTimeout(t);
    }
    if (!state.lastDiceRoll) lastRollKeyRef.current = key;
  }, [state.lastDiceRoll, state.currentPlayerIndex, state.phase, state.players, state.turnOrder]);

  // Announce whenever the turn passes to someone new during the main game.
  useEffect(() => {
    if (state.phase !== "mainGame") {
      prevPlayerIndexRef.current = state.currentPlayerIndex;
      return;
    }
    if (prevPlayerIndexRef.current !== null && prevPlayerIndexRef.current !== state.currentPlayerIndex) {
      const nextPlayer = state.players.find((p) => p.id === state.turnOrder[state.currentPlayerIndex]);
      setTurnPopup(`▶️ ${nextPlayer?.name ?? "Jemand"} ist am Zug`);
      const t = setTimeout(() => setTurnPopup(null), 2200);
      prevPlayerIndexRef.current = state.currentPlayerIndex;
      return () => clearTimeout(t);
    }
    prevPlayerIndexRef.current = state.currentPlayerIndex;
  }, [state.currentPlayerIndex, state.phase]);

  // Floating "+N" indicators anchored above whichever resource actually
  // increased (dice production, trades, dev cards, ...).
  useEffect(() => {
    if (!me) return;
    const prev = prevResourcesRef.current;
    if (prev) {
      const newGains: { id: string; resource: ResourceType; amount: number }[] = [];
      for (const r of RESOURCE_TYPES) {
        const diff = me.resources[r] - (prev[r] ?? 0);
        if (diff > 0) newGains.push({ id: `${Date.now()}-${r}-${Math.random()}`, resource: r, amount: diff });
      }
      if (newGains.length > 0) {
        setGains((g) => [...g, ...newGains]);
        newGains.forEach((g) => setTimeout(() => setGains((cur) => cur.filter((x) => x.id !== g.id)), 1600));
      }
    }
    prevResourcesRef.current = me.resources;
  }, [me?.resources]);

  const latestLogEntry = state.log[state.log.length - 1] ?? "";

  // Double-tap on one of my own resource tiles shouts "I need this" to the
  // table. Detected manually rather than via onDoubleClick so it behaves the
  // same on touch, where the synthesized dblclick is unreliable.
  const lastTapRef = useRef<{ resource: ResourceType; at: number } | null>(null);
  const onResourceTap = (resource: ResourceType) => {
    const now = Date.now();
    const prev = lastTapRef.current;
    if (prev && prev.resource === resource && now - prev.at < 400) {
      lastTapRef.current = null;
      sendAction({ type: "requestResource", resource });
    } else {
      lastTapRef.current = { resource, at: now };
    }
  };

  const request = state.resourceRequest;
  const requester = request ? state.players.find((p) => p.id === request.fromPlayerId) : null;
  const iAmRequester = request?.fromPlayerId === myPlayerId;
  // Only players actually holding the wanted resource get asked to help out.
  const canAnswerRequest = !!request && !iAmRequester && !!me && me.resources[request.resource] > 0 && !state.pendingTrade;

  return (
    <div className="game-root">
      <NegotiationTable state={state} myPlayerId={myPlayerId} sendAction={sendAction} />
      <DiscardPanel state={state} myPlayerId={myPlayerId} sendAction={sendAction} />
      <StealPanel state={state} myPlayerId={myPlayerId} sendAction={sendAction} />
      {turnPopup && (
        <div className="turn-popup">
          <span>{turnPopup}</span>
        </div>
      )}
      <div className="board-area">
        <HexBoard
          state={state}
          myPlayerId={myPlayerId}
          buildMode={buildMode}
          sendAction={sendAction}
          freeRoadEdges={buildMode === "roadBuilding" ? freeRoadEdges : undefined}
          onSelectFreeRoadEdge={onSelectFreeRoadEdge}
          onInspect={setMapInfo}
        />
        {mapInfo && (
          <div className="map-info-card" onClick={() => setMapInfo(null)}>
            <div className="map-info-head">
              <strong>{mapInfo.title}</strong>
              <button className="small" onClick={() => setMapInfo(null)}>
                ✕
              </button>
            </div>
            <p>{mapInfo.text}</p>
          </div>
        )}
        <div className="room-code-corner" title="Raum-Code — zum Wiederbeitreten mit demselben Namen eingeben">
          {state.roomId}
        </div>
        <div className="hamburger-menu">
          <button className="hamburger-btn" onClick={() => setMenuOpen((v) => !v)} aria-label="Menü">
            ☰
          </button>
          {menuOpen && (
            <div className="hamburger-dropdown">
              <button
                onClick={() => {
                  setMenuOpen(false);
                  if (window.confirm("Spiel wirklich verlassen? Ein laufendes Spiel kannst du auf diesem Gerät danach nicht mehr fortsetzen.")) {
                    onLeave();
                  }
                }}
              >
                ← Verlassen
              </button>
            </div>
          )}
        </div>
        <div className="turn-banner">
          {state.phase === "setup" && (
            <span>
              Aufbau {state.setupRound}/2{state.setupRound === 2 ? " (rückwärts)" : ""} — {currentPlayer?.name} platziert{" "}
              {state.setupStepAwaitingRoad ? "eine Straße" : "eine Siedlung"}
            </span>
          )}
          {state.phase === "turnOrderRoll" && <span>Würfeln um die Startreihenfolge</span>}
          {state.phase === "mainGame" && <span>Am Zug: {currentPlayer?.name}</span>}
          {state.phase === "ended" && <span>{state.players.find((p) => p.id === state.winnerId)?.name} hat gewonnen! 🏆</span>}
        </div>
        {buildMode === "knight" && <div className="mode-hint">Wähle ein Feld für den Ritter-Räuber</div>}
        {buildMode === "scout" && (
          <div className="mode-hint">Wähle ein verdecktes Nachbarfeld — nur du siehst, was dort liegt</div>
        )}
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
        <div className="sidebar-scroll">
        <div className="player-cards">
          {state.players.map((p) => (
            <div key={p.id} className="player-card-wrap">
              <button
                className={`player-card ${p.id === currentPlayerId ? "active" : ""}`}
                style={{ borderColor: p.color }}
                onClick={() => setPlayerMenuId(playerMenuId === p.id ? null : p.id)}
              >
                <span className="player-dot" style={{ background: p.color }} />
                <span className="player-name">{p.name}</span>
                {state.longestRoadPlayerId === p.id && <span className="badge" title="Längste Straße">🛣️</span>}
                {state.largestArmyPlayerId === p.id && <span className="badge" title="Größte Rittermacht">⚔️</span>}
                {!p.connected && <span className="offline-badge">offline</span>}
              </button>
              {playerMenuId === p.id && p.id !== myPlayerId && (
                <div className="player-menu">
                  <button
                    disabled={!!state.negotiation}
                    onClick={() => {
                      sendAction({ type: "startNegotiation", withPlayerId: p.id });
                      setPlayerMenuId(null);
                    }}
                  >
                    🤝 Traden
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>

        {myActionHint && <div className="action-hint you">{myActionHint}</div>}
        {waitingFor && <div className="action-hint waiting">⏳ {waitingFor}</div>}

        {/* My remaining stock of pieces. */}
        {(state.phase === "mainGame" || state.phase === "setup") && (
          <div className="piece-tally" title="Deine verbleibenden Bauteile">
            <span className={myPieces.road === 0 ? "depleted" : ""}>🛤️ {myPieces.road}</span>
            <span className={myPieces.settlement === 0 ? "depleted" : ""}>🏠 {myPieces.settlement}</span>
            <span className={myPieces.city === 0 ? "depleted" : ""}>🏙️ {myPieces.city}</span>
          </div>
        )}

        {state.phase === "setup" && (
          <p className="hint setup-note">
            Schlangenreihenfolge: Runde 2 läuft rückwärts — wer zuletzt gelegt hat, ist direkt nochmal dran.
          </p>
        )}

        {state.phase === "mainGame" && isMyTurn && state.lastDiceRoll && !confirmingBuyCard && (
          <div className="build-bar">
            <BuildTile
              icon="🛤️"
              label="Straße"
              cost={BUILD_COSTS.road}
              resources={me?.resources}
              active={buildMode === "road"}
              onClick={() => setBuildMode(buildMode === "road" ? null : "road")}
            />
            <BuildTile
              icon="🏠"
              label="Siedlung"
              cost={BUILD_COSTS.settlement}
              resources={me?.resources}
              active={buildMode === "settlement"}
              onClick={() => setBuildMode(buildMode === "settlement" ? null : "settlement")}
            />
            <BuildTile
              icon="🏙️"
              label="Stadt"
              cost={BUILD_COSTS.city}
              resources={me?.resources}
              active={buildMode === "city"}
              onClick={() => setBuildMode(buildMode === "city" ? null : "city")}
            />
            <BuildTile
              icon="🃏"
              label="Entwicklung"
              cost={BUILD_COSTS.developmentCard}
              resources={me?.resources}
              active={false}
              onClick={() => setConfirmingBuyCard(true)}
            />
            <BuildTile
              icon="🔭"
              label="Spähen"
              cost={SCOUT_COST}
              resources={me?.resources}
              active={buildMode === "scout"}
              onClick={() => setBuildMode(buildMode === "scout" ? null : "scout")}
            />
          </div>
        )}

        {confirmingBuyCard && (
          <div className="confirm-banner">
            <span>Entwicklungskarte kaufen ({describeResources(BUILD_COSTS.developmentCard)})?</span>
            <div className="inline-picker">
              <button
                className="primary-button small"
                onClick={() => {
                  sendAction({ type: "buyDevelopmentCard" });
                  setConfirmingBuyCard(false);
                }}
              >
                Ja, kaufen
              </button>
              <button className="small" onClick={() => setConfirmingBuyCard(false)}>
                Abbrechen
              </button>
            </div>
          </div>
        )}

        {me && (
          <div className="resource-panel">
            {RESOURCE_TYPES.map((key) => (
              <div
                key={key}
                className={`resource-chip ${request?.resource === key && iAmRequester ? "requested" : ""}`}
                title={`${RESOURCE_LABELS[key]} — doppelt tippen, um danach zu fragen`}
                onPointerDown={() => onResourceTap(key)}
              >
                {gains
                  .filter((g) => g.resource === key)
                  .map((g) => (
                    <span key={g.id} className="gain-indicator">
                      +{g.amount}
                    </span>
                  ))}
                <span className="resource-icon">
                  <ResourceSprite resource={key} size={26} />
                </span>
                <span className="resource-count">{me.resources[key]}</span>
              </div>
            ))}
          </div>
        )}

        {/* An arriving offer takes over this slot, so the "waiting for offers"
            line is replaced right where the player is already looking rather
            than the answer showing up somewhere further down. */}
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

        {request && iAmRequester && !incomingTrade && (
          <div className="request-banner own">
            <span>
              Du suchst <ResourceSprite resource={request.resource} size={18} /> {RESOURCE_NAMES[request.resource]} — warte auf
              Angebote …
            </span>
            <button className="small" onClick={() => sendAction({ type: "cancelResourceRequest" })}>
              Abbrechen
            </button>
          </div>
        )}

        {canAnswerRequest && request && (
          <div className="request-banner">
            <span>
              {requester?.name} braucht <ResourceSprite resource={request.resource} size={18} />{" "}
              {RESOURCE_NAMES[request.resource]} — was willst du dafür?
            </span>
            <div className="request-options">
              {RESOURCE_TYPES.filter((r) => r !== request.resource).map((r) => (
                <button key={r} onClick={() => sendAction({ type: "offerQuickTrade", wantInReturn: r })} title={RESOURCE_LABELS[r]}>
                  <ResourceSprite resource={r} size={24} />
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Same dice widget for the opening roll and for every turn. */}
        {state.phase === "turnOrderRoll" && (
          <div className="action-bar">
            <DiceRoller serverRoll={me?.turnOrderRoll ?? null} onRoll={() => sendAction({ type: "rollTurnOrder" })} keepResult />
          </div>
        )}

        {state.phase === "mainGame" && isMyTurn && !state.lastDiceRoll && (
          <div className="action-bar">
            <DiceRoller serverRoll={null} onRoll={() => sendAction({ type: "rollDice" })} />
          </div>
        )}

        {state.phase === "mainGame" && isMyTurn && state.lastDiceRoll?.total === 7 && !state.robberTileCoord && (
          <p className="hint">Wähle ein Feld für den Räuber (Tippen aufs Feld)</p>
        )}

        {/* Log and chat are one stream: messages land where players already
            look for events, and the input sits right underneath. */}
        <div className="log-panel">
          <button className="log-header" onClick={() => setLogExpanded((v) => !v)}>
            <span className="log-latest">{latestLogEntry}</span>
            <span className="log-toggle-arrow">{logExpanded ? "▾" : "▸"}</span>
          </button>
          {logExpanded && (
            <div className="log-entries">
              {state.log
                .slice(-40)
                .reverse()
                .map((entry, i) => (
                  <div key={i} className={`log-entry ${entry.startsWith(CHAT_PREFIX) ? "chat" : ""}`}>
                    {entry}
                  </div>
                ))}
            </div>
          )}
          <form
            className="chat-row"
            onSubmit={(e) => {
              e.preventDefault();
              const text = chatDraft.trim();
              if (!text) return;
              sendAction({ type: "sendChat", text });
              setChatDraft("");
              setLogExpanded(true);
            }}
          >
            <input
              className="chat-input"
              placeholder="Nachricht an alle …"
              value={chatDraft}
              maxLength={CHAT_MAX_LENGTH}
              onChange={(e) => setChatDraft(e.target.value)}
            />
            <button className="chat-send" type="submit" disabled={!chatDraft.trim()} aria-label="Senden">
              ➤
            </button>
          </form>
        </div>

        </div>
        {/* Bottom dock: pinned to the lower edge, its panels grow upward. */}
        <div className="dock">
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

          {state.phase === "mainGame" && isMyTurn && state.lastDiceRoll && (
            <div className="bottom-actions">
              <button className={showCards ? "toggle-active" : ""} onClick={() => setShowCards((v) => !v)}>
                🃏 Karten ({me?.developmentCards.length ?? 0})
              </button>
              <button className={showTradePanel ? "toggle-active" : ""} onClick={() => setShowTradePanel((v) => !v)}>
                🔁 Handel
              </button>
              <button className="primary-button" onClick={() => sendAction({ type: "endTurn" })}>
                Zug beenden
              </button>
              {/* Keeps this turn's roll on screen instead of the dice vanishing. */}
              <div className="dice-result-tile" title="Dein Wurf in dieser Runde">
                <span className="dice-result-faces">
                  <PixelDie value={state.lastDiceRoll.die1} size={18} />
                  <PixelDie value={state.lastDiceRoll.die2} size={18} />
                </span>
                <span className="dice-result-total">{state.lastDiceRoll.total}</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}


function DiceRoller({
  serverRoll,
  onRoll,
  keepResult = false,
}: {
  serverRoll: { die1: number; die2: number; total: number } | null;
  onRoll: () => void;
  keepResult?: boolean;
}) {
  const [rolling, setRolling] = useState(false);
  const [display, setDisplay] = useState<[number, number]>([1, 1]);
  const dragStartRef = useRef<{ x: number; y: number; t: number } | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const triggerRoll = () => {
    if (rolling || serverRoll) return;
    setRolling(true);
    intervalRef.current = setInterval(() => {
      setDisplay([1 + Math.floor(Math.random() * 6), 1 + Math.floor(Math.random() * 6)]);
    }, 80);
    onRoll();
  };

  // Once the server's real roll arrives, let the tumble play a little longer
  // then settle on the actual faces — a "swipe and immediately snap" felt
  // less physical than a brief tumble even when the round-trip is instant.
  useEffect(() => {
    if (serverRoll && rolling) {
      const settle = setTimeout(() => {
        if (intervalRef.current) clearInterval(intervalRef.current);
        setDisplay([serverRoll.die1, serverRoll.die2]);
        setRolling(false);
      }, 500);
      return () => clearTimeout(settle);
    }
  }, [serverRoll, rolling]);

  useEffect(() => () => {
    if (intervalRef.current) clearInterval(intervalRef.current);
  }, []);

  if (serverRoll && !rolling) {
    // Already rolled. Either keep the faces on screen (opening roll, where
    // there is no other place showing them) or step aside for whatever does.
    if (!keepResult) return null;
    return (
      <div className="dice-roller settled">
        <PixelDie value={serverRoll.die1} size={30} />
        <PixelDie value={serverRoll.die2} size={30} />
        <span className="dice-hint">= {serverRoll.total}</span>
      </div>
    );
  }

  const onPointerDown = (e: React.PointerEvent) => {
    dragStartRef.current = { x: e.clientX, y: e.clientY, t: Date.now() };
  };
  const onPointerUp = (e: React.PointerEvent) => {
    const start = dragStartRef.current;
    dragStartRef.current = null;
    if (!start) return;
    const dist = Math.hypot(e.clientX - start.x, e.clientY - start.y);
    const dt = Date.now() - start.t;
    // A clear flick (far + fast) or a plain tap/press both roll.
    if ((dist > 15 && dt < 600) || dist < 8) triggerRoll();
  };

  return (
    <div
      className={`dice-roller ${rolling ? "rolling" : ""}`}
      style={{ touchAction: "none" }}
      role="button"
      tabIndex={0}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") triggerRoll();
      }}
    >
      <PixelDie value={display[0]} size={30} />
      <PixelDie value={display[1]} size={30} />
      <span className="dice-hint">{rolling ? "…" : "Drücken zum Würfeln"}</span>
    </div>
  );
}

function canAfford(resources: Record<ResourceType, number> | undefined, cost: Partial<Record<ResourceType, number>>): boolean {
  if (!resources) return false;
  return RESOURCE_TYPES.every((r) => resources[r] >= (cost[r] ?? 0));
}

function BuildTile({
  icon,
  label,
  cost,
  resources,
  active,
  onClick,
}: {
  icon: string;
  label: string;
  cost: Partial<Record<ResourceType, number>>;
  resources: Record<ResourceType, number> | undefined;
  active: boolean;
  onClick: () => void;
}) {
  const affordable = canAfford(resources, cost);
  return (
    <button
      className={`build-tile ${active ? "toggle-active" : ""}`}
      disabled={!affordable}
      onClick={onClick}
      title={!affordable ? "Nicht genug Rohstoffe" : undefined}
    >
      <span className="build-tile-icon">{icon}</span>
      <span className="build-tile-label">{label}</span>
      <span className="build-tile-cost">
        {RESOURCE_TYPES.filter((r) => (cost[r] ?? 0) > 0).map((r) => (
          <span key={r} className="build-tile-cost-item">
            <ResourceSprite resource={r} size={12} />
            {cost[r]}
          </span>
        ))}
      </span>
    </button>
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
