import { AxialCoord, VertexId, axialKey, axialNeighbors, tileVertices, vertexKey } from "./hexGrid";
import { ResourceType, Tile } from "./types";

// A seedable PRNG so a given seed always produces the exact same island — that
// is what makes "same-map rematch" possible. `rng` is the module-wide source of
// randomness; generateMap swaps in a seeded one at the top of each run and
// restores Math.random afterwards, so nothing else in the app is affected.
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let rng: () => number = Math.random;

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function pickWeighted(weights: [number, number][]): number {
  const total = weights.reduce((s, [, w]) => s + w, 0);
  let roll = rng() * total;
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
        const score = 1 / (1 + existingNeighbors) + rng() * 0.6;
        frontier.push({ coord: n, score });
      }
    }
    if (frontier.length === 0) break;
    frontier.sort((a, b) => b.score - a.score);
    const topSlice = frontier.slice(0, Math.max(1, Math.floor(frontier.length * 0.4)));
    const chosen = topSlice[Math.floor(rng() * topSlice.length)];
    placed.set(axialKey(chosen.coord), chosen.coord);
  }
  return Array.from(placed.values());
}

function landNeighbors(coord: AxialCoord, set: Set<string>): AxialCoord[] {
  return axialNeighbors(coord).filter((n) => set.has(axialKey(n)));
}

// Articulation points of the hex adjacency graph: hexes whose removal would
// split the island. A one-hex-wide neck is exactly such a point.
function articulationPoints(list: AxialCoord[], set: Set<string>): AxialCoord[] {
  const id = new Map<string, number>();
  list.forEach((c, i) => id.set(axialKey(c), i));
  const n = list.length;
  const disc = new Array(n).fill(-1);
  const low = new Array(n).fill(0);
  const isAP = new Array(n).fill(false);
  let timer = 0;
  const dfs = (u: number, parent: number) => {
    disc[u] = low[u] = timer++;
    let children = 0;
    for (const nb of landNeighbors(list[u], set)) {
      const v = id.get(axialKey(nb))!;
      if (disc[v] === -1) {
        children++;
        dfs(v, u);
        low[u] = Math.min(low[u], low[v]);
        if (parent !== -1 && low[v] >= disc[u]) isAP[u] = true;
      } else if (v !== parent) {
        low[u] = Math.min(low[u], disc[v]);
      }
    }
    if (parent === -1 && children > 1) isAP[u] = true;
  };
  for (let i = 0; i < n; i++) if (disc[i] === -1) dfs(i, -1);
  return list.filter((_, i) => isAP[i]);
}

// Widens one-hex necks so the island is at least two hexes thick everywhere:
// nobody can be walled off by a single blocking settlement on a procedural map.
// Keeps the lobed silhouette — it only fills notches next to a neck.
function thickenNecks(coords: AxialCoord[], maxTiles: number): AxialCoord[] {
  const set = new Set(coords.map(axialKey));
  const list = [...coords];
  for (let iter = 0; iter < 24 && list.length < maxTiles; iter++) {
    const aps = articulationPoints(list, set);
    if (aps.length === 0) break;
    let added = false;
    for (const ap of aps) {
      const empties = axialNeighbors(ap).filter((n) => !set.has(axialKey(n)));
      // Prefer the empty neighbour that touches the most existing land — that
      // fills the notch beside the neck rather than growing a new spike.
      empties.sort((a, b) => landNeighbors(b, set).length - landNeighbors(a, set).length);
      const best = empties.find((c) => landNeighbors(c, set).length >= 2) ?? empties[0];
      if (best && !set.has(axialKey(best))) {
        set.add(axialKey(best));
        list.push(best);
        added = true;
        break;
      }
    }
    if (!added) break;
  }
  return list;
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
  // A 32-bit seed. Same seed + same playerCount → byte-identical island, so a
  // group can rematch on a board they liked. Omit for a fresh random map.
  seed?: number;
}

export interface GeneratedMap {
  tiles: Tile[];
  // The seed actually used, so it can be stored and replayed later.
  seed: number;
}

export function generateMap(options: MapGenOptions): GeneratedMap {
  const { playerCount } = options;
  // Seed the PRNG for this run (random seed when none was supplied), and always
  // restore Math.random on the way out so no other code is left deterministic.
  const seed = (options.seed ?? Math.floor(Math.random() * 0xffffffff)) >>> 0;
  const prevRng = rng;
  rng = mulberry32(seed);
  try {
    return { ...buildMap(options), seed };
  } finally {
    rng = prevRng;
  }
}

function buildMap(options: MapGenOptions): { tiles: Tile[] } {
  const { playerCount } = options;
  // Never too big: base 19 (4p classic), + a few tiles per extra player, capped.
  const tileCount = Math.min(19 + Math.max(0, playerCount - 4) * 5, 30);

  // Grow a lobed island, then widen any one-hex necks so no player can be
  // sealed off by a single blocking build on a procedurally unlucky map.
  const coords = thickenNecks(growBlob(tileCount), 30);
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
      scoutedBy: [],
      treasure: null,
    };
  });

  // Scatter a few one-off finds under hidden tiles: worth exploring toward.
  const treasureKinds: ("cache" | "relic" | "curse")[] = ["cache", "cache", "relic", "curse"];
  const treasureCandidates = shuffle(tiles.filter((t) => t.terrain !== "desert"));
  for (let i = 0; i < Math.min(treasureKinds.length, treasureCandidates.length); i++) {
    treasureCandidates[i].treasure = treasureKinds[i];
  }

  // Place the classic robber on the desert if present, otherwise a random tile.
  if (!tiles.some((t) => t.hasClassicRobber)) {
    tiles[Math.floor(rng() * tiles.length)].hasClassicRobber = true;
  }

  // Place the single, fixed Boost figure on a random non-desert, non-classic-robber tile.
  // It stays hidden (like the tile beneath it) until a settlement reveals it.
  const candidatesForBoost = tiles.filter((t) => !t.hasClassicRobber && t.terrain !== "desert");
  if (candidatesForBoost.length > 0) {
    candidatesForBoost[Math.floor(rng() * candidatesForBoost.length)].hasBoostToken = true;
  }

  // Ports sit on the open coast: on the edge a tile actually shares with the
  // outer sea. A landlocked lagoon inside the island is water too, but no ship
  // could ever reach it, so those edges are excluded.
  const size = options.tileSize ?? 1;
  const coordSet = new Set(tiles.map((t) => axialKey(t.coord)));
  const openSea = openSeaCoords(tiles.map((t) => t.coord), coordSet);

  // Every (tile, sea-facing edge) pair that could carry a port. The water on
  // the far side has to be roomy as well as reachable: a narrow bay between two
  // headlands is open sea by the flood fill, but no place to moor a ship — and
  // on screen the beach ring closes it up anyway. So the sea has to be at least
  // two hexes deep straight out from the coast, and the near hex mostly water.
  const isSea = (c: AxialCoord) => !coordSet.has(axialKey(c));
  const berths: { tile: Tile; edge: [VertexId, VertexId] }[] = [];
  for (const tile of tiles) {
    if (tile.terrain === "desert") continue;
    for (const neighbor of axialNeighbors(tile.coord)) {
      if (!openSea.has(axialKey(neighbor))) continue;
      const beyond = { q: neighbor.q * 2 - tile.coord.q, r: neighbor.r * 2 - tile.coord.r };
      if (!isSea(beyond)) continue;
      if (axialNeighbors(neighbor).filter(isSea).length < 3) continue;
      const edge = sharedEdge(tile.coord, neighbor, size);
      if (edge) berths.push({ tile, edge });
    }
  }

  const portResources: (ResourceType | "any")[] = ["any", "any", "any", "any", "wood", "brick", "ore", "wheat", "sheep"];
  const shuffledBerths = shuffle(berths);
  const portCount = Math.min(portResources.length, Math.floor(berths.length / 3));
  let placed = 0;
  for (const berth of shuffledBerths) {
    if (placed >= portCount) break;
    if (berth.tile.port) continue; // one port per tile
    const resource = portResources[placed];
    berth.tile.port = {
      resource,
      ratio: resource === "any" ? 3 : 2,
      edgeVertices: berth.edge,
    };
    placed++;
  }

  return { tiles };
}

/**
 * Flood-fills the sea from outside the island, so an enclosed lagoon can be
 * told apart from the ocean. Works on a bounding box two rings larger than the
 * land, which is enough room for the fill to wrap all the way around.
 */
function openSeaCoords(land: AxialCoord[], landSet: Set<string>): Set<string> {
  const qs = land.map((c) => c.q);
  const rs = land.map((c) => c.r);
  const minQ = Math.min(...qs) - 2;
  const maxQ = Math.max(...qs) + 2;
  const minR = Math.min(...rs) - 2;
  const maxR = Math.max(...rs) + 2;
  const inBox = (c: AxialCoord) => c.q >= minQ && c.q <= maxQ && c.r >= minR && c.r <= maxR;

  const start = { q: minQ, r: minR };
  const open = new Set<string>();
  const queue: AxialCoord[] = [start];
  open.add(axialKey(start));
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const next of axialNeighbors(current)) {
      const key = axialKey(next);
      if (open.has(key) || landSet.has(key) || !inBox(next)) continue;
      open.add(key);
      queue.push(next);
    }
  }
  return open;
}

/** The two corners two neighbouring hexes have in common. */
function sharedEdge(a: AxialCoord, b: AxialCoord, size: number): [VertexId, VertexId] | null {
  const bKeys = new Set(tileVertices(b, size).map(vertexKey));
  const shared = tileVertices(a, size).filter((v) => bKeys.has(vertexKey(v)));
  return shared.length === 2 ? [shared[0], shared[1]] : null;
}
