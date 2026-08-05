import { vertexKey } from "./hexGrid";
import { Road } from "./types";

// Longest *trail* (edges not reused, vertices may repeat) among a player's roads.
// Road counts stay small all game, so exhaustive DFS backtracking is plenty fast.
export function longestRoadLength(roads: Road[], playerId: string): number {
  const playerRoads = roads.filter((r) => r.ownerId === playerId);
  if (playerRoads.length === 0) return 0;

  const adjacency = new Map<string, { to: string; edgeIndex: number }[]>();
  playerRoads.forEach((road, edgeIndex) => {
    const a = vertexKey(road.edge.a);
    const b = vertexKey(road.edge.b);
    adjacency.set(a, [...(adjacency.get(a) ?? []), { to: b, edgeIndex }]);
    adjacency.set(b, [...(adjacency.get(b) ?? []), { to: a, edgeIndex }]);
  });

  let best = 0;
  function dfs(vertex: string, visitedEdges: Set<number>, length: number) {
    best = Math.max(best, length);
    for (const { to, edgeIndex } of adjacency.get(vertex) ?? []) {
      if (visitedEdges.has(edgeIndex)) continue;
      visitedEdges.add(edgeIndex);
      dfs(to, visitedEdges, length + 1);
      visitedEdges.delete(edgeIndex);
    }
  }

  for (const vertex of adjacency.keys()) dfs(vertex, new Set(), 0);
  return best;
}
