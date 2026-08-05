import { AxialCoord, VertexId, EdgeId } from "./hexGrid";

export type ResourceType = "wood" | "brick" | "ore" | "wheat" | "sheep";
export type TerrainType = ResourceType | "desert";

export const RESOURCE_TYPES: ResourceType[] = ["wood", "brick", "ore", "wheat", "sheep"];

export interface Tile {
  coord: AxialCoord;
  terrain: TerrainType;
  numberToken: number | null; // null for desert
  revealed: boolean; // flips true once a settlement touches this tile
  numberRevealed: boolean; // flips true once every player has finished setup
  hasClassicRobber: boolean; // the original robber, moved on a roll of 7
  hasBoostToken: boolean; // fixed "wildcard" figure placed at map gen, hidden until revealed; doubles the tile's harvest forever
  port: PortInfo | null; // hidden (like the tile) until touched
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
  turnOrderRoll: number | null;
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
  winnerId: string | null;
  log: string[];
}

export const BUILD_COSTS: Record<"road" | "settlement" | "city" | "developmentCard", Partial<Record<ResourceType, number>>> = {
  road: { wood: 1, brick: 1 },
  settlement: { wood: 1, brick: 1, wheat: 1, sheep: 1 },
  city: { wheat: 2, ore: 3 },
  developmentCard: { ore: 1, wheat: 1, sheep: 1 },
};

export const VICTORY_POINTS_TO_WIN = 10;
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
  | { type: "endTurn" };
