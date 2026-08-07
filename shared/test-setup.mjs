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
// Deliberately KEEP treasures on the board: the starting-resource grant must
// match the adjacent tiles exactly regardless, because setup no longer fires
// treasures (that was the "wrong starting resources" bug).

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

const settlementVerts = {}; // player -> [v1, v2]
for (let step = 0; step < 4; step++) {
  const who = s.turnOrder[s.currentPlayerIndex];
  const v = freeVertex();
  s = applyAction(s, who, { type: "placeSetupSettlement", vertex: v });
  (settlementVerts[who] ??= []).push(v);
  s = applyAction(s, who, { type: "placeSetupRoad", edge: edgeAt(v) });
}

assert(s.phase === "mainGame", "Aufbau ist beendet, Hauptspiel läuft");

const tilesFor = (v) =>
  tilesTouchingVertex(g, v)
    .map((c) => s.tiles.find((t) => t.coord.q === c.q && t.coord.r === c.r))
    .filter((t) => t && t.terrain !== "desert")
    .reduce((sum, t) => sum + (t.hasBoostToken ? 2 : 1), 0);

for (const p of s.players) {
  // BOTH starting settlements pay out now, so the hand is the sum of both.
  const expected = settlementVerts[p.id].reduce((sum, v) => sum + tilesFor(v), 0);
  assert(handSize(p) === expected, `${p.name} bekommt exakt ${expected} Startrohstoffe (beide Siedlungen, hat ${handSize(p)})`);
}

// No treasure was collected during setup (no cache/curse/relic log lines).
const treasureLogs = s.log.filter((l) => /Versteck|Relikt|verfluchte Ruine/.test(l));
assert(treasureLogs.length === 0, "keine Schätze während des Aufbaus ausgelöst");

// Two gift lines per player now (one per settlement).
const gifts = s.log.filter((l) => l.startsWith("🎁"));
assert(gifts.length === s.players.length * 2, "jeder Spieler bekommt zwei Startrohstoff-Logzeilen (je Siedlung)");
console.log(gifts.join("\n"));

console.log("\nALLE SETUP-TESTS BESTANDEN");
