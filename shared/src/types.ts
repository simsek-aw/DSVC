import { AxialCoord, VertexId, EdgeId } from "./hexGrid";

export type ResourceType = "wood" | "brick" | "ore" | "wheat" | "sheep";
// "unknown" only ever reaches the client: the server blanks out tiles a
// particular player has neither uncovered nor scouted before sending state.
export type TerrainType = ResourceType | "desert" | "unknown";

export const RESOURCE_TYPES: ResourceType[] = ["wood", "brick", "ore", "wheat", "sheep"];

// Display names for log messages and errors, which are user-facing German.
export const TERRAIN_NAMES_DE: Record<TerrainType, string> = {
  wood: "Holz",
  brick: "Lehm",
  ore: "Erz",
  wheat: "Weizen",
  sheep: "Wolle",
  desert: "Wüsten",
  unknown: "unbekannt",
};

// One-off find sitting under a hidden tile, triggered when it is first uncovered.
export type TreasureType = "cache" | "relic" | "curse";

export interface Tile {
  coord: AxialCoord;
  terrain: TerrainType;
  numberToken: number | null; // null for desert
  revealed: boolean; // flips true once a settlement touches this tile
  numberRevealed: boolean; // flips true once every player has finished setup
  hasClassicRobber: boolean; // the original robber, moved on a roll of 7
  hasBoostToken: boolean; // fixed "wildcard" figure placed at map gen, hidden until revealed; doubles the tile's harvest forever
  port: PortInfo | null; // hidden (like the tile) until touched
  // Players who paid to scout this tile: they see it privately, everyone else
  // still sees the back until a settlement uncovers it for good.
  scoutedBy: string[];
  treasure: TreasureType | null; // cleared once collected
}

export interface PortInfo {
  resource: ResourceType | "any";
  ratio: 2 | 3;
  edgeVertices: [VertexId, VertexId]; // the coastal edge the port sits on
}

export type BuildingType = "settlement" | "city";

export interface Building {
  vertex: VertexId;
  type: BuildingType;
  ownerId: string;
}

export interface Road {
  edge: EdgeId;
  ownerId: string;
}

// Bought with ore+wheat+sheep, played from hand. "bribery" is the direct answer to the
// classic robber's 7-roll blocking: it's a deliberate, targetable action fully decoupled
// from dice rolls, so it can't be undone by the next 7.
export type DevelopmentCardType = "knight" | "roadBuilding" | "invention" | "monopoly" | "bribery";

export interface Player {
  id: string;
  name: string;
  color: string;
  connected: boolean;
  resources: Record<ResourceType, number>;
  developmentCards: DevelopmentCardType[];
  knightsPlayed: number;
  victoryPoints: number; // from settlements/cities only — longest road & largest army are added on top when computing totals
  turnOrderRoll: DiceRoll | null;
  // A face-down mission dealt at game start when the room enables them. Only the
  // owner ever sees it (viewFor blanks it for everyone else until the game ends);
  // when its condition is met it silently adds hidden victory points.
  objective: SecretObjectiveId | null;
  // The single special building this player has raised, when the room enables
  // them. Each player may build at most ONE, it gives no victory points — only a
  // one-off strategic effect. It is placed on a vertex where the player already
  // has a settlement or city, so it is visible on the board.
  specialBuildings: SpecialBuildingPlacement[];
}

// Optional buildings. Each grants an effect (not victory points), and every
// player may build only ONE for the whole game — a real trade-off. It attaches
// to one of the player's own building vertices so it shows up on the map.
export type SpecialBuildingId = "lighthouse" | "watchtower";

export interface SpecialBuildingPlacement {
  id: SpecialBuildingId;
  vertex: VertexId;
  ownerId: string;
}

export interface SpecialBuilding {
  id: SpecialBuildingId;
  title: string;
  icon: string;
  cost: Partial<Record<ResourceType, number>>;
  desc: string;
}

export const SPECIAL_BUILDINGS: Record<SpecialBuildingId, SpecialBuilding> = {
  lighthouse: {
    id: "lighthouse",
    title: "Leuchtturm",
    icon: "🗼",
    cost: { wood: 1, brick: 1, sheep: 1 },
    desc: "Deine Seehandels-Rate wird dauerhaft eine Stufe besser (z. B. 4:1 → 3:1, Hafen 3:1 → 2:1).",
  },
  watchtower: {
    id: "watchtower",
    title: "Späherturm",
    icon: "🔭",
    cost: { wood: 1, ore: 1, sheep: 1 },
    desc: "Deckt beim Bau alle verdeckten Felder auf, die an deine Bauwerke grenzen — nur für dich.",
  },
};

// A player may build at most this many special buildings in a game.
export const SPECIAL_BUILDING_LIMIT = 1;

// Hidden missions. Each is checkable purely from board state so scoring is
// deterministic, and each grants extra victory points nobody else can see coming.
export type SecretObjectiveId = "roadKing" | "metropolis" | "warlord" | "expander" | "harborMaster";

export interface SecretObjective {
  id: SecretObjectiveId;
  title: string;
  desc: string;
  bonus: number; // hidden victory points once complete
}

export const SECRET_OBJECTIVES: Record<SecretObjectiveId, SecretObjective> = {
  roadKing: { id: "roadKing", title: "Straßenkönig", desc: "Halte eine Straße mit Länge ≥ 7", bonus: 2 },
  metropolis: { id: "metropolis", title: "Metropole", desc: "Besitze 3 Städte", bonus: 2 },
  warlord: { id: "warlord", title: "Kriegsherr", desc: "Spiele 3 Ritter", bonus: 1 },
  expander: { id: "expander", title: "Weitläufig", desc: "Besitze 7 Bauwerke (Siedlungen + Städte)", bonus: 2 },
  harborMaster: { id: "harborMaster", title: "Hafenmeister", desc: "Sitze an mindestens 2 Häfen", bonus: 2 },
};

// Room options the host locks in before starting. Both default off so a plain
// game plays exactly as before; each unlocks one extra layer of strategy.
export interface GameSettings {
  secretObjectives: boolean; // deal each player a hidden mission worth extra VP
  specialBuildings: boolean; // reserved for the special-buildings layer
  knightForcesDiscard: boolean; // house rule: playing a knight also forces the >7 discard
  mapSeed?: number; // optional fixed seed so a group can rematch the same island
}

export function defaultSettings(): GameSettings {
  return { secretObjectives: false, specialBuildings: false, knightForcesDiscard: false };
}

export type GamePhase =
  | "lobby"
  | "turnOrderRoll"
  | "setup"
  | "mainGame"
  | "ended";

export interface DiceRoll {
  die1: number;
  die2: number;
  total: number;
}

export interface TradeOffer {
  id: string;
  fromPlayerId: string;
  toPlayerId: string;
  give: Partial<Record<ResourceType, number>>;
  receive: Partial<Record<ResourceType, number>>;
}

// An open "I need X" shout-out to the whole table. Anyone actually holding
// that resource can answer it with a one-for-one counter-offer, which then
// runs through the normal TradeOffer accept/decline flow.
export interface ResourceRequest {
  id: string;
  fromPlayerId: string;
  resource: ResourceType;
}

// The "big trade": a shared negotiation table two players push resources onto
// until both confirm. Any change to either side clears both confirmations, so
// nobody can quietly alter the deal after the other side has agreed.
// After the robber lands, the thief picks a face-down card out of the victim's
// hand. `hand` is the victim's cards in their current (hidden) order — the
// victim may reshuffle it right up until the thief commits to a position.
export interface PendingSteal {
  thiefId: string;
  candidateIds: string[]; // players adjacent to the robber who still hold cards
  victimId: string | null; // set once the thief has picked whom to rob
  // The victim's cards in their current order. Only the victim ever receives
  // the actual contents — everyone else gets an empty list plus handCount, so
  // the thief cannot read the answer out of the network payload.
  hand: ResourceType[];
  handCount: number;
}

// Island events drawn every few rounds, lasting exactly one round. Kept
// deliberately simple: each effect touches a single, well-defined spot
// (production or the bank ratio), so it can't quietly unbalance the game.
export type WeatherKind = "bounty" | "drought" | "fair" | "storm";
export interface WeatherEvent {
  kind: WeatherKind;
  number?: number; // bounty: this rolled number pays double this round
  terrain?: ResourceType; // drought: this terrain yields nothing this round
}

export const EVENT_EVERY_ROUNDS = 3;

/** A transient emoji reaction a player fires; the client floats it briefly over
 * the sender's chip and then forgets it. Kept only as a short recent tail in
 * game state (no clock in the pure engine), each with a monotonic id so a
 * client shows every reaction exactly once. */
export interface Reaction {
  id: number;
  playerId: string;
  emoji: string;
}

/** Emoji a player may fire as a quick reaction. Kept short and unambiguous. */
export const REACTION_EMOJIS = ["👍", "😂", "😮", "😡", "🎉", "🤝", "🎲", "🔥"] as const;

export interface Negotiation {
  id: string;
  initiatorId: string;
  partnerId: string;
  status: "pending" | "open"; // pending = invitation sent, open = table live
  offers: Record<string, Partial<Record<ResourceType, number>>>; // keyed by player id
  confirmed: Record<string, boolean>; // keyed by player id
}

export interface GameState {
  roomId: string;
  phase: GamePhase;
  players: Player[];
  turnOrder: string[]; // player ids, decided by turnOrderRoll, snake order used during setup
  currentPlayerIndex: number;
  setupRound: 1 | 2; // first pass places settlement #1, second pass places settlement #2 (reverse order)
  setupStepAwaitingRoad: boolean; // true right after placing a setup settlement, before its road
  tiles: Tile[];
  buildings: Building[];
  roads: Road[];
  lastDiceRoll: DiceRoll | null;
  // Persistent classic-robber location lives on the tile (`hasClassicRobber`).
  // This field is a per-turn gate: set once the robber has been moved after a 7,
  // cleared again on endTurn.
  robberTileCoord: AxialCoord | null;
  developmentDeck: DevelopmentCardType[];
  briberyTileCoord: AxialCoord | null; // where the "bribed" marker currently sits, if played at all
  briberyBeneficiaryId: string | null; // which player receives the redirected harvest
  longestRoadPlayerId: string | null;
  largestArmyPlayerId: string | null;
  pendingTrade: TradeOffer | null; // only one outstanding player-to-player offer at a time, for simplicity
  resourceRequest: ResourceRequest | null; // one open "I need X" call at a time
  negotiation: Negotiation | null; // one open negotiation table at a time
  // On a 7, everyone over the hand limit must discard half before the robber
  // may move. Maps player id → how many cards they still owe.
  pendingDiscards: Record<string, number>;
  pendingSteal: PendingSteal | null;
  // Demo rooms let a single device act as every player, so one person can try
  // the whole game (including both sides of a trade) without a second phone.
  demoMode: boolean;
  winnerId: string | null;
  // Full turns completed (incremented whenever play wraps back to the first
  // player), and the island event in force for the current round, if any.
  roundCount: number;
  weather: WeatherEvent | null;
  settings: GameSettings;
  // The seed the current island was generated from — shown to players and
  // reusable to rematch the exact same board. 0 until the game starts.
  mapSeed: number;
  // Recent emoji reactions (capped tail) plus a monotonic counter so every
  // reaction is shown exactly once on each client, even after the tail is pruned.
  reactions: Reaction[];
  reactionSeq: number;
  log: string[];
}

export const BUILD_COSTS: Record<"road" | "settlement" | "city" | "developmentCard", Partial<Record<ResourceType, number>>> = {
  road: { wood: 1, brick: 1 },
  settlement: { wood: 1, brick: 1, wheat: 1, sheep: 1 },
  city: { wheat: 2, ore: 3 },
  developmentCard: { ore: 1, wheat: 1, sheep: 1 },
};

export const VICTORY_POINTS_TO_WIN = 10;
export const SCOUT_COST: Partial<Record<ResourceType, number>> = { sheep: 1 };
export const HAND_LIMIT_ON_SEVEN = 7; // more than this and you discard half on a 7
// Chat messages live in the same log stream; this marker is what lets the UI
// tell a player's message apart from an event the engine wrote.
export const CHAT_PREFIX = "💬 ";
// Round divider written into the log at the start of each new round.
export const ROUND_MARKER = "———";
export const CHAT_MAX_LENGTH = 160;
// Physical pieces each player owns, classic Catan counts. City upgrades hand
// the settlement token back, so the two are capped independently.
export const PIECE_LIMITS = { settlement: 5, city: 4, road: 15 } as const;
export const LONGEST_ROAD_MIN_LENGTH = 5;
export const LARGEST_ARMY_MIN_KNIGHTS = 3;
export const LONGEST_ROAD_BONUS = 2;
export const LARGEST_ARMY_BONUS = 2;

export type ClientAction =
  | { type: "createRoom"; playerName: string }
  | { type: "joinRoom"; roomId: string; playerName: string }
  | { type: "startGame" }
  | { type: "rollTurnOrder" }
  | { type: "placeSetupSettlement"; vertex: VertexId }
  | { type: "placeSetupRoad"; edge: EdgeId }
  | { type: "rollDice" }
  | { type: "moveClassicRobber"; coord: AxialCoord }
  | { type: "buildRoad"; edge: EdgeId }
  | { type: "buildSettlement"; vertex: VertexId }
  | { type: "buildCity"; vertex: VertexId }
  | { type: "buyDevelopmentCard" }
  | { type: "playKnight"; coord: AxialCoord }
  | { type: "playRoadBuilding"; edges: [EdgeId, EdgeId] }
  | { type: "playInvention"; resources: [ResourceType, ResourceType] }
  | { type: "playMonopoly"; resource: ResourceType }
  | { type: "playBribery"; coord: AxialCoord }
  | { type: "bankTrade"; give: ResourceType; receive: ResourceType }
  | { type: "offerTrade"; toPlayerId: string; give: Partial<Record<ResourceType, number>>; receive: Partial<Record<ResourceType, number>> }
  | { type: "respondTrade"; accept: boolean }
  | { type: "scoutTile"; coord: AxialCoord }
  | { type: "requestResource"; resource: ResourceType }
  | { type: "cancelResourceRequest" }
  | { type: "offerQuickTrade"; wantInReturn: ResourceType }
  | { type: "discardResources"; resources: Partial<Record<ResourceType, number>> }
  | { type: "chooseStealVictim"; victimId: string }
  | { type: "sendChat"; text: string }
  | { type: "sendReaction"; emoji: string }
  | { type: "shuffleStealHand" }
  | { type: "reorderStealHand"; from: number; to: number }
  | { type: "stealCard"; index: number }
  | { type: "startNegotiation"; withPlayerId: string }
  | { type: "respondNegotiation"; accept: boolean }
  | { type: "changeNegotiationOffer"; resource: ResourceType; delta: 1 | -1 }
  | { type: "setNegotiationConfirmed"; confirmed: boolean }
  | { type: "cancelNegotiation" }
  | { type: "endTurn" }
  | { type: "restartGame" }
  | { type: "setRoomSettings"; settings: Partial<GameSettings> }
  | { type: "buildSpecial"; building: SpecialBuildingId; vertex: VertexId };
