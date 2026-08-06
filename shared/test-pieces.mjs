// Building stock is finite: 5 settlements, 4 cities, 15 roads per player.
import { createLobby, addPlayer, startGame, applyAction, PIECE_LIMITS, buildBoardGraph, TILE_SIZE } from "./dist/index.js";

function assert(cond, msg) {
  if (!cond) { console.error("FAIL:", msg); process.exit(1); }
  console.log("  ok:", msg);
}

assert(PIECE_LIMITS.settlement === 5 && PIECE_LIMITS.city === 4 && PIECE_LIMITS.road === 15, "Limits exportiert");

let s = createLobby("PIECE1");
s = addPlayer(s, "A", "Anna");
s = addPlayer(s, "B", "Ben");
s = startGame(s);
s = applyAction(s, "A", { type: "rollTurnOrder" });
s = applyAction(s, "B", { type: "rollTurnOrder" });

// Force a state where Anna is on turn in mainGame with plenty of resources and
// already holds the max number of settlements, then try to build one more.
const rich = { wood: 99, brick: 99, ore: 99, wheat: 99, sheep: 99 };
const graph = buildBoardGraph(s.tiles, TILE_SIZE);
const verts = Array.from(graph.vertices.values());
const maxedBuildings = verts.slice(0, PIECE_LIMITS.settlement).map((v) => ({ vertex: v, type: "settlement", ownerId: "A" }));
s = {
  ...s,
  phase: "mainGame",
  currentPlayerIndex: s.turnOrder.indexOf("A"),
  players: s.players.map((p) => (p.id === "A" ? { ...p, resources: rich } : p)),
  buildings: maxedBuildings,
  // give Anna a road touching an empty vertex so only the piece cap can stop her
  roads: [{ edge: { a: verts[10], b: verts[11] }, ownerId: "A" }],
};

try {
  applyAction(s, "A", { type: "buildSettlement", vertex: verts[11] });
  console.error("FAIL: 6. Siedlung erlaubt"); process.exit(1);
} catch (e) { console.log("  ok: keine 6. Siedlung —", e.message); }

console.log("\nALLE BAUTEIL-TESTS BESTANDEN");
