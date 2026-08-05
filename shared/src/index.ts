export type { AxialCoord, VertexId, EdgeId } from "./hexGrid";
export {
  axialKey,
  axialEquals,
  axialNeighbors,
  axialDistance,
  axialToPixel,
  hexCorners,
  vertexKey,
  edgeKey,
  tileVertices,
  tileEdges,
} from "./hexGrid";

export type { BoardGraph } from "./boardGraph";
export { buildBoardGraph, tilesTouchingVertex, vertexNeighborsOf } from "./boardGraph";

export type {
  ResourceType,
  TerrainType,
  Tile,
  PortInfo,
  BuildingType,
  Building,
  Road,
  DevelopmentCardType,
  Player,
  GamePhase,
  DiceRoll,
  TradeOffer,
  ResourceRequest,
  Negotiation,
  PendingSteal,
  GameState,
  ClientAction,
} from "./types";
export {
  RESOURCE_TYPES,
  TERRAIN_NAMES_DE,
  BUILD_COSTS,
  VICTORY_POINTS_TO_WIN,
  HAND_LIMIT_ON_SEVEN,
  LONGEST_ROAD_MIN_LENGTH,
  LARGEST_ARMY_MIN_KNIGHTS,
  LONGEST_ROAD_BONUS,
  LARGEST_ARMY_BONUS,
} from "./types";

export type { MapGenOptions, GeneratedMap } from "./mapGenerator";
export { generateMap } from "./mapGenerator";

export { longestRoadLength } from "./longestRoad";

export {
  TILE_SIZE,
  GameError,
  createLobby,
  createDemoLobby,
  addPlayer,
  removePlayer,
  setPlayerConnected,
  startGame,
  applyAction,
  totalVictoryPoints,
  bestBankRatio,
  handSize,
} from "./gameEngine";
