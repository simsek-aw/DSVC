import { buildBoardGraph, tilesTouchingVertex, vertexNeighborsOf } from "./boardGraph";
import { AxialCoord, EdgeId, axialKey, axialNeighbors, edgeKey, vertexKey } from "./hexGrid";
import { longestRoadLength } from "./longestRoad";
import { generateMap } from "./mapGenerator";
import {
  BUILD_COSTS,
  Building,
  CHAT_MAX_LENGTH,
  CHAT_PREFIX,
  ROUND_MARKER,
  ClientAction,
  DevelopmentCardType,
  EVENT_EVERY_ROUNDS,
  WeatherEvent,
  WeatherKind,
  DiceRoll,
  GameState,
  LARGEST_ARMY_BONUS,
  LARGEST_ARMY_MIN_KNIGHTS,
  LONGEST_ROAD_BONUS,
  LONGEST_ROAD_MIN_LENGTH,
  PIECE_LIMITS,
  Player,
  ResourceType,
  HAND_LIMIT_ON_SEVEN,
  RESOURCE_TYPES,
  Road,
  SCOUT_COST,
  TERRAIN_NAMES_DE,
  Tile,
  VICTORY_POINTS_TO_WIN,
  GameSettings,
  SecretObjectiveId,
  SECRET_OBJECTIVES,
  SpecialBuildingId,
  SPECIAL_BUILDINGS,
  SPECIAL_BUILDING_LIMIT,
  defaultSettings,
} from "./types";

export const TILE_SIZE = 1;

export class GameError extends Error {}

function emptyResources(): Record<ResourceType, number> {
  return { wood: 0, brick: 0, ore: 0, wheat: 0, sheep: 0 };
}

const PLAYER_COLORS = ["#e63946", "#2a9d8f", "#f4a261", "#457b9d", "#8338ec", "#ffb703"];

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function buildDevelopmentDeck(): DevelopmentCardType[] {
  const composition: [DevelopmentCardType, number][] = [
    ["knight", 10],
    ["roadBuilding", 3],
    ["invention", 3],
    ["monopoly", 3],
    ["bribery", 3],
  ];
  const deck: DevelopmentCardType[] = [];
  for (const [type, count] of composition) for (let i = 0; i < count; i++) deck.push(type);
  return shuffle(deck);
}

export function createLobby(roomId: string): GameState {
  return {
    roomId,
    phase: "lobby",
    players: [],
    turnOrder: [],
    currentPlayerIndex: 0,
    setupRound: 1,
    setupStepAwaitingRoad: false,
    tiles: [],
    buildings: [],
    roads: [],
    lastDiceRoll: null,
    robberTileCoord: null,
    developmentDeck: [],
    briberyTileCoord: null,
    briberyBeneficiaryId: null,
    longestRoadPlayerId: null,
    largestArmyPlayerId: null,
    pendingTrade: null,
    resourceRequest: null,
    negotiation: null,
    pendingDiscards: {},
    pendingSteal: null,
    demoMode: false,
    winnerId: null,
    roundCount: 0,
    weather: null,
    settings: defaultSettings(),
    log: [],
  };
}

export function addPlayer(state: GameState, playerId: string, name: string): GameState {
  if (state.phase !== "lobby") throw new GameError("Spiel läuft bereits, Beitritt nicht mehr möglich.");
  if (state.players.length >= 6) throw new GameError("Raum ist voll (max. 6 Spieler).");
  const player: Player = {
    id: playerId,
    name,
    color: PLAYER_COLORS[state.players.length % PLAYER_COLORS.length],
    connected: true,
    resources: emptyResources(),
    developmentCards: [],
    knightsPlayed: 0,
    victoryPoints: 0,
    turnOrderRoll: null,
    objective: null,
    specialBuildings: [],
  };
  return { ...state, players: [...state.players, player], log: [...state.log, `${name} ist beigetreten.`] };
}

// Builds a room that a single device drives on behalf of every player, for
// solo testing. Marked on the state so the server knows to accept actions
// from this one connection on any player's behalf.
export function createDemoLobby(roomId: string, playerNames: string[]): GameState {
  let state: GameState = { ...createLobby(roomId), demoMode: true };
  for (const [i, name] of playerNames.entries()) {
    state = addPlayer(state, `${roomId}-demo-${i}`, name);
  }
  return { ...state, log: [...state.log, "Demo-Modus: Du steuerst alle Spieler von diesem Gerät."] };
}

export function removePlayer(state: GameState, playerId: string): GameState {
  if (state.phase !== "lobby") throw new GameError("Der Raum kann nach Spielstart nicht mehr verlassen werden.");
  const player = state.players.find((p) => p.id === playerId);
  if (!player) return state;
  return {
    ...state,
    players: state.players.filter((p) => p.id !== playerId),
    log: [...state.log, `${player.name} hat den Raum verlassen.`],
  };
}

export function setPlayerConnected(state: GameState, playerId: string, connected: boolean): GameState {
  return {
    ...state,
    players: state.players.map((p) => (p.id === playerId ? { ...p, connected } : p)),
  };
}

function rollTwoDice(): DiceRoll {
  const die1 = 1 + Math.floor(Math.random() * 6);
  const die2 = 1 + Math.floor(Math.random() * 6);
  return { die1, die2, total: die1 + die2 };
}

function findTile(state: GameState, coord: AxialCoord): Tile {
  const tile = state.tiles.find((t) => axialKey(t.coord) === axialKey(coord));
  if (!tile) throw new GameError("Feld existiert nicht.");
  return tile;
}

function currentPlayer(state: GameState): Player {
  const id = state.turnOrder[state.currentPlayerIndex];
  const player = state.players.find((p) => p.id === id);
  if (!player) throw new GameError("Aktueller Spieler nicht gefunden.");
  return player;
}

function requireCurrentPlayer(state: GameState, playerId: string) {
  if (currentPlayer(state).id !== playerId) throw new GameError("Nicht dein Zug.");
}

function updatePlayer(state: GameState, playerId: string, fn: (p: Player) => Player): GameState {
  return { ...state, players: state.players.map((p) => (p.id === playerId ? fn(p) : p)) };
}

// Uncovers every tile around a freshly placed settlement and hands whoever
// placed it any one-off find that was buried under a newly uncovered tile.
function revealTilesTouching(state: GameState, vertex: { x: number; y: number }, finderId: string): GameState {
  const graph = buildBoardGraph(state.tiles, TILE_SIZE);
  const touching = tilesTouchingVertex(graph, vertex);
  const touchingKeys = new Set(touching.map((c) => axialKey(c)));

  const newlyRevealed = state.tiles.filter((t) => touchingKeys.has(axialKey(t.coord)) && !t.revealed);
  let next: GameState = {
    ...state,
    tiles: state.tiles.map((t) => (touchingKeys.has(axialKey(t.coord)) ? { ...t, revealed: true } : t)),
  };

  for (const tile of newlyRevealed) {
    if (!tile.treasure) continue;
    next = collectTreasure(next, tile, finderId);
  }
  return next;
}

function collectTreasure(state: GameState, tile: Tile, finderId: string): GameState {
  const finder = state.players.find((p) => p.id === finderId);
  if (!finder) return state;
  const clear = (s: GameState): GameState => ({
    ...s,
    tiles: s.tiles.map((t) => (axialKey(t.coord) === axialKey(tile.coord) ? { ...t, treasure: null } : t)),
  });

  if (tile.treasure === "cache") {
    // A stash of whatever the tile itself produces.
    const resource = (tile.terrain === "desert" ? "wheat" : tile.terrain) as ResourceType;
    let next = updatePlayer(state, finderId, (p) => ({ ...p, resources: { ...p.resources, [resource]: p.resources[resource] + 2 } }));
    next = { ...next, log: [...next.log, `${finder.name} findet ein Versteck: 2x ${TERRAIN_NAMES_DE[resource]}! 📦`] };
    return clear(next);
  }

  if (tile.treasure === "relic") {
    if (state.developmentDeck.length === 0) return clear(state);
    const [card, ...rest] = state.developmentDeck;
    let next = updatePlayer({ ...state, developmentDeck: rest }, finderId, (p) => ({
      ...p,
      developmentCards: [...p.developmentCards, card],
    }));
    next = { ...next, log: [...next.log, `${finder.name} birgt ein Relikt und erhält eine Entwicklungskarte! 🏺`] };
    return clear(next);
  }

  // Curse: the ruin costs the finder a couple of cards, if they have any.
  const owned = RESOURCE_TYPES.filter((r) => finder.resources[r] > 0);
  let next = state;
  for (let i = 0; i < 2 && owned.length > 0; i++) {
    const victimRes = owned[Math.floor(Math.random() * owned.length)];
    const holder = next.players.find((p) => p.id === finderId)!;
    if (holder.resources[victimRes] <= 0) continue;
    next = updatePlayer(next, finderId, (p) => ({ ...p, resources: { ...p.resources, [victimRes]: p.resources[victimRes] - 1 } }));
  }
  next = { ...next, log: [...next.log, `${finder.name} stört eine verfluchte Ruine und verliert Rohstoffe. 💀`] };
  return clear(next);
}

/**
 * The state as one player is allowed to see it: tiles they have neither
 * uncovered nor scouted come across as blank. Without this the whole hidden
 * map would sit in every client's memory.
 */
export function viewFor(state: GameState, playerId: string): GameState {
  if (state.demoMode) return state; // one device plays every seat
  // Only the victim gets to see what is actually in the fanned-out hand; for
  // everyone else — the thief above all — it is just a number of face-down
  // cards, so the answer never travels to a client that must not have it.
  const steal = state.pendingSteal;
  const pendingSteal = steal && steal.victimId !== playerId ? { ...steal, hand: [] } : steal;
  // Missions stay face-down for everyone but their owner, until the game ends
  // and the final tally reveals them.
  const players =
    state.phase === "ended"
      ? state.players
      : state.players.map((p) => (p.id === playerId ? p : { ...p, objective: null }));
  return {
    ...state,
    pendingSteal,
    players,
    tiles: state.tiles.map((t) => {
      const scouted = t.scoutedBy.includes(playerId);
      if (t.revealed) return { ...t, scoutedBy: scouted ? [playerId] : [] };
      if (scouted) return { ...t, scoutedBy: [playerId], treasure: null };
      return {
        ...t,
        terrain: "unknown" as const,
        numberToken: null,
        hasBoostToken: false,
        port: null,
        treasure: null,
        scoutedBy: [],
      };
    }),
  };
}

export function startGame(state: GameState): GameState {
  if (state.phase !== "lobby") throw new GameError("Spiel wurde bereits gestartet.");
  if (state.players.length < 2) throw new GameError("Mindestens 2 Spieler nötig.");
  const { tiles } = generateMap({ playerCount: state.players.length, tileSize: TILE_SIZE });
  // Deal one face-down mission per player when the room enabled them. The deck
  // is reshuffled and cycled so every player gets one even at a full table.
  let players = state.players;
  const log = [...state.log, "Spiel gestartet. Alle würfeln um die Zugreihenfolge."];
  if (state.settings.secretObjectives) {
    const ids = shuffle(Object.keys(SECRET_OBJECTIVES) as SecretObjectiveId[]);
    players = state.players.map((p, i) => ({ ...p, objective: ids[i % ids.length] }));
    log.push("🎯 Geheime Aufträge wurden verteilt — nur du siehst deinen.");
  }
  return {
    ...state,
    phase: "turnOrderRoll",
    tiles,
    players,
    developmentDeck: buildDevelopmentDeck(),
    log,
  };
}

// Whether a player's secret mission is fulfilled, from board state alone so the
// answer is deterministic and identical on server and (revealed) client.
export function objectiveComplete(state: GameState, playerId: string): boolean {
  const player = state.players.find((p) => p.id === playerId);
  if (!player?.objective) return false;
  const myBuildings = state.buildings.filter((b) => b.ownerId === playerId);
  switch (player.objective) {
    case "roadKing":
      return longestRoadLength(state.roads, playerId) >= 7;
    case "metropolis":
      return myBuildings.filter((b) => b.type === "city").length >= 3;
    case "warlord":
      return player.knightsPlayed >= 3;
    case "expander":
      return myBuildings.length >= 7;
    case "harborMaster": {
      const myVerts = new Set(myBuildings.map((b) => b.vertex));
      const ports = state.tiles.filter((t) => t.port).length;
      if (ports === 0) return false;
      let touched = 0;
      for (const t of state.tiles) {
        if (t.port && t.port.edgeVertices.some((v) => myVerts.has(v))) touched++;
      }
      return touched >= 2;
    }
    default:
      return false;
  }
}

function nextIndexSnake(state: GameState): { index: number; setupRound: 1 | 2; done: boolean } {
  const n = state.turnOrder.length;
  if (state.setupRound === 1) {
    if (state.currentPlayerIndex < n - 1) return { index: state.currentPlayerIndex + 1, setupRound: 1, done: false };
    return { index: n - 1, setupRound: 2, done: false }; // last player goes again first in round 2
  }
  if (state.currentPlayerIndex > 0) return { index: state.currentPlayerIndex - 1, setupRound: 2, done: false };
  return { index: 0, setupRound: 2, done: true };
}

function revealAllNumbers(state: GameState): GameState {
  return { ...state, tiles: state.tiles.map((t) => ({ ...t, numberRevealed: true })) };
}

export function handSize(player: Player): number {
  return RESOURCE_TYPES.reduce((sum, r) => sum + player.resources[r], 0);
}

// Flattens a player's resource counts into one card per entry, then shuffles —
// this is the face-down hand the thief picks a position from.
function buildShuffledHand(player: Player): ResourceType[] {
  const cards: ResourceType[] = [];
  for (const r of RESOURCE_TYPES) for (let i = 0; i < player.resources[r]; i++) cards.push(r);
  return shuffle(cards);
}

// Anyone with a settlement/city touching the robber's tile (other than the
// thief) who still holds at least one card is fair game.
function stealCandidates(state: GameState, tile: Tile, thiefId: string): string[] {
  const owners = new Set(producersForTile(state, tile).map((b) => b.ownerId));
  return Array.from(owners).filter((id) => {
    if (id === thiefId) return false;
    const p = state.players.find((pl) => pl.id === id);
    return !!p && handSize(p) > 0;
  });
}

function beginSteal(state: GameState, tile: Tile, thiefId: string): GameState {
  const candidateIds = stealCandidates(state, tile, thiefId);
  if (candidateIds.length === 0) return state;
  // With exactly one possible victim there is nothing to choose, so go
  // straight to picking a card out of their hand.
  const victimId = candidateIds.length === 1 ? candidateIds[0] : null;
  const victim = victimId ? state.players.find((p) => p.id === victimId) : null;
  return {
    ...state,
    pendingSteal: {
      thiefId,
      candidateIds,
      victimId,
      hand: victim ? buildShuffledHand(victim) : [],
      handCount: victim ? handSize(victim) : 0,
    },
  };
}

function producersForTile(state: GameState, tile: Tile): Building[] {
  const graph = buildBoardGraph(state.tiles, TILE_SIZE);
  return state.buildings.filter((b) =>
    graph.vertexTiles.get(vertexKey(b.vertex))?.some((c) => axialKey(c) === axialKey(tile.coord))
  );
}

function produceResources(state: GameState, total: number): GameState {
  let next = state;
  const weather = state.weather;
  const bountyOn = weather?.kind === "bounty" && weather.number === total;
  for (const tile of state.tiles) {
    if (tile.numberToken !== total) continue;
    if (tile.hasClassicRobber) continue;
    if (tile.terrain === "desert") continue;
    const resource = tile.terrain as ResourceType;
    // Drought: this terrain simply produces nothing for the round.
    if (weather?.kind === "drought" && weather.terrain === resource) continue;
    const isBribed = next.briberyTileCoord && axialKey(next.briberyTileCoord) === axialKey(tile.coord);
    for (const b of producersForTile(next, tile)) {
      const baseAmount = b.type === "city" ? 2 : 1;
      const boosted = tile.hasBoostToken ? baseAmount * 2 : baseAmount;
      const finalAmount = bountyOn ? boosted * 2 : boosted;
      const recipientId = isBribed && next.briberyBeneficiaryId ? next.briberyBeneficiaryId : b.ownerId;
      if (isBribed) next = { ...next, log: [...next.log, `Bestochener Räuber leitet die Ernte auf einem ${TERRAIN_NAMES_DE[resource]}-Feld um!`] };
      if (tile.hasBoostToken) next = { ...next, log: [...next.log, `Boost-Figur verdoppelt die Ernte auf einem ${TERRAIN_NAMES_DE[resource]}-Feld!`] };
      next = updatePlayer(next, recipientId, (p) => ({
        ...p,
        resources: { ...p.resources, [resource]: p.resources[resource] + finalAmount },
      }));
    }
  }
  return next;
}

export function totalVictoryPoints(state: GameState, playerId: string): number {
  const player = state.players.find((p) => p.id === playerId);
  if (!player) return 0;
  let total = player.victoryPoints;
  if (state.longestRoadPlayerId === playerId) total += LONGEST_ROAD_BONUS;
  if (state.largestArmyPlayerId === playerId) total += LARGEST_ARMY_BONUS;
  if (player.objective && objectiveComplete(state, playerId)) total += SECRET_OBJECTIVES[player.objective].bonus;
  // Special buildings give effects, not victory points, so they don't count here.
  return total;
}

function recomputeLongestRoad(state: GameState): GameState {
  const lengths = state.players.map((p) => ({ id: p.id, len: longestRoadLength(state.roads, p.id) }));
  const currentHolderLen = state.longestRoadPlayerId
    ? lengths.find((l) => l.id === state.longestRoadPlayerId)?.len ?? 0
    : 0;
  const best = lengths.reduce((max, l) => (l.len > max.len ? l : max), { id: null as string | null, len: 0 });

  if (best.len < LONGEST_ROAD_MIN_LENGTH) {
    if (state.longestRoadPlayerId === null) return state;
    return { ...state, longestRoadPlayerId: null };
  }
  if (best.len <= currentHolderLen) return state; // holder keeps ties
  const winner = state.players.find((p) => p.id === best.id);
  return {
    ...state,
    longestRoadPlayerId: best.id,
    log: [...state.log, `🛣️ ${winner?.name} übernimmt die Längste Straße (${best.len} Felder)!`],
  };
}

function recomputeLargestArmy(state: GameState): GameState {
  const currentHolderKnights = state.largestArmyPlayerId
    ? state.players.find((p) => p.id === state.largestArmyPlayerId)?.knightsPlayed ?? 0
    : 0;
  const best = state.players.reduce(
    (max, p) => (p.knightsPlayed > max.knightsPlayed ? p : max),
    { id: null as string | null, knightsPlayed: 0 } as { id: string | null; knightsPlayed: number }
  );

  if (best.knightsPlayed < LARGEST_ARMY_MIN_KNIGHTS) {
    if (state.largestArmyPlayerId === null) return state;
    return { ...state, largestArmyPlayerId: null };
  }
  if (best.knightsPlayed <= currentHolderKnights) return state;
  const winner = state.players.find((p) => p.id === best.id);
  return {
    ...state,
    largestArmyPlayerId: best.id,
    log: [...state.log, `🏅 ${winner?.name} übernimmt die Größte Rittermacht (${best.knightsPlayed} Ritter)!`],
  };
}

function checkVictory(state: GameState): GameState {
  const winner = state.players.find((p) => totalVictoryPoints(state, p.id) >= VICTORY_POINTS_TO_WIN);
  if (!winner) return state;
  return { ...state, phase: "ended", winnerId: winner.id, log: [...state.log, `${winner.name} hat gewonnen!`] };
}

function hasEnoughResources(player: Player, cost: Partial<Record<ResourceType, number>>): boolean {
  return RESOURCE_TYPES.every((r) => player.resources[r] >= (cost[r] ?? 0));
}

function payCost(player: Player, cost: Partial<Record<ResourceType, number>>): Player {
  const resources = { ...player.resources };
  for (const r of RESOURCE_TYPES) resources[r] -= cost[r] ?? 0;
  return { ...player, resources };
}

function roadConnectsToOwnNetwork(state: GameState, playerId: string, edge: EdgeId): boolean {
  return (
    state.roads.some(
      (r) =>
        r.ownerId === playerId &&
        (vertexKey(r.edge.a) === vertexKey(edge.a) ||
          vertexKey(r.edge.a) === vertexKey(edge.b) ||
          vertexKey(r.edge.b) === vertexKey(edge.a) ||
          vertexKey(r.edge.b) === vertexKey(edge.b))
    ) ||
    state.buildings.some(
      (b) => b.ownerId === playerId && (vertexKey(b.vertex) === vertexKey(edge.a) || vertexKey(b.vertex) === vertexKey(edge.b))
    )
  );
}

function removeOneCard(player: Player, type: DevelopmentCardType): Player {
  const idx = player.developmentCards.indexOf(type);
  if (idx === -1) throw new GameError(`Du hast keine ${type}-Karte.`);
  const cards = [...player.developmentCards];
  cards.splice(idx, 1);
  return { ...player, developmentCards: cards };
}

function playerPortRatios(state: GameState, playerId: string): { resource: ResourceType | "any"; ratio: 2 | 3 }[] {
  const ratios: { resource: ResourceType | "any"; ratio: 2 | 3 }[] = [];
  for (const tile of state.tiles) {
    if (!tile.port || !tile.revealed) continue;
    const owned = tile.port.edgeVertices.some((v) =>
      state.buildings.some((b) => b.ownerId === playerId && vertexKey(b.vertex) === vertexKey(v))
    );
    if (owned) ratios.push(tile.port);
  }
  return ratios;
}

export function bestBankRatio(state: GameState, playerId: string, resource: ResourceType): number {
  let best = 4;
  // A storm shuts the harbours for the round — no port rates, only 4:1.
  if (state.weather?.kind !== "storm") {
    for (const p of playerPortRatios(state, playerId)) {
      if (p.resource === resource) best = Math.min(best, 2);
      else if (p.resource === "any") best = Math.min(best, 3);
    }
  }
  // A trade fair makes the bank one cheaper across the board (never below 2:1).
  if (state.weather?.kind === "fair") best = Math.max(2, best - 1);
  // A lighthouse permanently improves this player's maritime trade by one step.
  const owner = state.players.find((p) => p.id === playerId);
  if (owner?.specialBuildings.includes("lighthouse")) best = Math.max(2, best - 1);
  return best;
}

// Draws the island event for a new event-round. Bounty and drought need a live
// target, so they pick from what's actually on the board.
function drawWeather(state: GameState): WeatherEvent {
  const kinds: WeatherKind[] = ["bounty", "drought", "fair", "storm"];
  const kind = kinds[Math.floor(Math.random() * kinds.length)];
  if (kind === "bounty") {
    const nums = Array.from(new Set(state.tiles.filter((t) => t.numberToken != null && t.terrain !== "desert").map((t) => t.numberToken!)));
    if (nums.length === 0) return { kind: "fair" };
    return { kind, number: nums[Math.floor(Math.random() * nums.length)] };
  }
  if (kind === "drought") {
    const terrains = Array.from(new Set(state.tiles.filter((t) => t.terrain !== "desert" && t.terrain !== "unknown").map((t) => t.terrain as ResourceType)));
    if (terrains.length === 0) return { kind: "fair" };
    return { kind, terrain: terrains[Math.floor(Math.random() * terrains.length)] };
  }
  return { kind };
}

function describeWeather(w: WeatherEvent): string {
  switch (w.kind) {
    case "bounty":
      return `☀️ Reiche Ernte: Die ${w.number} liefert diese Runde doppelt!`;
    case "drought":
      return `🌵 Dürre: ${TERRAIN_NAMES_DE[w.terrain as ResourceType]} liefert diese Runde nichts.`;
    case "fair":
      return "🧭 Fernhandel: Bank-Tausch ist diese Runde 1 günstiger.";
    case "storm":
      return "🌊 Sturm: Die Häfen sind diese Runde gesperrt (nur 4:1).";
  }
}

// Log and chat share one stream, and a long game plus chatter would otherwise
// grow it without end — every client gets the whole thing on every broadcast.
const LOG_LIMIT = 200;

export function applyAction(state: GameState, playerId: string, action: ClientAction): GameState {
  const next = reduce(state, playerId, action);
  return next.log.length > LOG_LIMIT ? { ...next, log: next.log.slice(-LOG_LIMIT) } : next;
}

function reduce(state: GameState, playerId: string, action: ClientAction): GameState {
  switch (action.type) {
    case "createRoom":
    case "joinRoom":
      throw new GameError("Diese Aktion wird außerhalb der Engine behandelt.");

    case "startGame":
      return startGame(state);

    case "rollTurnOrder": {
      if (state.phase !== "turnOrderRoll") throw new GameError("Nicht in der Würfelphase.");
      const player = state.players.find((p) => p.id === playerId);
      if (!player) throw new GameError("Spieler nicht gefunden.");
      if (player.turnOrderRoll !== null) throw new GameError("Du hast schon gewürfelt.");
      const roll = rollTwoDice();
      let next = updatePlayer(state, playerId, (p) => ({ ...p, turnOrderRoll: roll }));
      next = { ...next, log: [...next.log, `${player.name} würfelt ${roll.total} für die Startreihenfolge.`] };
      if (next.players.every((p) => p.turnOrderRoll !== null)) {
        const ordered = [...next.players].sort((a, b) => (b.turnOrderRoll?.total ?? 0) - (a.turnOrderRoll?.total ?? 0));
        next = {
          ...next,
          turnOrder: ordered.map((p) => p.id),
          phase: "setup",
          currentPlayerIndex: 0,
          setupRound: 1,
          log: [...next.log, `${ordered[0].name} beginnt und platziert die erste Siedlung.`],
        };
      }
      return next;
    }

    case "placeSetupSettlement": {
      if (state.phase !== "setup") throw new GameError("Nicht in der Aufbauphase.");
      requireCurrentPlayer(state, playerId);
      if (state.setupStepAwaitingRoad) throw new GameError("Erst die Straße für die letzte Siedlung legen.");
      const vk = vertexKey(action.vertex);
      if (state.buildings.some((b) => vertexKey(b.vertex) === vk)) throw new GameError("Platz bereits belegt.");
      const graph = buildBoardGraph(state.tiles, TILE_SIZE);
      const tooClose = vertexNeighborsOf(graph, action.vertex).some((n) =>
        state.buildings.some((b) => vertexKey(b.vertex) === vertexKey(n))
      );
      if (tooClose) throw new GameError("Zu nah an einer bestehenden Siedlung (Abstandsregel).");

      const building: Building = { vertex: action.vertex, type: "settlement", ownerId: playerId };
      let next: GameState = { ...state, buildings: [...state.buildings, building], setupStepAwaitingRoad: true };
      next = revealTilesTouching(next, action.vertex, playerId);
      next = updatePlayer(next, playerId, (p) => ({ ...p, victoryPoints: p.victoryPoints + 1 }));

      // Second settlement of setup grants immediate starting resources (classic
      // Catan rule): one of each resource the settlement's tiles produce.
      if (state.setupRound === 2) {
        const gained: Partial<Record<ResourceType, number>> = {};
        for (const coord of tilesTouchingVertex(graph, action.vertex)) {
          const tile = findTile(next, coord);
          if (tile.terrain === "desert") continue;
          const resource = tile.terrain as ResourceType;
          gained[resource] = (gained[resource] ?? 0) + 1;
          next = updatePlayer(next, playerId, (p) => ({
            ...p,
            resources: { ...p.resources, [resource]: p.resources[resource] + 1 },
          }));
        }
        const parts = RESOURCE_TYPES.filter((r) => gained[r]).map((r) => `${gained[r]}× ${TERRAIN_NAMES_DE[r]}`);
        const player = next.players.find((p) => p.id === playerId);
        next = {
          ...next,
          log: [...next.log, parts.length ? `🎁 ${player?.name} erhält Startrohstoffe: ${parts.join(", ")}.` : `🎁 ${player?.name} erhält keine Startrohstoffe (nur Wüste).`],
        };
      }

      return next;
    }

    case "placeSetupRoad": {
      if (state.phase !== "setup") throw new GameError("Nicht in der Aufbauphase.");
      requireCurrentPlayer(state, playerId);
      if (!state.setupStepAwaitingRoad) throw new GameError("Erst eine Siedlung platzieren.");
      const ek = edgeKey(action.edge);
      if (state.roads.some((r) => edgeKey(r.edge) === ek)) throw new GameError("Straße bereits vorhanden.");
      const lastSettlement = [...state.buildings].reverse().find((b) => b.ownerId === playerId);
      if (!lastSettlement) throw new GameError("Keine Siedlung zum Verbinden gefunden.");
      const touchesLast =
        vertexKey(action.edge.a) === vertexKey(lastSettlement.vertex) ||
        vertexKey(action.edge.b) === vertexKey(lastSettlement.vertex);
      if (!touchesLast) throw new GameError("Straße muss an die zuletzt gebaute Siedlung anschließen.");

      const road: Road = { edge: action.edge, ownerId: playerId };
      let next: GameState = { ...state, roads: [...state.roads, road], setupStepAwaitingRoad: false };

      const { index, setupRound, done } = nextIndexSnake(next);
      if (done) {
        next = revealAllNumbers(next);
        next = {
          ...next,
          phase: "mainGame",
          currentPlayerIndex: 0,
          setupRound,
          log: [...next.log, "Aufbauphase beendet — alle Zahlen werden aufgedeckt!"],
        };
      } else {
        next = { ...next, currentPlayerIndex: index, setupRound };
      }
      return next;
    }

    case "rollDice": {
      if (state.phase !== "mainGame") throw new GameError("Nicht in der Hauptspielphase.");
      requireCurrentPlayer(state, playerId);
      if (state.lastDiceRoll) throw new GameError("Du hast diese Runde bereits gewürfelt.");
      const roll = rollTwoDice();
      let next: GameState = { ...state, lastDiceRoll: roll, log: [...state.log, `${currentPlayer(state).name} würfelt ${roll.total}.`] };
      if (roll.total === 7) {
        if (next.briberyTileCoord) {
          next = { ...next, briberyTileCoord: null, briberyBeneficiaryId: null, log: [...next.log, "Die 7 deckt die Bestechung auf — der Effekt ist aufgehoben!"] };
        }
        next = { ...next, log: [...next.log, "7 gewürfelt! Der klassische Räuber muss bewegt werden."] };
        // Everyone over the hand limit gives up half (rounded down) first.
        const discards: Record<string, number> = {};
        for (const p of next.players) {
          const size = handSize(p);
          if (size > HAND_LIMIT_ON_SEVEN) discards[p.id] = Math.floor(size / 2);
        }
        if (Object.keys(discards).length > 0) {
          const names = next.players.filter((p) => discards[p.id]).map((p) => `${p.name} (${discards[p.id]})`);
          next = { ...next, pendingDiscards: discards, log: [...next.log, `Zu viele Karten — abwerfen: ${names.join(", ")}.`] };
        }
      } else {
        next = produceResources(next, roll.total);
      }
      return next;
    }

    case "discardResources": {
      const owed = state.pendingDiscards[playerId] ?? 0;
      if (owed <= 0) throw new GameError("Du musst nichts abwerfen.");
      const player = state.players.find((p) => p.id === playerId);
      if (!player) throw new GameError("Spieler nicht gefunden.");
      const total = RESOURCE_TYPES.reduce((sum, r) => sum + (action.resources[r] ?? 0), 0);
      if (total !== owed) throw new GameError(`Du musst genau ${owed} Karten abwerfen.`);
      if (!hasEnoughResources(player, action.resources)) throw new GameError("So viele Karten hast du nicht.");

      let next = updatePlayer(state, playerId, (p) => payCost(p, action.resources));
      const remaining = { ...next.pendingDiscards };
      delete remaining[playerId];
      next = { ...next, pendingDiscards: remaining, log: [...next.log, `${player.name} wirft ${owed} Karten ab.`] };
      return next;
    }

    case "moveClassicRobber": {
      if (state.phase !== "mainGame") throw new GameError("Nicht in der Hauptspielphase.");
      requireCurrentPlayer(state, playerId);
      if (!state.lastDiceRoll || state.lastDiceRoll.total !== 7) throw new GameError("Räuber darf nur nach einer 7 bewegt werden.");
      if (Object.keys(state.pendingDiscards).length > 0)
        throw new GameError("Erst müssen alle überzähligen Karten abgeworfen werden.");
      const target = findTile(state, action.coord);
      let next: GameState = {
        ...state,
        tiles: state.tiles.map((t) => ({ ...t, hasClassicRobber: axialKey(t.coord) === axialKey(target.coord) })),
        robberTileCoord: target.coord,
      };
      next = { ...next, log: [...next.log, `Räuber wandert auf ein ${TERRAIN_NAMES_DE[target.terrain]}-Feld.`] };
      next = beginSteal(next, findTile(next, target.coord), playerId);
      return next;
    }

    case "chooseStealVictim": {
      const steal = state.pendingSteal;
      if (!steal) throw new GameError("Gerade ist kein Raubzug offen.");
      if (steal.thiefId !== playerId) throw new GameError("Das ist nicht dein Raubzug.");
      if (steal.victimId) throw new GameError("Das Opfer steht schon fest.");
      if (!steal.candidateIds.includes(action.victimId)) throw new GameError("Dieser Spieler ist kein gültiges Ziel.");
      const victim = state.players.find((p) => p.id === action.victimId);
      if (!victim) throw new GameError("Spieler nicht gefunden.");
      return {
        ...state,
        pendingSteal: { ...steal, victimId: action.victimId, hand: buildShuffledHand(victim), handCount: handSize(victim) },
      };
    }

    // Chat rides along in the log: one stream, so a message lands in the same
    // place players already watch for "X würfelt 8".
    case "sendChat": {
      const player = state.players.find((p) => p.id === playerId);
      if (!player) throw new GameError("Spieler nicht gefunden.");
      const text = action.text.trim().slice(0, CHAT_MAX_LENGTH);
      if (!text) throw new GameError("Leere Nachricht.");
      return { ...state, log: [...state.log, `${CHAT_PREFIX}${player.name}: ${text}`] };
    }

    case "shuffleStealHand": {
      const steal = state.pendingSteal;
      if (!steal || !steal.victimId) throw new GameError("Gerade wird nichts von dir gestohlen.");
      if (steal.victimId !== playerId) throw new GameError("Das ist nicht deine Hand.");
      return { ...state, pendingSteal: { ...steal, hand: shuffle(steal.hand) } };
    }

    // The victim may drag their own cards around before the thief commits —
    // they know what they hold, the thief only ever sees the backs.
    case "reorderStealHand": {
      const steal = state.pendingSteal;
      if (!steal || !steal.victimId) throw new GameError("Gerade wird nichts von dir gestohlen.");
      if (steal.victimId !== playerId) throw new GameError("Das ist nicht deine Hand.");
      const { from, to } = action;
      if (from < 0 || from >= steal.hand.length || to < 0 || to >= steal.hand.length) {
        throw new GameError("Diese Karte gibt es nicht.");
      }
      const hand = [...steal.hand];
      const [card] = hand.splice(from, 1);
      hand.splice(to, 0, card);
      return { ...state, pendingSteal: { ...steal, hand } };
    }

    case "stealCard": {
      const steal = state.pendingSteal;
      if (!steal) throw new GameError("Gerade ist kein Raubzug offen.");
      if (steal.thiefId !== playerId) throw new GameError("Das ist nicht dein Raubzug.");
      if (!steal.victimId) throw new GameError("Wähle zuerst ein Opfer.");
      const victim = state.players.find((p) => p.id === steal.victimId);
      const thief = state.players.find((p) => p.id === playerId);
      if (!victim || !thief) throw new GameError("Spieler nicht gefunden.");
      if (action.index < 0 || action.index >= steal.hand.length) throw new GameError("Diese Karte gibt es nicht.");

      const stolen = steal.hand[action.index];
      // The hand snapshot could be stale if the victim traded meanwhile.
      if (victim.resources[stolen] < 1) {
        return { ...state, pendingSteal: null, log: [...state.log, "Der Raubzug ging ins Leere."] };
      }
      let next = updatePlayer(state, steal.victimId, (p) => ({ ...p, resources: { ...p.resources, [stolen]: p.resources[stolen] - 1 } }));
      next = updatePlayer(next, playerId, (p) => ({ ...p, resources: { ...p.resources, [stolen]: p.resources[stolen] + 1 } }));
      return {
        ...next,
        pendingSteal: null,
        log: [...next.log, `${thief.name} stiehlt ${TERRAIN_NAMES_DE[stolen]} von ${victim.name}.`],
      };
    }

    case "buildRoad": {
      if (state.phase !== "mainGame") throw new GameError("Nicht in der Hauptspielphase.");
      requireCurrentPlayer(state, playerId);
      const player = currentPlayer(state);
      if (!hasEnoughResources(player, BUILD_COSTS.road)) throw new GameError("Nicht genug Rohstoffe für eine Straße.");
      const ek = edgeKey(action.edge);
      if (state.roads.some((r) => edgeKey(r.edge) === ek)) throw new GameError("Straße bereits vorhanden.");
      if (state.roads.filter((r) => r.ownerId === playerId).length >= PIECE_LIMITS.road)
        throw new GameError("Keine Straßen mehr übrig.");
      if (!roadConnectsToOwnNetwork(state, playerId, action.edge))
        throw new GameError("Straße muss an dein Straßen- oder Siedlungsnetz anschließen.");

      let next = updatePlayer(state, playerId, (p) => payCost(p, BUILD_COSTS.road));
      next = { ...next, roads: [...next.roads, { edge: action.edge, ownerId: playerId }] };
      next = recomputeLongestRoad(next);
      next = checkVictory(next);
      return next;
    }

    case "buildSettlement": {
      if (state.phase !== "mainGame") throw new GameError("Nicht in der Hauptspielphase.");
      requireCurrentPlayer(state, playerId);
      const player = currentPlayer(state);
      if (!hasEnoughResources(player, BUILD_COSTS.settlement)) throw new GameError("Nicht genug Rohstoffe für eine Siedlung.");
      const vk = vertexKey(action.vertex);
      if (state.buildings.some((b) => vertexKey(b.vertex) === vk)) throw new GameError("Platz bereits belegt.");
      if (state.buildings.filter((b) => b.ownerId === playerId && b.type === "settlement").length >= PIECE_LIMITS.settlement)
        throw new GameError("Keine Siedlungen mehr übrig — baue eine bestehende zur Stadt aus.");
      const graph = buildBoardGraph(state.tiles, TILE_SIZE);
      const tooClose = vertexNeighborsOf(graph, action.vertex).some((n) =>
        state.buildings.some((b) => vertexKey(b.vertex) === vertexKey(n))
      );
      if (tooClose) throw new GameError("Zu nah an einer bestehenden Siedlung (Abstandsregel).");
      const connectedByOwnRoad = state.roads.some(
        (r) => r.ownerId === playerId && (vertexKey(r.edge.a) === vk || vertexKey(r.edge.b) === vk)
      );
      if (!connectedByOwnRoad) throw new GameError("Siedlung muss an eine eigene Straße anschließen.");

      let next = updatePlayer(state, playerId, (p) => payCost(p, BUILD_COSTS.settlement));
      next = { ...next, buildings: [...next.buildings, { vertex: action.vertex, type: "settlement", ownerId: playerId }] };
      next = revealTilesTouching(next, action.vertex, playerId);
      next = updatePlayer(next, playerId, (p) => ({ ...p, victoryPoints: p.victoryPoints + 1 }));
      next = checkVictory(next);
      return next;
    }

    case "buildCity": {
      if (state.phase !== "mainGame") throw new GameError("Nicht in der Hauptspielphase.");
      requireCurrentPlayer(state, playerId);
      const player = currentPlayer(state);
      if (!hasEnoughResources(player, BUILD_COSTS.city)) throw new GameError("Nicht genug Rohstoffe für eine Stadt.");
      const vk = vertexKey(action.vertex);
      const existing = state.buildings.find((b) => vertexKey(b.vertex) === vk);
      if (!existing || existing.ownerId !== playerId || existing.type !== "settlement")
        throw new GameError("Hier steht keine eigene Siedlung zum Ausbauen.");
      if (state.buildings.filter((b) => b.ownerId === playerId && b.type === "city").length >= PIECE_LIMITS.city)
        throw new GameError("Keine Städte mehr übrig.");

      let next = updatePlayer(state, playerId, (p) => payCost(p, BUILD_COSTS.city));
      next = {
        ...next,
        buildings: next.buildings.map((b) => (vertexKey(b.vertex) === vk ? { ...b, type: "city" } : b)),
      };
      next = updatePlayer(next, playerId, (p) => ({ ...p, victoryPoints: p.victoryPoints + 1 }));
      next = checkVictory(next);
      return next;
    }

    case "buyDevelopmentCard": {
      if (state.phase !== "mainGame") throw new GameError("Nicht in der Hauptspielphase.");
      requireCurrentPlayer(state, playerId);
      const player = currentPlayer(state);
      if (!hasEnoughResources(player, BUILD_COSTS.developmentCard)) throw new GameError("Nicht genug Rohstoffe für eine Entwicklungskarte.");
      if (state.developmentDeck.length === 0) throw new GameError("Der Kartenstapel ist leer.");
      const [card, ...rest] = state.developmentDeck;
      let next: GameState = { ...state, developmentDeck: rest };
      next = updatePlayer(next, playerId, (p) => ({ ...payCost(p, BUILD_COSTS.developmentCard), developmentCards: [...p.developmentCards, card] }));
      next = { ...next, log: [...next.log, `${player.name} kauft eine Entwicklungskarte.`] };
      return next;
    }

    case "playKnight": {
      if (state.phase !== "mainGame") throw new GameError("Nicht in der Hauptspielphase.");
      requireCurrentPlayer(state, playerId);
      const target = findTile(state, action.coord);
      let next = updatePlayer(state, playerId, (p) => {
        const withoutCard = removeOneCard(p, "knight");
        return { ...withoutCard, knightsPlayed: withoutCard.knightsPlayed + 1 };
      });
      next = {
        ...next,
        tiles: next.tiles.map((t) => ({ ...t, hasClassicRobber: axialKey(t.coord) === axialKey(target.coord) })),
        log: [...next.log, `⚔️ ${currentPlayer(next).name} setzt einen Ritter ein und bewegt den Räuber.`],
      };
      // Same pick-a-victim-then-pick-a-card flow as the robber on a 7.
      next = beginSteal(next, findTile(next, target.coord), playerId);
      next = recomputeLargestArmy(next);
      next = checkVictory(next);
      return next;
    }

    case "playRoadBuilding": {
      if (state.phase !== "mainGame") throw new GameError("Nicht in der Hauptspielphase.");
      requireCurrentPlayer(state, playerId);
      const [edgeA, edgeB] = action.edges;
      if (edgeKey(edgeA) === edgeKey(edgeB)) throw new GameError("Zwei unterschiedliche Straßen wählen.");
      let next = updatePlayer(state, playerId, (p) => removeOneCard(p, "roadBuilding"));
      for (const edge of [edgeA, edgeB]) {
        if (next.roads.some((r) => edgeKey(r.edge) === edgeKey(edge))) throw new GameError("Straße bereits vorhanden.");
        if (!roadConnectsToOwnNetwork(next, playerId, edge)) throw new GameError("Straße muss an dein Netz anschließen.");
        next = { ...next, roads: [...next.roads, { edge, ownerId: playerId }] };
      }
      next = { ...next, log: [...next.log, `🛤️ ${currentPlayer(next).name} baut zwei kostenlose Straßen.`] };
      next = recomputeLongestRoad(next);
      next = checkVictory(next);
      return next;
    }

    case "playInvention": {
      if (state.phase !== "mainGame") throw new GameError("Nicht in der Hauptspielphase.");
      requireCurrentPlayer(state, playerId);
      let next = updatePlayer(state, playerId, (p) => removeOneCard(p, "invention"));
      for (const resource of action.resources) {
        next = updatePlayer(next, playerId, (p) => ({ ...p, resources: { ...p.resources, [resource]: p.resources[resource] + 1 } }));
      }
      next = { ...next, log: [...next.log, `💡 ${currentPlayer(next).name} erfindet sich 2 Rohstoffe.`] };
      return next;
    }

    case "playMonopoly": {
      if (state.phase !== "mainGame") throw new GameError("Nicht in der Hauptspielphase.");
      requireCurrentPlayer(state, playerId);
      let next = updatePlayer(state, playerId, (p) => removeOneCard(p, "monopoly"));
      let total = 0;
      for (const other of next.players) {
        if (other.id === playerId) continue;
        const amount = other.resources[action.resource];
        if (amount <= 0) continue;
        total += amount;
        next = updatePlayer(next, other.id, (p) => ({ ...p, resources: { ...p.resources, [action.resource]: 0 } }));
      }
      next = updatePlayer(next, playerId, (p) => ({ ...p, resources: { ...p.resources, [action.resource]: p.resources[action.resource] + total } }));
      next = { ...next, log: [...next.log, `📈 ${currentPlayer(next).name} verhängt ein Monopol auf ${TERRAIN_NAMES_DE[action.resource]} und kassiert ${total}.`] };
      return next;
    }

    case "playBribery": {
      if (state.phase !== "mainGame") throw new GameError("Nicht in der Hauptspielphase.");
      requireCurrentPlayer(state, playerId);
      const target = findTile(state, action.coord);
      if (!target.revealed) throw new GameError("Feld ist noch nicht aufgedeckt.");
      let next = updatePlayer(state, playerId, (p) => removeOneCard(p, "bribery"));
      next = {
        ...next,
        briberyTileCoord: target.coord,
        briberyBeneficiaryId: playerId,
        log: [...next.log, `💰 ${currentPlayer(next).name} besticht den Räuber — die Ernte eines ${TERRAIN_NAMES_DE[target.terrain]}-Felds wandert nun zu ihm.`],
      };
      return next;
    }

    case "bankTrade": {
      if (state.phase !== "mainGame") throw new GameError("Nicht in der Hauptspielphase.");
      requireCurrentPlayer(state, playerId);
      if (action.give === action.receive) throw new GameError("Rohstoffe müssen unterschiedlich sein.");
      const player = currentPlayer(state);
      const ratio = bestBankRatio(state, playerId, action.give);
      if (player.resources[action.give] < ratio) throw new GameError(`Du brauchst ${ratio}x ${TERRAIN_NAMES_DE[action.give]} für diesen Handel.`);
      let next = updatePlayer(state, playerId, (p) => ({
        ...p,
        resources: {
          ...p.resources,
          [action.give]: p.resources[action.give] - ratio,
          [action.receive]: p.resources[action.receive] + 1,
        },
      }));
      next = { ...next, log: [...next.log, `${player.name} handelt ${ratio}x ${TERRAIN_NAMES_DE[action.give]} gegen 1x ${TERRAIN_NAMES_DE[action.receive]} mit der Bank.`] };
      return next;
    }

    case "offerTrade": {
      if (state.phase !== "mainGame") throw new GameError("Nicht in der Hauptspielphase.");
      requireCurrentPlayer(state, playerId);
      if (state.pendingTrade) throw new GameError("Es gibt bereits ein offenes Handelsangebot.");
      const target = state.players.find((p) => p.id === action.toPlayerId);
      if (!target) throw new GameError("Zielspieler nicht gefunden.");
      const proposer = currentPlayer(state);
      if (!hasEnoughResources(proposer, action.give)) throw new GameError("Du hast nicht genug Rohstoffe für dieses Angebot.");
      const offer = { id: `${Date.now()}-${playerId}`, fromPlayerId: playerId, toPlayerId: action.toPlayerId, give: action.give, receive: action.receive };
      return { ...state, pendingTrade: offer, log: [...state.log, `${proposer.name} bietet ${target.name} einen Handel an.`] };
    }

    case "respondTrade": {
      const trade = state.pendingTrade;
      if (!trade) throw new GameError("Kein offenes Handelsangebot.");
      if (trade.toPlayerId !== playerId) throw new GameError("Dieses Angebot richtet sich nicht an dich.");
      if (!action.accept) {
        return { ...state, pendingTrade: null, log: [...state.log, "Handelsangebot abgelehnt."] };
      }
      const proposer = state.players.find((p) => p.id === trade.fromPlayerId);
      const responder = state.players.find((p) => p.id === trade.toPlayerId);
      if (!proposer || !responder) throw new GameError("Handelspartner nicht mehr im Spiel.");
      if (!hasEnoughResources(proposer, trade.give) || !hasEnoughResources(responder, trade.receive)) {
        return { ...state, pendingTrade: null, log: [...state.log, "Handel nicht mehr möglich — Rohstoffe haben sich geändert."] };
      }
      let next = updatePlayer(state, trade.fromPlayerId, (p) => payCost(p, trade.give));
      next = updatePlayer(next, trade.toPlayerId, (p) => payCost(p, trade.receive));
      next = updatePlayer(next, trade.fromPlayerId, (p) => {
        const resources = { ...p.resources };
        for (const r of RESOURCE_TYPES) resources[r] += trade.receive[r] ?? 0;
        return { ...p, resources };
      });
      next = updatePlayer(next, trade.toPlayerId, (p) => {
        const resources = { ...p.resources };
        for (const r of RESOURCE_TYPES) resources[r] += trade.give[r] ?? 0;
        return { ...p, resources };
      });
      next = {
        ...next,
        pendingTrade: null,
        // A fulfilled trade also settles whatever "I need X" call started it.
        resourceRequest: next.resourceRequest?.fromPlayerId === trade.toPlayerId ? null : next.resourceRequest,
        log: [...next.log, `${proposer.name} und ${responder.name} handeln erfolgreich.`],
      };
      return next;
    }

    case "scoutTile": {
      if (state.phase !== "mainGame") throw new GameError("Nicht in der Hauptspielphase.");
      const scout = state.players.find((p) => p.id === playerId);
      if (!scout) throw new GameError("Spieler nicht gefunden.");
      const target = findTile(state, action.coord);
      if (target.revealed) throw new GameError("Dieses Feld ist längst aufgedeckt.");
      if (target.scoutedBy.includes(playerId)) throw new GameError("Dieses Feld hast du schon erkundet.");
      if (!hasEnoughResources(scout, SCOUT_COST)) throw new GameError("Für einen Spähtrupp brauchst du 1x Wolle.");

      // Only reachable from your own frontier: a hidden tile next to one you
      // already have a building on. Keeps scouting a local, earned advantage.
      const graph = buildBoardGraph(state.tiles, TILE_SIZE);
      const myTileKeys = new Set<string>();
      for (const b of state.buildings) {
        if (b.ownerId !== playerId) continue;
        for (const c of tilesTouchingVertex(graph, b.vertex)) myTileKeys.add(axialKey(c));
      }
      const adjacent = axialNeighbors(target.coord).some((n) => myTileKeys.has(axialKey(n)));
      if (!adjacent) throw new GameError("Zu weit weg — du kannst nur an deine eigenen Felder angrenzende Felder erkunden.");

      let next = updatePlayer(state, playerId, (p) => payCost(p, SCOUT_COST));
      next = {
        ...next,
        tiles: next.tiles.map((t) =>
          axialKey(t.coord) === axialKey(target.coord) ? { ...t, scoutedBy: [...t.scoutedBy, playerId] } : t
        ),
        // Deliberately vague in the public log: the others learn that someone
        // scouted, not what they found.
        log: [...next.log, `${scout.name} schickt einen Spähtrupp aus. 🔭`],
      };
      return next;
    }

    case "requestResource": {
      if (state.phase !== "mainGame") throw new GameError("Nicht in der Hauptspielphase.");
      const asker = state.players.find((p) => p.id === playerId);
      if (!asker) throw new GameError("Spieler nicht gefunden.");
      // Deliberately NOT limited to the active player: the whole point of the
      // shout-out is that anyone can flag what they need while waiting.
      return {
        ...state,
        resourceRequest: { id: `${Date.now()}-${playerId}`, fromPlayerId: playerId, resource: action.resource },
        log: [...state.log, `${asker.name} sucht ${TERRAIN_NAMES_DE[action.resource]}.`],
      };
    }

    case "cancelResourceRequest": {
      if (!state.resourceRequest) return state;
      if (state.resourceRequest.fromPlayerId !== playerId) throw new GameError("Das ist nicht deine Anfrage.");
      return { ...state, resourceRequest: null };
    }

    case "offerQuickTrade": {
      const request = state.resourceRequest;
      if (!request) throw new GameError("Es gibt gerade keine offene Anfrage.");
      if (request.fromPlayerId === playerId) throw new GameError("Das ist deine eigene Anfrage.");
      if (state.pendingTrade) throw new GameError("Es gibt bereits ein offenes Handelsangebot.");
      const responder = state.players.find((p) => p.id === playerId);
      const asker = state.players.find((p) => p.id === request.fromPlayerId);
      if (!responder || !asker) throw new GameError("Handelspartner nicht gefunden.");
      if (responder.resources[request.resource] < 1) throw new GameError(`Du hast kein ${TERRAIN_NAMES_DE[request.resource]} zum Abgeben.`);
      if (action.wantInReturn === request.resource) throw new GameError("Wähle einen anderen Rohstoff als Gegenwert.");

      const offer = {
        id: `${Date.now()}-${playerId}`,
        fromPlayerId: playerId,
        toPlayerId: request.fromPlayerId,
        give: { [request.resource]: 1 } as Partial<Record<ResourceType, number>>,
        receive: { [action.wantInReturn]: 1 } as Partial<Record<ResourceType, number>>,
      };
      return {
        ...state,
        pendingTrade: offer,
        log: [...state.log, `${responder.name} bietet ${asker.name} 1x ${TERRAIN_NAMES_DE[request.resource]} für 1x ${TERRAIN_NAMES_DE[action.wantInReturn]}.`],
      };
    }

    case "startNegotiation": {
      if (state.phase !== "mainGame") throw new GameError("Nicht in der Hauptspielphase.");
      if (state.negotiation) throw new GameError("Es läuft bereits eine Verhandlung.");
      if (action.withPlayerId === playerId) throw new GameError("Du kannst nicht mit dir selbst handeln.");
      const initiator = state.players.find((p) => p.id === playerId);
      const partner = state.players.find((p) => p.id === action.withPlayerId);
      if (!initiator || !partner) throw new GameError("Spieler nicht gefunden.");
      return {
        ...state,
        negotiation: {
          id: `${Date.now()}-${playerId}`,
          initiatorId: playerId,
          partnerId: action.withPlayerId,
          status: "pending",
          offers: { [playerId]: {}, [action.withPlayerId]: {} },
          confirmed: { [playerId]: false, [action.withPlayerId]: false },
        },
        log: [...state.log, `${initiator.name} möchte mit ${partner.name} handeln.`],
      };
    }

    case "respondNegotiation": {
      const negotiation = state.negotiation;
      if (!negotiation) throw new GameError("Es gibt keine offene Handelsanfrage.");
      if (negotiation.status !== "pending") throw new GameError("Die Verhandlung läuft bereits.");
      if (negotiation.partnerId !== playerId) throw new GameError("Diese Anfrage richtet sich nicht an dich.");
      if (!action.accept) {
        return { ...state, negotiation: null, log: [...state.log, "Handelsanfrage abgelehnt."] };
      }
      return { ...state, negotiation: { ...negotiation, status: "open" } };
    }

    case "changeNegotiationOffer": {
      const negotiation = state.negotiation;
      if (!negotiation || negotiation.status !== "open") throw new GameError("Kein offener Verhandlungstisch.");
      if (playerId !== negotiation.initiatorId && playerId !== negotiation.partnerId)
        throw new GameError("Du bist nicht Teil dieser Verhandlung.");
      const player = state.players.find((p) => p.id === playerId);
      if (!player) throw new GameError("Spieler nicht gefunden.");

      const mine = { ...(negotiation.offers[playerId] ?? {}) };
      const current = mine[action.resource] ?? 0;
      const next = current + action.delta;
      if (next < 0) throw new GameError("Da liegt nichts mehr auf dem Tisch.");
      if (next > player.resources[action.resource]) throw new GameError("So viel hast du nicht.");
      if (next === 0) delete mine[action.resource];
      else mine[action.resource] = next;

      return {
        ...state,
        negotiation: {
          ...negotiation,
          offers: { ...negotiation.offers, [playerId]: mine },
          // Any change invalidates prior agreement on both sides.
          confirmed: { [negotiation.initiatorId]: false, [negotiation.partnerId]: false },
        },
      };
    }

    case "setNegotiationConfirmed": {
      const negotiation = state.negotiation;
      if (!negotiation || negotiation.status !== "open") throw new GameError("Kein offener Verhandlungstisch.");
      if (playerId !== negotiation.initiatorId && playerId !== negotiation.partnerId)
        throw new GameError("Du bist nicht Teil dieser Verhandlung.");

      const confirmed = { ...negotiation.confirmed, [playerId]: action.confirmed };
      if (!(confirmed[negotiation.initiatorId] && confirmed[negotiation.partnerId])) {
        return { ...state, negotiation: { ...negotiation, confirmed } };
      }

      // Both sides agreed — settle the deal.
      const initiator = state.players.find((p) => p.id === negotiation.initiatorId);
      const partner = state.players.find((p) => p.id === negotiation.partnerId);
      if (!initiator || !partner) throw new GameError("Handelspartner nicht mehr im Spiel.");
      const initiatorOffer = negotiation.offers[negotiation.initiatorId] ?? {};
      const partnerOffer = negotiation.offers[negotiation.partnerId] ?? {};
      if (!hasEnoughResources(initiator, initiatorOffer) || !hasEnoughResources(partner, partnerOffer)) {
        return { ...state, negotiation: null, log: [...state.log, "Handel geplatzt — Rohstoffe haben sich geändert."] };
      }
      const nothingOffered =
        RESOURCE_TYPES.every((r) => !(initiatorOffer[r] ?? 0)) && RESOURCE_TYPES.every((r) => !(partnerOffer[r] ?? 0));
      if (nothingOffered) throw new GameError("Es liegt nichts auf dem Tisch.");

      let next = updatePlayer(state, negotiation.initiatorId, (p) => payCost(p, initiatorOffer));
      next = updatePlayer(next, negotiation.partnerId, (p) => payCost(p, partnerOffer));
      next = updatePlayer(next, negotiation.initiatorId, (p) => {
        const resources = { ...p.resources };
        for (const r of RESOURCE_TYPES) resources[r] += partnerOffer[r] ?? 0;
        return { ...p, resources };
      });
      next = updatePlayer(next, negotiation.partnerId, (p) => {
        const resources = { ...p.resources };
        for (const r of RESOURCE_TYPES) resources[r] += initiatorOffer[r] ?? 0;
        return { ...p, resources };
      });
      return {
        ...next,
        negotiation: null,
        log: [...next.log, `${initiator.name} und ${partner.name} haben am Verhandlungstisch abgeschlossen.`],
      };
    }

    case "cancelNegotiation": {
      const negotiation = state.negotiation;
      if (!negotiation) return state;
      if (playerId !== negotiation.initiatorId && playerId !== negotiation.partnerId)
        throw new GameError("Du bist nicht Teil dieser Verhandlung.");
      return { ...state, negotiation: null, log: [...state.log, "Verhandlung abgebrochen."] };
    }

    case "endTurn": {
      if (state.phase !== "mainGame") throw new GameError("Nicht in der Hauptspielphase.");
      requireCurrentPlayer(state, playerId);
      if (!state.lastDiceRoll) throw new GameError("Erst würfeln, bevor der Zug beendet wird.");
      if (state.lastDiceRoll.total === 7 && !state.robberTileCoord) {
        throw new GameError("Räuber muss nach einer 7 erst bewegt werden.");
      }
      if (Object.keys(state.pendingDiscards).length > 0) throw new GameError("Es müssen noch Karten abgeworfen werden.");
      if (state.pendingSteal) throw new GameError("Der Raubzug ist noch nicht abgeschlossen.");
      const nextIndex = (state.currentPlayerIndex + 1) % state.turnOrder.length;
      let roundCount = state.roundCount;
      let weather = state.weather;
      let log = state.log;
      // A full round has passed once play wraps back to the first player.
      if (nextIndex === 0) {
        roundCount += 1;
        log = [...log, `${ROUND_MARKER} Runde ${roundCount}`];
        if (roundCount % EVENT_EVERY_ROUNDS === 0) {
          weather = drawWeather(state);
          log = [...log, describeWeather(weather)];
        } else if (weather) {
          weather = null;
          log = [...log, "Das Wetter beruhigt sich wieder. ⛅"];
        }
      }
      return {
        ...state,
        currentPlayerIndex: nextIndex,
        roundCount,
        weather,
        log,
        lastDiceRoll: null,
        robberTileCoord: null,
        pendingTrade: null,
        resourceRequest: null,
      };
    }

    case "restartGame": {
      if (state.phase !== "ended") throw new GameError("Neustart erst nach Spielende möglich.");
      if (state.players[0]?.id !== playerId) throw new GameError("Nur der Host kann ein neues Spiel starten.");
      // Keep the seats (id/name/colour/connection), reset everything else back
      // to a fresh lobby so the host can start a new round with a new map.
      const fresh = createLobby(state.roomId);
      return {
        ...fresh,
        demoMode: state.demoMode,
        settings: state.settings, // keep the host's room options across a restart
        players: state.players.map((p) => ({
          ...p,
          resources: emptyResources(),
          developmentCards: [],
          knightsPlayed: 0,
          victoryPoints: 0,
          turnOrderRoll: null,
          objective: null,
          specialBuildings: [],
        })),
        log: [...state.log.slice(-40), "🔄 Neues Spiel — zurück in die Lobby."],
      };
    }

    case "setRoomSettings": {
      if (state.phase !== "lobby") throw new GameError("Einstellungen nur in der Lobby änderbar.");
      if (state.players[0]?.id !== playerId) throw new GameError("Nur der Host kann die Raum-Einstellungen ändern.");
      return { ...state, settings: { ...state.settings, ...action.settings } };
    }

    case "buildSpecial": {
      if (!state.settings.specialBuildings) throw new GameError("Sonderbauten sind in diesem Raum nicht aktiviert.");
      if (state.phase !== "mainGame") throw new GameError("Sonderbauten kannst du nur im Hauptspiel bauen.");
      if (state.turnOrder[state.currentPlayerIndex] !== playerId) throw new GameError("Du bist nicht am Zug.");
      const player = state.players.find((p) => p.id === playerId);
      if (!player) throw new GameError("Spieler nicht gefunden.");
      const spec = SPECIAL_BUILDINGS[action.building];
      if (!spec) throw new GameError("Unbekannter Sonderbau.");
      if (player.specialBuildings.length >= SPECIAL_BUILDING_LIMIT)
        throw new GameError("Du darfst nur einen Sonderbau bauen.");
      if (!hasEnoughResources(player, spec.cost)) throw new GameError(`Nicht genug Rohstoffe für ${spec.title}.`);

      let tiles = state.tiles;
      if (action.building === "watchtower") {
        // Reveal (privately scout) every hidden tile adjacent to my buildings.
        const graph = buildBoardGraph(state.tiles, TILE_SIZE);
        const myTileKeys = new Set<string>();
        for (const b of state.buildings) {
          if (b.ownerId !== playerId) continue;
          for (const c of tilesTouchingVertex(graph, b.vertex)) myTileKeys.add(axialKey(c));
        }
        tiles = state.tiles.map((t) =>
          !t.revealed && myTileKeys.has(axialKey(t.coord)) && !t.scoutedBy.includes(playerId)
            ? { ...t, scoutedBy: [...t.scoutedBy, playerId] }
            : t
        );
      }

      const players = state.players.map((p) =>
        p.id === playerId ? { ...payCost(p, spec.cost), specialBuildings: [...p.specialBuildings, action.building] } : p
      );
      return {
        ...state,
        tiles,
        players,
        log: [...state.log, `${spec.icon} ${player.name} baut ${spec.title}.`],
      };
    }

    default:
      throw new GameError("Unbekannte Aktion.");
  }
}
