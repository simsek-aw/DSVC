import { AxialCoord, EdgeId, VertexId, axialKey, edgeKey, tileEdges, tileVertices, vertexKey } from "./hexGrid";
import { Tile } from "./types";

export interface BoardGraph {
  edges: Map<string, EdgeId>;
  vertexNeighbors: Map<string, VertexId[]>;
  vertexTiles: Map<string, AxialCoord[]>;
  vertices: Map<string, VertexId>;
}

export function buildBoardGraph(tiles: Tile[], tileSize: number): BoardGraph {
  const edges = new Map<string, EdgeId>();
  const vertexNeighbors = new Map<string, VertexId[]>();
  const vertexTiles = new Map<string, AxialCoord[]>();
  const vertices = new Map<string, VertexId>();

  for (const tile of tiles) {
    const verts = tileVertices(tile.coord, tileSize);
    for (const v of verts) {
      const vk = vertexKey(v);
      vertices.set(vk, v);
      const list = vertexTiles.get(vk) ?? [];
      if (!list.some((c) => axialKey(c) === axialKey(tile.coord))) list.push(tile.coord);
      vertexTiles.set(vk, list);
    }
    for (const e of tileEdges(tile.coord, tileSize)) {
      edges.set(edgeKey(e), e);
      const ka = vertexKey(e.a);
      const kb = vertexKey(e.b);
      const na = vertexNeighbors.get(ka) ?? [];
      if (!na.some((v) => vertexKey(v) === kb)) na.push(e.b);
      vertexNeighbors.set(ka, na);
      const nb = vertexNeighbors.get(kb) ?? [];
      if (!nb.some((v) => vertexKey(v) === ka)) nb.push(e.a);
      vertexNeighbors.set(kb, nb);
    }
  }

  return { edges, vertexNeighbors, vertexTiles, vertices };
}

export function tilesTouchingVertex(graph: BoardGraph, v: VertexId): AxialCoord[] {
  return graph.vertexTiles.get(vertexKey(v)) ?? [];
}

export function vertexNeighborsOf(graph: BoardGraph, v: VertexId): VertexId[] {
  return graph.vertexNeighbors.get(vertexKey(v)) ?? [];
}
