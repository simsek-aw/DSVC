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
  RobberVariant,
  RobberModifier,
  Tile,
  PortInfo,
  BuildingType,
  Building,
  Road,
  Player,
  GamePhase,
  DiceRoll,
  GameState,
  ClientAction,
} from "./types";
export { RESOURCE_TYPES, BUILD_COSTS, VICTORY_POINTS_TO_WIN } from "./types";

export type { MapGenOptions, GeneratedMap } from "./mapGenerator";
export { generateMap } from "./mapGenerator";

export { TILE_SIZE, GameError, createLobby, addPlayer, setPlayerConnected, startGame, applyAction } from "./gameEngine";
