// A small heuristic bot so one person can play solo against filled seats. It is
// intentionally simple and greedy: it returns an ORDERED list of candidate
// actions for the given AI player, and the caller applies the first that the
// engine accepts (try/catch), so a slightly-illegal guess just falls through to
// the next option instead of crashing. `computeAiActions` is a pure function of
// the (full, unmasked) server state — never call it with a per-player view.
import { GameState, ClientAction, ResourceType, RESOURCE_TYPES, BUILD_COSTS, Player } from "./types";
import { BoardGraph, buildBoardGraph, tilesTouchingVertex, vertexNeighborsOf } from "./boardGraph";
import { VertexId, axialKey, vertexKey, edgeKey } from "./hexGrid";
import { TILE_SIZE } from "./gameEngine";

// Dice-odds weight of a number token (6/8 best, 2/12 worst, null/desert = 0).
function pip(n: number | null): number {
  if (n === null) return 0;
  return 6 - Math.abs(7 - n);
}

function canAfford(player: Player, cost: "road" | "settlement" | "city" | "developmentCard"): boolean {
  const costs = BUILD_COSTS[cost];
  return Object.entries(costs).every(([r, amount]) => player.resources[r as ResourceType] >= (amount ?? 0));
}

function vertexValue(state: GameState, graph: BoardGraph, v: VertexId): number {
  let score = 0;
  for (const coord of tilesTouchingVertex(graph, v)) {
    const tile = state.tiles.find((t) => axialKey(t.coord) === axialKey(coord));
    if (!tile || tile.terrain === "desert" || tile.terrain === "unknown") continue;
    score += pip(tile.numberToken) + 1; // +1 so any real tile beats open water
  }
  return score;
}

function occupied(state: GameState, v: VertexId): boolean {
  return state.buildings.some((b) => vertexKey(b.vertex) === vertexKey(v));
}

function neighborOccupied(state: GameState, graph: BoardGraph, v: VertexId): boolean {
  return vertexNeighborsOf(graph, v).some((n) => occupied(state, n));
}

// Vertices where this player could legally aim a settlement (free, spacing rule
// satisfied), best production first.
function candidateSettlementVertices(state: GameState, graph: BoardGraph): VertexId[] {
  return [...graph.vertices.values()]
    .filter((v) => !occupied(state, v) && !neighborOccupied(state, graph, v))
    .sort((a, b) => vertexValue(state, graph, b) - vertexValue(state, graph, a));
}

function myRoadVertexKeys(state: GameState, playerId: string): Set<string> {
  const keys = new Set<string>();
  for (const r of state.roads) {
    if (r.ownerId !== playerId) continue;
    keys.add(vertexKey(r.edge.a));
    keys.add(vertexKey(r.edge.b));
  }
  for (const b of state.buildings) {
    if (b.ownerId === playerId) keys.add(vertexKey(b.vertex));
  }
  return keys;
}

/**
 * Ordered candidate actions for an AI player in the current state. The first one
 * the engine accepts should be applied; re-run after each accepted action until
 * it is a human's turn (or the list is empty).
 */
export function computeAiActions(state: GameState, playerId: string): ClientAction[] {
  const me = state.players.find((p) => p.id === playerId);
  if (!me || !me.isAI) return [];
  const graph = buildBoardGraph(state.tiles, TILE_SIZE);
  const isMyTurn = state.turnOrder[state.currentPlayerIndex] === playerId;
  const out: ClientAction[] = [];

  // ── Obligations that can arise on ANYONE's turn ─────────────────────────
  // Discard down after a 7.
  const owed = state.pendingDiscards[playerId] ?? 0;
  if (owed > 0) {
    const resources: Partial<Record<ResourceType, number>> = {};
    let left = owed;
    // Shed from the most-abundant resources first.
    const byAbundance = [...RESOURCE_TYPES].sort((a, b) => me.resources[b] - me.resources[a]);
    for (const r of byAbundance) {
      if (left <= 0) break;
      const take = Math.min(me.resources[r], left);
      if (take > 0) {
        resources[r] = take;
        left -= take;
      }
    }
    return [{ type: "discardResources", resources }];
  }

  // Being the thief mid-steal: pick a victim, then grab a card.
  const steal = state.pendingSteal;
  if (steal && steal.thiefId === playerId) {
    if (!steal.victimId && steal.candidateIds.length > 0) return [{ type: "chooseStealVictim", victimId: steal.candidateIds[0] }];
    if (steal.victimId && steal.handCount > 0) return [{ type: "stealCard", index: 0 }];
  }

  // A trade offered TO this bot: politely decline (bots don't negotiate).
  if (state.pendingTrade && state.pendingTrade.toPlayerId === playerId) {
    return [{ type: "respondTrade", accept: false }];
  }

  // ── Turn-order roll ─────────────────────────────────────────────────────
  if (state.phase === "turnOrderRoll") {
    if (!me.turnOrderRoll) return [{ type: "rollTurnOrder" }];
    return [];
  }

  if (!isMyTurn) return [];

  // ── Opening placement ───────────────────────────────────────────────────
  if (state.phase === "setup") {
    if (state.setupStepAwaitingRoad) {
      const mine = [...state.buildings].reverse().find((b) => b.ownerId === playerId);
      if (mine) {
        for (const e of graph.edges.values()) {
          const touches = vertexKey(e.a) === vertexKey(mine.vertex) || vertexKey(e.b) === vertexKey(mine.vertex);
          if (touches && !state.roads.some((r) => edgeKey(r.edge) === edgeKey(e))) out.push({ type: "placeSetupRoad", edge: e });
        }
      }
      return out;
    }
    // Place a settlement on the best free, spacing-legal vertex.
    for (const v of candidateSettlementVertices(state, graph)) out.push({ type: "placeSetupSettlement", vertex: v });
    return out;
  }

  // ── Main game, my turn ──────────────────────────────────────────────────
  if (state.phase === "mainGame") {
    if (!state.lastDiceRoll) return [{ type: "rollDice" }];

    // Rolled a 7 and the robber still needs moving (discards already handled).
    if (state.lastDiceRoll.total === 7 && !state.robberTileCoord) {
      // Score tiles by how many OPPONENT buildings they touch, none of mine.
      const scored = state.tiles
        .filter((t) => !t.hasClassicRobber)
        .map((t) => {
          let opp = 0;
          let mineTouch = 0;
          for (const b of state.buildings) {
            if (tilesTouchingVertex(graph, b.vertex).some((c) => axialKey(c) === axialKey(t.coord))) {
              if (b.ownerId === playerId) mineTouch++;
              else opp++;
            }
          }
          return { t, weight: opp * 2 - mineTouch * 3 };
        })
        .sort((a, b) => b.weight - a.weight);
      for (const s of scored) out.push({ type: "moveClassicRobber", coord: s.t.coord });
      return out;
    }

    const netVerts = myRoadVertexKeys(state, playerId);

    // City: upgrade the highest-value own settlement.
    if (canAfford(me, "city")) {
      const settlements = state.buildings
        .filter((b) => b.ownerId === playerId && b.type === "settlement")
        .sort((a, b) => vertexValue(state, graph, b.vertex) - vertexValue(state, graph, a.vertex));
      for (const b of settlements) out.push({ type: "buildCity", vertex: b.vertex });
    }

    // Settlement: best free, spacing-legal vertex that touches my road network.
    if (canAfford(me, "settlement")) {
      for (const v of candidateSettlementVertices(state, graph)) {
        if (netVerts.has(vertexKey(v))) out.push({ type: "buildSettlement", vertex: v });
      }
    }

    // Road: extend the network, preferring edges that reach toward a good
    // still-open vertex.
    if (canAfford(me, "road")) {
      const roadEdges = [...graph.edges.values()]
        .filter((e) => !state.roads.some((r) => edgeKey(r.edge) === edgeKey(e)))
        .filter((e) => netVerts.has(vertexKey(e.a)) || netVerts.has(vertexKey(e.b)))
        .sort((a, b) => {
          const va = Math.max(vertexValue(state, graph, a.a), vertexValue(state, graph, a.b));
          const vb = Math.max(vertexValue(state, graph, b.a), vertexValue(state, graph, b.b));
          return vb - va;
        });
      for (const e of roadEdges) out.push({ type: "buildRoad", edge: e });
    }

    // A dev card now and then, when flush.
    if (canAfford(me, "developmentCard")) out.push({ type: "buyDevelopmentCard" });

    // Nothing better to do → end the turn.
    out.push({ type: "endTurn" });
    return out;
  }

  return out;
}
