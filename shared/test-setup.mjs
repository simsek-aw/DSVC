// After setup (2 settlements + 2 roads each) every player collects the classic
// Catan starting resources: one per tile around their SECOND settlement.
import {
  createLobby, addPlayer, startGame, applyAction, buildBoardGraph,
  tilesTouchingVertex, vertexKey, edgeKey, TILE_SIZE, handSize,
} from "./dist/index.js";

function assert(cond, msg) {
  if (!cond) { console.error("FAIL:", msg); process.exit(1); }
  console.log("  ok:", msg);
}

let s = createLobby("SETUP1");
s = addPlayer(s, "A", "Anna");
s = addPlayer(s, "B", "Ben");
s = startGame(s);
s = applyAction(s, "A", { type: "rollTurnOrder" });
s = applyAction(s, "B", { type: "rollTurnOrder" });
// Clear buried treasures so only the starting-resource rule adds to a hand.
s = { ...s, tiles: s.tiles.map((t) => ({ ...t, treasure: null })) };

const g = buildBoardGraph(s.tiles, TILE_SIZE);
const freeVertex = () => {
  for (const v of g.vertices.values()) {
    const vk = vertexKey(v);
    if (s.buildings.some((b) => vertexKey(b.vertex) === vk)) continue;
    const nb = g.vertexNeighbors.get(vk) || [];
    if (nb.some((n) => s.buildings.some((b) => vertexKey(b.vertex) === vertexKey(n)))) continue;
    if (tilesTouchingVertex(g, v).length < 2) continue;
    return v;
  }
  return null;
};
const edgeAt = (v) => {
  for (const e of g.edges.values()) {
    if ((vertexKey(e.a) === vertexKey(v) || vertexKey(e.b) === vertexKey(v)) && !s.roads.some((r) => edgeKey(r.edge) === edgeKey(e))) return e;
  }
  return null;
};

const secondSettlementVertex = {};
for (let step = 0; step < 4; step++) {
  const who = s.turnOrder[s.currentPlayerIndex];
  const round = s.setupRound;
  const v = freeVertex();
  s = applyAction(s, who, { type: "placeSetupSettlement", vertex: v });
  if (round === 2) secondSettlementVertex[who] = v;
  s = applyAction(s, who, { type: "placeSetupRoad", edge: edgeAt(v) });
}

assert(s.phase === "mainGame", "Aufbau ist beendet, Hauptspiel läuft");

for (const p of s.players) {
  const v = secondSettlementVertex[p.id];
  const expected = tilesTouchingVertex(g, v)
    .map((c) => s.tiles.find((t) => t.coord.q === c.q && t.coord.r === c.r))
    .filter((t) => t && t.terrain !== "desert").length;
  assert(handSize(p) === expected, `${p.name} bekommt ${expected} Startrohstoffe (hat ${handSize(p)})`);
}

const gifts = s.log.filter((l) => l.startsWith("🎁"));
assert(gifts.length === s.players.length, "jeder Spieler bekommt eine Startrohstoff-Logzeile");
console.log(gifts.join("\n"));

console.log("\nALLE SETUP-TESTS BESTANDEN");
