import { AxialCoord, VertexId, EdgeId } from "./hexGrid";

export type ResourceType = "wood" | "brick" | "ore" | "wheat" | "sheep";
export type TerrainType = ResourceType | "desert";

export const RESOURCE_TYPES: ResourceType[] = ["wood", "brick", "ore", "wheat", "sheep"];

// The three robber variants — the "modifier" robber (non-classic) is decided
// at reveal time so nobody knows which flavor they're dealing with until touched.
export type RobberVariant = "classic" | "corrupt" | "boon";

export interface RobberModifier {
  variant: RobberVariant;
  // Only relevant for "corrupt": which player receives the redirected harvest.
  beneficiaryPlayerId?: string;
}

export interface Tile {
  coord: AxialCoord;
  terrain: TerrainType;
  numberToken: number | null; // null for desert
  revealed: boolean; // flips true once a settlement touches this tile
  numberRevealed: boolean; // flips true once every player has finished setup
  hasClassicRobber: boolean; // the original robber, moved on a roll of 7
  modifierRobber: RobberModifier | null; // the second, "wildcard" token — hidden until revealed
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

export interface Player {
  id: string;
  name: string;
  color: string;
  connected: boolean;
  resources: Record<ResourceType, number>;
  victoryPoints: number;
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
  modifierRobberTileCoord: AxialCoord | null; // unused placeholder, kept for future multi-modifier support
  winnerId: string | null;
  log: string[];
}

export const BUILD_COSTS: Record<"road" | "settlement" | "city", Partial<Record<ResourceType, number>>> = {
  road: { wood: 1, brick: 1 },
  settlement: { wood: 1, brick: 1, wheat: 1, sheep: 1 },
  city: { wheat: 2, ore: 3 },
};

export const VICTORY_POINTS_TO_WIN = 10;

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
  | { type: "endTurn" };
