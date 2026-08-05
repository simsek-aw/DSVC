import { AxialCoord, axialKey, axialNeighbors, tileEdges } from "./hexGrid";
import { ResourceType, Tile } from "./types";

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function pickWeighted(weights: [number, number][]): number {
  const total = weights.reduce((s, [, w]) => s + w, 0);
  let roll = Math.random() * total;
  for (const [value, w] of weights) {
    if (roll < w) return value;
    roll -= w;
  }
  return weights[weights.length - 1][0];
}

// Grows an irregular (non-circular) blob of `count` connected hexes from the origin.
// Frontier tiles are picked with a slight bias toward tiles that already have
// few placed neighbors, which produces lobed / coastline-like shapes instead of a disc.
function growBlob(count: number): AxialCoord[] {
  const placed = new Map<string, AxialCoord>();
  const origin: AxialCoord = { q: 0, r: 0 };
  placed.set(axialKey(origin), origin);

  while (placed.size < count) {
    const frontier: { coord: AxialCoord; score: number }[] = [];
    for (const tile of placed.values()) {
      for (const n of axialNeighbors(tile)) {
        const key = axialKey(n);
        if (placed.has(key)) continue;
        const existingNeighbors = axialNeighbors(n).filter((nn) => placed.has(axialKey(nn))).length;
        // Favor low-neighbor-count spots so the shape grows lobes rather than a perfect circle.
        const score = 1 / (1 + existingNeighbors) + Math.random() * 0.6;
        frontier.push({ coord: n, score });
      }
    }
    if (frontier.length === 0) break;
    frontier.sort((a, b) => b.score - a.score);
    const topSlice = frontier.slice(0, Math.max(1, Math.floor(frontier.length * 0.4)));
    const chosen = topSlice[Math.floor(Math.random() * topSlice.length)];
    placed.set(axialKey(chosen.coord), chosen.coord);
  }
  return Array.from(placed.values());
}

function terrainPool(count: number): ("wood" | "brick" | "ore" | "wheat" | "sheep" | "desert")[] {
  // Ratios modeled on the classic 19-tile board (4/3/3/4/4/1), scaled to `count`.
  const base: [string, number][] = [
    ["wood", 4],
    ["brick", 3],
    ["ore", 3],
    ["wheat", 4],
    ["sheep", 4],
    ["desert", 1],
  ];
  const baseTotal = 19;
  const pool: string[] = [];
  let assigned = 0;
  for (const [terrain, n] of base) {
    const scaled = Math.max(terrain === "desert" ? 1 : 1, Math.round((n / baseTotal) * count));
    for (let i = 0; i < scaled; i++) pool.push(terrain);
    assigned += scaled;
  }
  while (pool.length < count) pool.push("wood");
  while (pool.length > count) {
    const idx = pool.findIndex((t) => t !== "desert");
    pool.splice(idx, 1);
  }
  return shuffle(pool as any);
}

function numberTokenPool(landTileCount: number): number[] {
  // Classic pip frequency (2 and 12 rarest, 6 and 8 most common), scaled up.
  const weights: [number, number][] = [
    [2, 1],
    [3, 2],
    [4, 2],
    [5, 2],
    [6, 2],
    [8, 2],
    [9, 2],
    [10, 2],
    [11, 2],
    [12, 1],
  ];
  const pool: number[] = [];
  const totalWeight = weights.reduce((s, [, w]) => s + w, 0);
  for (let i = 0; i < landTileCount; i++) {
    const idx = i % totalWeight;
    let acc = 0;
    for (const [value, w] of weights) {
      acc += w;
      if (idx < acc) {
        pool.push(value);
        break;
      }
    }
  }
  return shuffle(pool);
}

export interface MapGenOptions {
  playerCount: number;
  tileSize?: number;
}

export interface GeneratedMap {
  tiles: Tile[];
}

export function generateMap(options: MapGenOptions): GeneratedMap {
  const { playerCount } = options;
  // Never too big: base 19 (4p classic), + a few tiles per extra player, capped.
  const tileCount = Math.min(19 + Math.max(0, playerCount - 4) * 5, 30);

  const coords = growBlob(tileCount);
  const terrains = terrainPool(coords.length);
  const landCoordsForNumbers = terrains.filter((t) => t !== "desert").length;
  const numbers = numberTokenPool(landCoordsForNumbers);

  let numberCursor = 0;
  const tiles: Tile[] = coords.map((coord, i) => {
    const terrain = terrains[i];
    const numberToken = terrain === "desert" ? null : numbers[numberCursor++];
    return {
      coord,
      terrain,
      numberToken,
      revealed: false,
      numberRevealed: false,
      hasClassicRobber: terrain === "desert",
      hasBoostToken: false,
      port: null,
    };
  });

  // Place the classic robber on the desert if present, otherwise a random tile.
  if (!tiles.some((t) => t.hasClassicRobber)) {
    tiles[Math.floor(Math.random() * tiles.length)].hasClassicRobber = true;
  }

  // Place the single, fixed Boost figure on a random non-desert, non-classic-robber tile.
  // It stays hidden (like the tile beneath it) until a settlement reveals it.
  const candidatesForBoost = tiles.filter((t) => !t.hasClassicRobber && t.terrain !== "desert");
  if (candidatesForBoost.length > 0) {
    candidatesForBoost[Math.floor(Math.random() * candidatesForBoost.length)].hasBoostToken = true;
  }

  // Ports: find coastline tiles (fewer than 6 neighbors placed) and scatter a handful of ports on them.
  const coordSet = new Set(tiles.map((t) => axialKey(t.coord)));
  const coastalTiles = tiles.filter(
    (t) => axialNeighbors(t.coord).some((n) => !coordSet.has(axialKey(n))) && t.terrain !== "desert"
  );
  const portResources: (ResourceType | "any")[] = ["any", "any", "any", "any", "wood", "brick", "ore", "wheat", "sheep"];
  const shuffledCoastal = shuffle(coastalTiles);
  const portCount = Math.min(portResources.length, Math.floor(coastalTiles.length / 2));
  for (let i = 0; i < portCount; i++) {
    const tile = shuffledCoastal[i];
    const edges = tileEdges(tile.coord, options.tileSize ?? 1);
    const edge = edges[Math.floor(Math.random() * edges.length)];
    const resource = portResources[i];
    tile.port = {
      resource,
      ratio: resource === "any" ? 3 : 2,
      edgeVertices: [edge.a, edge.b],
    };
  }

  return { tiles };
}
