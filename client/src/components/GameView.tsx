import { useEffect, useRef, useState } from "react";
import {
  BUILD_COSTS,
  CHAT_MAX_LENGTH,
  CHAT_PREFIX,
  ROUND_MARKER,
  PIECE_LIMITS,
  DevelopmentCardType,
  EdgeId,
  GameState,
  ResourceType,
  RESOURCE_TYPES,
  SCOUT_COST,
  TILE_SIZE,
  HAND_LIMIT_ON_SEVEN,
  VICTORY_POINTS_TO_WIN,
  axialKey,
  bestBankRatio,
  buildBoardGraph,
  handSize,
  longestRoadLength,
  tilesTouchingVertex,
  totalVictoryPoints,
  objectiveComplete,
  SECRET_OBJECTIVES,
  SPECIAL_BUILDINGS,
  SpecialBuildingId,
} from "@canos/shared";
import { HexBoard, BuildMode, MapInfo, BoardApi } from "./HexBoard";
import { NegotiationTable } from "./NegotiationTable";
import { DiscardPanel, StealPanel } from "./RobberPanels";
import { VictoryScreen } from "./VictoryScreen";
import { ResourceSprite, PixelDie } from "./PixelIcons";
import { shareInvite } from "../invite";

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

// Leading emojis the engine puts on "big play" log lines worth a popup.
const ANNOUNCE_EMOJIS = ["⚔️", "🏅", "🛣️", "📈", "💡", "🛤️", "💰", "🎁"];

const HELP_TEXT = [
  "Ziel: 10 Siegpunkte. Siedlung = 1, Stadt = 2, Längste Straße & Größte Rittermacht je +2.",
  "",
  "Bauen: 🛤️ Straße = Holz+Lehm · 🏠 Siedlung = Holz+Lehm+Weizen+Wolle · 🏙️ Stadt = 2 Weizen+3 Erz · 🃏 Karte = Erz+Weizen+Wolle.",
  "",
  "Würfeln: Jede Zahl liefert allen Anliegern die Ressource des Feldes. Bei einer 7 zieht der Räuber, und wer mehr als 7 Karten hat, wirft die Hälfte ab.",
  "",
  "Handel: 🔁 mit der Bank (Rate je nach Hafen) oder per Verhandlungstisch mit Mitspielern (Chip doppeltippen).",
  "",
  "Verdeckt: Felder sind erst aufgedeckt, wenn eine Siedlung sie berührt — spähen (🔭) zeigt sie dir privat.",
].join("\n");

// A resource sprite in flight from a producing tile to its resource chip.
interface Flight {
  id: string;
  resource: ResourceType;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}
const FLIGHT_MS = 620;

function FlyingSprite({ flight }: { flight: Flight }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || !el.animate) return;
    const anim = el.animate(
      [
        { transform: `translate(${flight.x0}px, ${flight.y0}px) scale(1.35)`, opacity: 0 },
        { opacity: 1, offset: 0.18 },
        { transform: `translate(${flight.x1}px, ${flight.y1}px) scale(0.65)`, opacity: 0.85 },
      ],
      { duration: FLIGHT_MS, easing: "cubic-bezier(.4,.02,.4,1)", fill: "forwards" },
    );
    return () => anim.cancel();
  }, []);
  return (
    <div ref={ref} className="fly-sprite">
      <ResourceSprite resource={flight.resource} size={22} />
    </div>
  );
}

const WEATHER_INFO: Record<string, { icon: string; title: string }> = {
  bounty: { icon: "☀️", title: "Reiche Ernte" },
  drought: { icon: "🌵", title: "Dürre" },
  fair: { icon: "🧭", title: "Fernhandel" },
  storm: { icon: "🌊", title: "Sturm" },
};

// Mirrors the engine's log wording, so the tap-to-explain card reads the same.
function describeWeather(w: NonNullable<GameState["weather"]>): string {
  switch (w.kind) {
    case "bounty":
      return `Die ${w.number} liefert diese Runde die doppelte Ernte — für alle.`;
    case "drought":
      return `${RESOURCE_NAMES[w.terrain as ResourceType]} liefert diese Runde nichts.`;
    case "fair":
      return "Bank-Tausch ist diese Runde 1 günstiger (nie unter 2:1).";
    case "storm":
      return "Die Häfen sind diese Runde gesperrt — es gilt nur der 4:1-Bankkurs.";
    default:
      return "";
  }
}

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
  const [showTradePanel, setShowTradePanel] = useState(false);
  const [showCards, setShowCards] = useState(false);
  const [showBuild, setShowBuild] = useState(false);
  const [confirmingBuyCard, setConfirmingBuyCard] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [logExpanded, setLogExpanded] = useState(false);
  const [chatDraft, setChatDraft] = useState("");
  const [setupNoteDismissed, setSetupNoteDismissed] = useState(false);
  const [vpPeek, setVpPeek] = useState<{ id: string; vp: number } | null>(null);

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

  // How many distinct builds my current resources (and remaining pieces) allow
  // right now — drives the little "you can build" badge on the Bauen button.
  // Purely resource/stock based, as requested: it doesn't check for a legal spot.
  const affordableBuildCount = !me
    ? 0
    : [
        canAfford(me.resources, BUILD_COSTS.road) && myPieces.road > 0,
        canAfford(me.resources, BUILD_COSTS.settlement) && myPieces.settlement > 0,
        canAfford(me.resources, BUILD_COSTS.city) &&
          myPieces.city > 0 &&
          state.buildings.some((b) => b.ownerId === myPlayerId && b.type === "settlement"),
        canAfford(me.resources, BUILD_COSTS.developmentCard),
        ...(state.settings.specialBuildings && !state.players.some((p) => p.id === myPlayerId && p.specialBuildings.length > 0)
          ? Object.values(SPECIAL_BUILDINGS).map((s) => canAfford(me.resources, s.cost))
          : []),
      ].filter(Boolean).length;

  // What the game is waiting for right now, phrased as a short prompt.
  const currentConnected = currentPlayer?.connected ?? true;
  const myActionHint =
    state.phase === "mainGame" && isMyTurn
      ? state.lastDiceRoll
        ? "Du bist dran"
        : "Du bist dran — würfeln!"
      : state.phase === "setup" && isMyTurn
      ? state.setupStepAwaitingRoad
        ? "Du bist dran — lege deine Straße"
        : "Du bist dran — setze deine Siedlung"
      : null;
  const waitingFor =
    !isMyTurn && (state.phase === "mainGame" || state.phase === "setup")
      ? `Wartet auf ${currentPlayer?.name ?? "…"}${currentConnected ? " …" : " (offline)"}`
      : null;

  // One combined status line for the top banner — replaces the separate sidebar
  // info box so the "whose turn / what now" text lives in a single place.
  const winnerName = state.players.find((p) => p.id === state.winnerId)?.name ?? "Niemand";
  const bannerStatus =
    state.phase === "ended"
      ? `${winnerName} hat gewonnen! 🏆`
      : state.phase === "turnOrderRoll"
      ? "Würfelt um die Startreihenfolge"
      : myActionHint
      ? myActionHint
      : state.phase === "setup"
      ? `Aufbau ${state.setupRound}/2 — ${currentPlayer?.name ?? "…"} ${
          state.setupStepAwaitingRoad ? "legt eine Straße" : "legt eine Siedlung"
        }`
      : waitingFor ?? `Am Zug: ${currentPlayer?.name ?? "…"}`;
  const bannerIsYou = isMyTurn && (state.phase === "mainGame" || state.phase === "setup");

  // My own progress — shown only to me, so opponents stay a guessing game.
  const myVP = totalVictoryPoints(state, myPlayerId);
  const myRoad = longestRoadLength(state.roads, myPlayerId);
  const myKnights = me?.knightsPlayed ?? 0;
  const myHand = me ? handSize(me) : 0;
  const overHandLimit = myHand > HAND_LIMIT_ON_SEVEN;

  const exitBuildMode = () => {
    setBuildMode(null);
    setFreeRoadEdges([]);
  };

  // Safety net: never leave a build/aim mode (and its hint) hanging once it's
  // no longer my turn.
  useEffect(() => {
    if (!isMyTurn) {
      setBuildMode(null);
      setFreeRoadEdges([]);
    }
  }, [isMyTurn]);

  const onSelectFreeRoadEdge = (edge: EdgeId) => {
    setFreeRoadEdges((prev) => (prev.length >= 2 ? prev : [...prev, edge]));
  };

  const confirmRoadBuilding = () => {
    if (freeRoadEdges.length !== 2) return;
    sendAction({ type: "playRoadBuilding", edges: [freeRoadEdges[0], freeRoadEdges[1]] });
    exitBuildMode();
  };

  const incomingTrade = state.pendingTrade && state.pendingTrade.toPlayerId === myPlayerId ? state.pendingTrade : null;

  const [turnPopup, setTurnPopup] = useState<string | null>(null);
  const [gains, setGains] = useState<{ id: string; resource: ResourceType; amount: number }[]>([]);
  // The counts actually shown on the deck. They trail the real resources during
  // a fly-in so the number only ticks up once the sprite has landed.
  const [shownResources, setShownResources] = useState(me?.resources);
  const [flights, setFlights] = useState<Flight[]>([]);
  const boardApiRef = useRef<BoardApi | null>(null);
  const chipRefs = useRef<Partial<Record<ResourceType, HTMLDivElement | null>>>({});
  const lastRollKeyRef = useRef<string>("");
  const prevPlayerIndexRef = useRef<number | null>(null);
  const prevResourcesRef = useRef(me?.resources);
  const prevStealRef = useRef(state.pendingSteal);
  const notifiedRef = useRef(false);
  const logSeenRef = useRef(state.log.length);
  const prodRollRef = useRef<string>("");

  // Big plays (knight, monopoly, longest road, …) get the same popup treatment
  // as a dice roll. The engine tags those log lines with a leading emoji, so a
  // freshly-added line starting with one of them is worth announcing to all.
  useEffect(() => {
    const seen = logSeenRef.current;
    logSeenRef.current = state.log.length;
    if (state.log.length <= seen) return;
    const fresh = state.log.slice(seen);
    const notable = [...fresh].reverse().find((line) => ANNOUNCE_EMOJIS.some((e) => line.startsWith(e)));
    if (notable) {
      setTurnPopup(notable);
      const t = setTimeout(() => setTurnPopup(null), 2800);
      return () => clearTimeout(t);
    }
  }, [state.log]);

  // "It's your turn" reminder for the long-game / async case: when the turn
  // becomes mine while the tab is in the background, flash the tab title and —
  // if the player granted it — fire a browser notification. No server or push
  // subscription needed, so it survives the free-tier host resetting.
  const myTurnActive = isMyTurn && (state.phase === "mainGame" || state.phase === "setup");
  useEffect(() => {
    if (!myTurnActive) {
      notifiedRef.current = false;
      return;
    }
    if (notifiedRef.current) return;
    notifiedRef.current = true;
    if (typeof document !== "undefined" && document.hidden) {
      document.title = "▶ Du bist dran!";
      if ("Notification" in window && Notification.permission === "granted") {
        try {
          new Notification("Canos Incognita", { body: "Du bist am Zug!", tag: "canos-turn" });
        } catch {
          /* some browsers only allow notifications from a service worker; ignore */
        }
      }
    }
  }, [myTurnActive]);

  // Pop a big announcement whenever the island event changes.
  const weatherKeyRef = useRef<string>("");
  useEffect(() => {
    const key = state.weather ? `${state.weather.kind}-${state.roundCount}` : "";
    if (key && key !== weatherKeyRef.current) {
      weatherKeyRef.current = key;
      setTurnPopup(`${WEATHER_INFO[state.weather!.kind].icon} ${WEATHER_INFO[state.weather!.kind].title}!`);
      const t = setTimeout(() => setTurnPopup(null), 2800);
      return () => clearTimeout(t);
    }
    if (!key) weatherKeyRef.current = "";
  }, [state.weather, state.roundCount]);

  // Put the title back the moment the player looks at the tab again.
  useEffect(() => {
    const restore = () => {
      if (!document.hidden) document.title = "Canos Incognita";
    };
    document.addEventListener("visibilitychange", restore);
    window.addEventListener("focus", restore);
    return () => {
      document.removeEventListener("visibilitychange", restore);
      window.removeEventListener("focus", restore);
    };
  }, []);

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

  // Builds one flight per producing building-tile pair I own for the rolled
  // number: a sprite from the tile's screen position to its resource chip.
  const spawnHarvestFlights = (total: number): Flight[] => {
    const api = boardApiRef.current;
    if (!api) return [];
    const graph = buildBoardGraph(state.tiles, TILE_SIZE);
    const out: Flight[] = [];
    for (const b of state.buildings) {
      if (b.ownerId !== myPlayerId) continue;
      for (const coord of tilesTouchingVertex(graph, b.vertex)) {
        const tile = state.tiles.find((t) => axialKey(t.coord) === axialKey(coord));
        if (!tile || !tile.revealed || tile.hasClassicRobber) continue;
        if (tile.numberToken !== total || tile.terrain === "desert" || tile.terrain === "unknown") continue;
        const from = api.getTileScreenPos(tile.coord);
        const chip = chipRefs.current[tile.terrain as ResourceType]?.getBoundingClientRect();
        if (!from || !chip) continue;
        const count = b.type === "city" ? 2 : 1; // a city pulls twice as much
        for (let i = 0; i < count; i++) {
          out.push({
            id: `${Date.now()}-${axialKey(tile.coord)}-${b.type}-${i}-${Math.random()}`,
            resource: tile.terrain as ResourceType,
            x0: from.x,
            y0: from.y,
            x1: chip.x + chip.width / 2,
            y1: chip.y + chip.height / 2,
          });
        }
      }
    }
    return out;
  };

  // Flights for the starting resources: one sprite per non-desert tile around
  // the settlement just placed, so setup collection is as visible as a harvest.
  const spawnSetupFlights = (): Flight[] => {
    const api = boardApiRef.current;
    if (!api) return [];
    const myLast = [...state.buildings].reverse().find((b) => b.ownerId === myPlayerId);
    if (!myLast) return [];
    const graph = buildBoardGraph(state.tiles, TILE_SIZE);
    const out: Flight[] = [];
    for (const coord of tilesTouchingVertex(graph, myLast.vertex)) {
      const tile = state.tiles.find((t) => axialKey(t.coord) === axialKey(coord));
      if (!tile || !tile.revealed || tile.terrain === "desert" || tile.terrain === "unknown") continue;
      const from = api.getTileScreenPos(tile.coord);
      const chip = chipRefs.current[tile.terrain as ResourceType]?.getBoundingClientRect();
      if (!from || !chip) continue;
      out.push({
        id: `${Date.now()}-setup-${axialKey(tile.coord)}-${Math.random()}`,
        resource: tile.terrain as ResourceType,
        x0: from.x,
        y0: from.y,
        x1: chip.x + chip.width / 2,
        y1: chip.y + chip.height / 2,
      });
    }
    return out;
  };

  // When I rob someone on a 7, the card I drew is now revealed to me as a real
  // resource: fly it out of the robber's tile into the matching chip so the
  // steal reads the same way a harvest does, then let the "+1" land with it.
  const spawnStealFlight = (resource: ResourceType): Flight[] => {
    const api = boardApiRef.current;
    const chip = chipRefs.current[resource]?.getBoundingClientRect();
    if (!chip) return [];
    const robberTile = state.tiles.find((t) => t.hasClassicRobber);
    const from = robberTile && api ? api.getTileScreenPos(robberTile.coord) : null;
    const x0 = from?.x ?? window.innerWidth / 2;
    const y0 = from?.y ?? window.innerHeight / 2;
    return [
      {
        id: `${Date.now()}-steal-${resource}-${Math.random()}`,
        resource,
        x0,
        y0,
        x1: chip.x + chip.width / 2,
        y1: chip.y + chip.height / 2,
      },
    ];
  };

  // Resource gains: a floating "+N" per resource that increased. When the gain
  // comes from dice production, a sprite first flies out of each producing tile
  // into the matching resource, and the "+N" only pops once it lands.
  useEffect(() => {
    if (!me) return;
    const prev = prevResourcesRef.current;
    prevResourcesRef.current = me.resources;
    if (!prev) return;

    const newGains: { id: string; resource: ResourceType; amount: number }[] = [];
    for (const r of RESOURCE_TYPES) {
      const diff = me.resources[r] - (prev[r] ?? 0);
      if (diff > 0) newGains.push({ id: `${Date.now()}-${r}-${Math.random()}`, resource: r, amount: diff });
    }
    // Pure losses/no-ops: reflect the new counts right away, nothing to animate.
    if (newGains.length === 0) {
      setShownResources(me.resources);
      return;
    }

    const showGains = () => {
      setGains((g) => [...g, ...newGains]);
      newGains.forEach((g) => setTimeout(() => setGains((cur) => cur.filter((x) => x.id !== g.id)), 1600));
    };

    // Did this gain come from robbing someone? The steal that just resolved had
    // me as the thief and cleared with a single +1 — fly that card in.
    const wasThief = !!prevStealRef.current && prevStealRef.current.thiefId === myPlayerId;
    const justStole =
      wasThief && !state.pendingSteal && newGains.length === 1 && newGains[0].amount === 1;

    // Is this a dice harvest? Then start the flights from the actual tiles.
    const roll = state.lastDiceRoll;
    const rollKey = roll ? `${roll.die1}-${roll.die2}-${state.currentPlayerIndex}` : "";
    const isProduction = !!roll && roll.total !== 7 && rollKey !== prodRollRef.current;
    const spawned = justStole
      ? spawnStealFlight(newGains[0].resource)
      : isProduction
      ? spawnHarvestFlights(roll!.total)
      : state.phase === "setup"
      ? spawnSetupFlights()
      : [];

    if (spawned.length > 0) {
      prodRollRef.current = rollKey;
      setFlights((f) => [...f, ...spawned]);
      spawned.forEach((fl) => setTimeout(() => setFlights((cur) => cur.filter((x) => x.id !== fl.id)), FLIGHT_MS + 60));
      // The "+N" and the higher deck count both land WITH the sprite, so the
      // number never ticks up before the resource has visibly arrived.
      const landed = me.resources;
      const t = setTimeout(() => {
        showGains();
        setShownResources(landed);
      }, FLIGHT_MS - 80);
      return () => clearTimeout(t);
    }
    // Non-harvest gains (trade, dev card, treasure): show the count right away.
    showGains();
    setShownResources(me.resources);
  }, [me?.resources]);

  // Track the steal in flight so the gain effect above can tell a robbery apart
  // from any other +1. Runs after that effect, so it still sees the old value.
  useEffect(() => {
    prevStealRef.current = state.pendingSteal;
  }, [state.pendingSteal]);

  // A trade is started by DOUBLE-tapping a player's chip (single taps are too
  // easy to trigger by accident). We show a one-time hint the first time.
  const lastChipTapRef = useRef<{ id: string; at: number } | null>(null);
  const chipTapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [tradeHintSeen, setTradeHintSeen] = useState(() => {
    try {
      return localStorage.getItem("canos_trade_hint") === "1";
    } catch {
      return false;
    }
  });
  const markTradeHintSeen = () => {
    setTradeHintSeen(true);
    try {
      localStorage.setItem("canos_trade_hint", "1");
    } catch {
      /* ignore */
    }
  };
  // Single tap peeks a player's known victory points; double tap starts a trade
  // (when allowed). A short timer tells the two gestures apart.
  const onChipTap = (pid: string, canTrade: boolean) => {
    const now = Date.now();
    const prev = lastChipTapRef.current;
    if (prev && prev.id === pid && now - prev.at < 450) {
      lastChipTapRef.current = null;
      if (chipTapTimerRef.current) clearTimeout(chipTapTimerRef.current);
      setVpPeek(null);
      if (canTrade) {
        markTradeHintSeen();
        sendAction({ type: "startNegotiation", withPlayerId: pid });
      }
    } else {
      lastChipTapRef.current = { id: pid, at: now };
      if (chipTapTimerRef.current) clearTimeout(chipTapTimerRef.current);
      chipTapTimerRef.current = setTimeout(() => {
        setVpPeek({ id: pid, vp: totalVictoryPoints(state, pid) });
        setTimeout(() => setVpPeek((cur) => (cur && cur.id === pid ? null : cur)), 1900);
      }, 460);
    }
  };
  // Auto-dismiss the one-time hint after a few seconds even if untouched.
  const someTradable =
    state.phase === "mainGame" && !state.negotiation && state.players.some((p) => p.id !== myPlayerId);
  useEffect(() => {
    if (tradeHintSeen || !someTradable) return;
    const t = setTimeout(markTradeHintSeen, 7000);
    return () => clearTimeout(t);
  }, [tradeHintSeen, someTradable]);

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

  // Log + chat, pinned at the very bottom of the dock (below the action row).
  const logPanel = (
    <div className="log-panel">
      {!logExpanded && (
        <button className="log-preview" onClick={() => setLogExpanded(true)} title="Verlauf & Chat öffnen">
          <span className="log-preview-lines">
            {state.log.slice(-3).map((entry, i) =>
              entry.startsWith(ROUND_MARKER) ? (
                <span key={i} className="log-round-inline">{entry.replace(new RegExp(`^${ROUND_MARKER}\\s*`), "")}</span>
              ) : (
                <span key={i} className={`log-line ${entry.startsWith(CHAT_PREFIX) ? "chat" : ""}`}>{entry}</span>
              ),
            )}
          </span>
          <span className="log-toggle-arrow">▸</span>
        </button>
      )}
      {logExpanded && (
        <>
          <button className="log-header" onClick={() => setLogExpanded(false)}>
            <span className="log-latest">Verlauf &amp; Chat</span>
            <span className="log-toggle-arrow">▾</span>
          </button>
          <div className="log-entries">
            {state.log
              .slice(-40)
              .reverse()
              .map((entry, i) =>
                entry.startsWith(ROUND_MARKER) ? (
                  <div key={i} className="log-round">
                    {entry.replace(new RegExp(`^${ROUND_MARKER}\\s*`), "")}
                  </div>
                ) : (
                  <div key={i} className={`log-entry ${entry.startsWith(CHAT_PREFIX) ? "chat" : ""}`}>
                    {entry}
                  </div>
                ),
              )}
          </div>
        </>
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
  );

  // The build palette, unfolded above the action row when "Bauen" is toggled.
  const buildPalette = (
    <div className={`build-bar ${state.settings.specialBuildings ? "has-more" : ""}`}>
      <BuildTile icon="🛤️" label="Straße" cost={BUILD_COSTS.road} resources={me?.resources} active={buildMode === "road"} onClick={() => setBuildMode(buildMode === "road" ? null : "road")} />
      <BuildTile icon="🏠" label="Siedlung" cost={BUILD_COSTS.settlement} resources={me?.resources} active={buildMode === "settlement"} onClick={() => setBuildMode(buildMode === "settlement" ? null : "settlement")} />
      <BuildTile icon="🏙️" label="Stadt" cost={BUILD_COSTS.city} resources={me?.resources} active={buildMode === "city"} onClick={() => setBuildMode(buildMode === "city" ? null : "city")} />
      <BuildTile icon="🃏" label="Entwicklung" cost={BUILD_COSTS.developmentCard} resources={me?.resources} active={false} onClick={() => setConfirmingBuyCard(true)} />
      <BuildTile icon="🔭" label="Spähen" cost={SCOUT_COST} resources={me?.resources} active={buildMode === "scout"} onClick={() => setBuildMode(buildMode === "scout" ? null : "scout")} />
      {state.settings.specialBuildings &&
        Object.values(SPECIAL_BUILDINGS).map((spec) => {
          const isBuilt = me?.specialBuildings.some((s) => s.id === spec.id) ?? false;
          const usedOne = (me?.specialBuildings.length ?? 0) > 0;
          return (
            <BuildTile
              key={spec.id}
              icon={spec.icon}
              label={spec.title}
              title={`${spec.title} — ${spec.desc}`}
              cost={spec.cost}
              resources={me?.resources}
              active={buildMode === spec.id}
              built={isBuilt}
              locked={usedOne && !isBuilt}
              onClick={() => setBuildMode(buildMode === spec.id ? null : (spec.id as SpecialBuildingId))}
            />
          );
        })}
    </div>
  );

  return (
    <div className="game-root">
      {flights.map((f) => (
        <FlyingSprite key={f.id} flight={f} />
      ))}
      {state.phase === "ended" && (
        <VictoryScreen state={state} myPlayerId={myPlayerId} sendAction={sendAction} onLeave={onLeave} />
      )}
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
          onAimResolved={exitBuildMode}
          boardRef={boardApiRef}
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
        {/* Weather is a round-long status, so it lives top-left as a chip
            (where the room code used to sit — the code moved into the menu). */}
        {state.weather && (
          <button
            className="weather-status"
            onClick={() => setMapInfo({ title: WEATHER_INFO[state.weather!.kind].title, text: describeWeather(state.weather!) })}
            title="Ereignis dieser Runde — antippen für Details"
          >
            <span className="weather-icon">{WEATHER_INFO[state.weather.kind].icon}</span>
            <span>{WEATHER_INFO[state.weather.kind].title}</span>
          </button>
        )}
        <div className="hamburger-menu">
          <button className="hamburger-btn" onClick={() => setMenuOpen((v) => !v)} aria-label="Menü">
            ☰
          </button>
          {menuOpen && (
            <div className="hamburger-dropdown">
              <div className="menu-roomcode" title="Raum-Code — zum Wiederbeitreten mit demselben Namen eingeben">
                <span>Raum-Code</span>
                <button
                  className="menu-roomcode-value"
                  onClick={() => {
                    navigator.clipboard?.writeText(state.roomId).catch(() => {});
                  }}
                  title="Code kopieren"
                >
                  {state.roomId} 📋
                </button>
              </div>
              <button
                onClick={() => {
                  setMenuOpen(false);
                  setMapInfo({ title: "Spielhilfe", text: HELP_TEXT });
                }}
              >
                📖 Spielhilfe
              </button>
              <button
                onClick={() => {
                  setMenuOpen(false);
                  shareInvite(state.roomId);
                }}
              >
                🔗 Einladungslink teilen
              </button>
              {"Notification" in window && (
                <button
                  onClick={() => {
                    setMenuOpen(false);
                    Notification.requestPermission();
                  }}
                >
                  🔔 „Du bist dran"-Erinnerung
                </button>
              )}
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
        <div className="top-hud">
          <div className={`turn-banner ${bannerIsYou ? "you" : ""}`}>
            <span>{bannerStatus}</span>
          </div>
          {/* One-off hint for the opening phase; dismissible, and it disappears
              on its own once setup is over. */}
          {state.phase === "setup" && !setupNoteDismissed && (
            <div className="setup-note-card">
              <span className="setup-note-icon">ℹ️</span>
              <span>Schlangenreihenfolge: Runde 2 läuft rückwärts — wer zuletzt legt, ist direkt nochmal dran.</span>
              <button className="setup-note-x" onClick={() => setSetupNoteDismissed(true)} aria-label="Hinweis schließen">
                ✕
              </button>
            </div>
          )}
        </div>

        {/* Combined turn-order timeline + player list: shows the play order with
            the active player highlighted, and each chip is tappable to trade.
            Sits centred at the bottom of the map, between dice and recenter. */}
        {state.phase !== "lobby" && (
          <div className="player-timeline">
            {(state.turnOrder.length ? state.turnOrder.map((id) => state.players.find((p) => p.id === id)) : state.players).map(
              (p, i) => {
                if (!p) return null;
                const isCurrent =
                  (state.phase === "mainGame" || state.phase === "setup") &&
                  state.turnOrder[state.currentPlayerIndex] === p.id;
                const isMe = p.id === myPlayerId;
                const canTrade = !isMe && state.phase === "mainGame" && !state.negotiation;
                return (
                  <div key={p.id} className="pt-seg">
                    {i > 0 && <span className="pt-arrow">›</span>}
                    <button
                      className={`pt-chip ${isCurrent ? "current" : ""} ${isMe ? "me" : ""} ${canTrade ? "tradable" : ""}`}
                      style={{ borderColor: p.color, background: isCurrent ? p.color : undefined }}
                      onPointerDown={() => onChipTap(p.id, canTrade)}
                      title={
                        isMe
                          ? `${p.name} — antippen für Punkte`
                          : canTrade
                          ? `Antippen: Punkte · Doppeltippen: mit ${p.name} traden`
                          : `${p.name} — antippen für Punkte`
                      }
                    >
                      <span className="pt-dot" style={{ background: p.color }} />
                      <span className="pt-name">{p.name}</span>
                      {state.longestRoadPlayerId === p.id && <span title="Längste Straße">🛣️</span>}
                      {state.largestArmyPlayerId === p.id && <span title="Größte Rittermacht">⚔️</span>}
                      {canTrade && <span className="pt-trade" aria-hidden="true">🤝</span>}
                      {!p.connected && <span className="pt-offline">offline</span>}
                      {vpPeek && vpPeek.id === p.id && (
                        <span className="pt-vp-peek">🏆 {vpPeek.vp}</span>
                      )}
                    </button>
                  </div>
                );
              },
            )}
          </div>
        )}
        {!tradeHintSeen && someTradable && (
          <div className="trade-hint" role="status">
            👆 Doppeltippe einen Mitspieler zum Traden
          </div>
        )}
        {buildMode === "knight" && <div className="mode-hint">Wähle ein Feld für den Ritter-Räuber</div>}
        {buildMode === "scout" && (
          <div className="mode-hint">Wähle ein verdecktes Nachbarfeld — nur du siehst, was dort liegt</div>
        )}
        {buildMode === "bribery" && <div className="mode-hint">Wähle ein aufgedecktes Feld für die Bestechung</div>}
        {buildMode === "lighthouse" && (
          <div className="mode-hint">Wähle eine eigene Siedlung/Stadt an der Küste für den Leuchtturm</div>
        )}
        {buildMode === "watchtower" && (
          <div className="mode-hint">Wähle eine eigene Siedlung/Stadt für den Späherturm</div>
        )}
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

        {/* All dice live in the bottom-left corner of the map, for both the
            opening roll and every turn. It pulses when it's your turn to throw. */}
        {state.phase === "turnOrderRoll" && (
          <div className={`map-dice ${!me?.turnOrderRoll ? "can-roll" : ""}`}>
            <DiceRoller serverRoll={me?.turnOrderRoll ?? null} onRoll={() => sendAction({ type: "rollTurnOrder" })} keepResult compact />
          </div>
        )}
        {state.phase === "mainGame" && isMyTurn && !state.lastDiceRoll && (
          <div className="map-dice can-roll">
            <DiceRoller serverRoll={null} onRoll={() => sendAction({ type: "rollDice" })} compact />
          </div>
        )}
        {state.phase === "mainGame" && state.lastDiceRoll && (
          <div className="map-dice map-dice-result" title={`Wurf dieser Runde: ${state.lastDiceRoll.total}`}>
            <PixelDie value={state.lastDiceRoll.die1} size={16} />
            <PixelDie value={state.lastDiceRoll.die2} size={16} />
            <span className="dice-result-total">{state.lastDiceRoll.total}</span>
          </div>
        )}
      </div>

      <div className="sidebar">
        <div className="sidebar-scroll">
        {/* Player list + turn order moved onto the map (bottom-centre). */}

        {/* Score + remaining pieces, all on one compact line (only you see it).
            The turn/status text now lives in the top banner instead of here. */}
        {(state.phase === "mainGame" || state.phase === "setup") && (
          <div className="stat-row" title="Dein Punktestand & verbleibende Bauteile — nur du siehst das">
            {state.phase === "mainGame" && (
              <>
                <span className="vp-badge">🏆 {myVP}/{VICTORY_POINTS_TO_WIN}</span>
                <span className={state.longestRoadPlayerId === myPlayerId ? "won" : ""} title="Längste Straße (ab 5)">
                  🛣️ {myRoad}
                  {state.longestRoadPlayerId === myPlayerId && "🏅"}
                </span>
                <span className={state.largestArmyPlayerId === myPlayerId ? "won" : ""} title="Größte Rittermacht (ab 3)">
                  ⚔️ {myKnights}
                  {state.largestArmyPlayerId === myPlayerId && "🏅"}
                </span>
                <span className="stat-sep" aria-hidden="true">·</span>
              </>
            )}
            <span className={myPieces.road === 0 ? "depleted" : ""} title="Straßen übrig">🛤️ {myPieces.road}</span>
            <span className={myPieces.settlement === 0 ? "depleted" : ""} title="Siedlungen übrig">🏠 {myPieces.settlement}</span>
            <span className={myPieces.city === 0 ? "depleted" : ""} title="Städte übrig">🏙️ {myPieces.city}</span>
          </div>
        )}

        {overHandLimit && (
          <div className="hand-warning">⚠️ {myHand} Karten — bei einer 7 wirfst du die Hälfte ab!</div>
        )}

        {state.phase !== "lobby" && me?.objective && (
          <div className={`secret-objective ${objectiveComplete(state, myPlayerId) ? "done" : ""}`} title="Nur du siehst deinen Auftrag">
            <span className="secret-objective-icon">🎯</span>
            <span className="secret-objective-body">
              <strong>
                {SECRET_OBJECTIVES[me.objective].title}
                {objectiveComplete(state, myPlayerId) && " ✓"}
              </strong>
              <span className="hint">
                {SECRET_OBJECTIVES[me.objective].desc} · +{SECRET_OBJECTIVES[me.objective].bonus} versteckte SP
              </span>
            </span>
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
                ref={(el) => {
                  chipRefs.current[key] = el;
                }}
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
                <span className="resource-count">{shownResources?.[key] ?? me.resources[key]}</span>
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

        {/* All rolling (opening + per-turn) now happens on the map, bottom-left. */}

        {state.phase === "mainGame" && isMyTurn && state.lastDiceRoll?.total === 7 && !state.robberTileCoord && (
          <p className="hint">Wähle ein Feld für den Räuber (Tippen aufs Feld)</p>
        )}

        {/* Log & chat live in the dock below, pinned under the action row. */}

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
            <p className="hint">Tippe einen Mitspieler an, um den Verhandlungstisch zu öffnen — Feinheiten klärt ihr im Chat.</p>
            <div className="trade-player-row">
              {otherPlayers.map((p) => (
                <button
                  key={p.id}
                  className="trade-player-btn"
                  style={{ borderColor: p.color }}
                  disabled={!!state.negotiation}
                  onClick={() => {
                    sendAction({ type: "startNegotiation", withPlayerId: p.id });
                    setShowTradePanel(false);
                  }}
                >
                  <span className="player-dot" style={{ background: p.color }} />
                  {p.name}
                </button>
              ))}
            </div>
            {state.negotiation && <p className="hint">Ein Verhandlungstisch läuft bereits.</p>}
          </div>
        )}

          {state.phase === "mainGame" && isMyTurn && state.lastDiceRoll && (
            <>
              {/* Build palette unfolds directly above the action row. */}
              {showBuild && !confirmingBuyCard && buildPalette}
              <div className="bottom-actions">
                <button
                  className={`build-toggle ${
                    showBuild ? "toggle-active" : affordableBuildCount > 0 ? "can-build" : "dimmed"
                  }`}
                  onClick={() => setShowBuild((v) => !v)}
                  title={
                    affordableBuildCount > 0
                      ? "Du kannst gerade etwas bauen"
                      : "Für einen Bau fehlen dir noch Rohstoffe — antippen zum Anschauen"
                  }
                >
                  🔨 Bauen
                  {!showBuild && affordableBuildCount > 0 && <span className="can-build-dot" aria-hidden="true" />}
                </button>
                <button className={showCards ? "toggle-active" : ""} onClick={() => setShowCards((v) => !v)}>
                  🃏 Karten ({me?.developmentCards.length ?? 0})
                </button>
                <button className={showTradePanel ? "toggle-active" : ""} onClick={() => setShowTradePanel((v) => !v)}>
                  🔁 Handel
                </button>
                <button className="primary-button" onClick={() => sendAction({ type: "endTurn" })}>
                  Zug beenden
                </button>
              </div>
            </>
          )}
          {/* Chat + 3-line log: the very bottom, always available (also mid-trade). */}
          {logPanel}
        </div>
      </div>
    </div>
  );
}


function DiceRoller({
  serverRoll,
  onRoll,
  keepResult = false,
  compact = false,
}: {
  serverRoll: { die1: number; die2: number; total: number } | null;
  onRoll: () => void;
  keepResult?: boolean;
  compact?: boolean;
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
      className={`dice-roller ${rolling ? "rolling" : ""} ${compact ? "compact" : ""}`}
      style={{ touchAction: "none" }}
      role="button"
      tabIndex={0}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") triggerRoll();
      }}
    >
      <PixelDie value={display[0]} size={compact ? 20 : 30} />
      <PixelDie value={display[1]} size={compact ? 20 : 30} />
      <span className="dice-hint">{rolling ? "…" : compact ? "Würfeln" : "Drücken zum Würfeln"}</span>
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
  built = false,
  locked = false,
  title,
}: {
  icon: string;
  label: string;
  cost: Partial<Record<ResourceType, number>>;
  resources: Record<ResourceType, number> | undefined;
  active: boolean;
  onClick: () => void;
  built?: boolean;
  locked?: boolean;
  title?: string;
}) {
  const affordable = canAfford(resources, cost);
  const tip = title ?? label;
  return (
    <button
      className={`build-tile ${active ? "toggle-active" : ""} ${built ? "built" : ""} ${locked ? "locked" : ""}`}
      disabled={built || locked || !affordable}
      onClick={onClick}
      title={built ? `${tip} — bereits gebaut` : locked ? `${tip} — du hast schon einen Sonderbau` : affordable ? tip : `${tip} — nicht genug Rohstoffe`}
    >
      <span className="build-tile-icon">{icon}</span>
      {built ? (
        <span className="build-tile-cost built-tag">✓ gebaut</span>
      ) : (
        <span className="build-tile-cost">
          {RESOURCE_TYPES.filter((r) => (cost[r] ?? 0) > 0).map((r) => (
            <span key={r} className="build-tile-cost-item">
              <ResourceSprite resource={r} size={12} />
              {cost[r]}
            </span>
          ))}
        </span>
      )}
    </button>
  );
}

function describeResources(r: Partial<Record<ResourceType, number>>): string {
  const parts = RESOURCE_TYPES.filter((t) => (r[t] ?? 0) > 0).map((t) => `${r[t]}x ${RESOURCE_LABELS[t]}`);
  return parts.length > 0 ? parts.join(", ") : "nichts";
}

