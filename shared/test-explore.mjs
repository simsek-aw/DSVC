// Engine tests for the two exploration tweaks: scouting and buried finds.
import {
  createLobby, addPlayer, startGame, applyAction, viewFor, handSize,
  TILE_SIZE, tileVertices, axialKey, axialNeighbors, buildBoardGraph, tilesTouchingVertex,
} from "./dist/index.js";

function assert(cond, msg) {
  if (!cond) { console.error("FAIL:", msg); process.exit(1); }
  console.log("  ok:", msg);
}

let s = createLobby("EXPL1");
s = addPlayer(s, "A", "Anna");
s = addPlayer(s, "B", "Ben");
s = startGame(s);
s = applyAction(s, "A", { type: "rollTurnOrder" });
s = applyAction(s, "B", { type: "rollTurnOrder" });

console.log("--- Karte trägt Funde ---");
const withTreasure = s.tiles.filter((t) => t.treasure);
console.log("  Felder mit Fund:", withTreasure.map((t) => t.treasure).join(", "));
assert(withTreasure.length >= 3, "mehrere Funde auf der Karte verteilt");
assert(withTreasure.every((t) => t.terrain !== "desert"), "keine Funde in der Wüste");

console.log("\n--- Sichtfilter: verdeckte Felder werden geschwärzt ---");
const annaView = viewFor(s, "A");
const hiddenInView = annaView.tiles.filter((t) => !t.revealed);
assert(hiddenInView.every((t) => t.terrain === "unknown"), "verdecktes Terrain kommt gar nicht erst beim Client an");
assert(hiddenInView.every((t) => t.numberToken === null), "verdeckte Zahlen ebenfalls nicht");
assert(hiddenInView.every((t) => t.treasure === null), "Funde bleiben geheim");
assert(annaView.tiles.length === s.tiles.length, "Feldanzahl bleibt gleich (nur Inhalt maskiert)");

console.log("\n--- Erkundung ---");
// Put Anna on the board next to a known tile.
const anchor = s.tiles.find((t) => t.terrain !== "desert");
const anchorVerts = tileVertices(anchor.coord, TILE_SIZE);
s = { ...s, phase: "mainGame", currentPlayerIndex: s.turnOrder.indexOf("A"),
      buildings: [{ vertex: anchorVerts[0], type: "settlement", ownerId: "A" }] };
// Anna's settlement touches every tile around that vertex — all of them count
// as "hers" for the adjacency rule, so the set has to come from the board graph
// rather than from the anchor tile alone (otherwise the far-tile check below
// picks a coordinate that is in fact adjacent, and fails at random).
const graph = buildBoardGraph(s.tiles, TILE_SIZE);
const myTiles = new Set(tilesTouchingVertex(graph, anchorVerts[0]).map(axialKey));
const targetCoord = s.tiles
  .map((t) => t.coord)
  .find((c) => !myTiles.has(axialKey(c)) && axialNeighbors(c).some((n) => myTiles.has(axialKey(n))));
assert(!!targetCoord, "ein benachbartes verdecktes Feld gefunden");

// Without wool it must fail.
s = { ...s, players: s.players.map((p) => (p.id === "A" ? { ...p, resources: { wood: 0, brick: 0, ore: 0, wheat: 0, sheep: 0 } } : p)) };
try {
  applyAction(s, "A", { type: "scoutTile", coord: targetCoord });
  console.error("FAIL: Spähen ohne Wolle erlaubt"); process.exit(1);
} catch (e) { console.log("  ok: ohne Wolle abgelehnt —", e.message); }

s = { ...s, players: s.players.map((p) => (p.id === "A" ? { ...p, resources: { wood: 0, brick: 0, ore: 0, wheat: 0, sheep: 2 } } : p)) };

// A far-away tile must be rejected.
const farCoord = s.tiles
  .map((t) => t.coord)
  .find((c) => !myTiles.has(axialKey(c)) && !axialNeighbors(c).some((n) => myTiles.has(axialKey(n))));
if (farCoord) {
  try {
    applyAction(s, "A", { type: "scoutTile", coord: farCoord });
    console.error("FAIL: entferntes Feld erlaubt"); process.exit(1);
  } catch (e) { console.log("  ok: entferntes Feld abgelehnt —", e.message); }
}

s = applyAction(s, "A", { type: "scoutTile", coord: targetCoord });
const scouted = s.tiles.find((t) => axialKey(t.coord) === axialKey(targetCoord));
assert(scouted.scoutedBy.includes("A"), "Feld ist für Anna als erkundet vermerkt");
assert(s.players.find((p) => p.id === "A").resources.sheep === 1, "1 Wolle bezahlt");
assert(!scouted.revealed, "Feld bleibt offiziell verdeckt");

console.log("\n--- Erkundung ist privat ---");
const aView = viewFor(s, "A");
const bView = viewFor(s, "B");
const aTile = aView.tiles.find((t) => axialKey(t.coord) === axialKey(targetCoord));
const bTile = bView.tiles.find((t) => axialKey(t.coord) === axialKey(targetCoord));
assert(aTile.terrain !== "unknown", `Anna sieht das Terrain (${aTile.terrain})`);
assert(bTile.terrain === "unknown", "Ben sieht weiterhin nichts");
assert(aTile.scoutedBy.includes("A"), "Anna weiß, dass sie es erkundet hat");
assert(bTile.scoutedBy.length === 0, "Ben erfährt nicht, wer erkundet hat");
console.log("  Log für alle:", s.log[s.log.length - 1]);
assert(!s.log[s.log.length - 1].includes(aTile.terrain), "Log verrät den Fund nicht");

try {
  applyAction(s, "A", { type: "scoutTile", coord: targetCoord });
  console.error("FAIL: doppelt erkundet"); process.exit(1);
} catch (e) { console.log("  ok: zweimal erkunden abgelehnt —", e.message); }

console.log("\n--- Fund beim Aufdecken einsammeln ---");
let s2 = createLobby("EXPL2");
s2 = addPlayer(s2, "A", "Anna");
s2 = addPlayer(s2, "B", "Ben");
s2 = startGame(s2);
s2 = applyAction(s2, "A", { type: "rollTurnOrder" });
s2 = applyAction(s2, "B", { type: "rollTurnOrder" });

const cacheTile = s2.tiles.find((t) => t.treasure === "cache");
const relicTile = s2.tiles.find((t) => t.treasure === "relic");
s2 = { ...s2, phase: "setup", setupRound: 1, currentPlayerIndex: 0, setupStepAwaitingRoad: false };
const who = s2.turnOrder[0];

// Pick a vertex the board graph agrees touches the tile — a raw tileVertices[0]
// can miss by a rounding hair and then reveal a neighbour instead of the tile.
const graph2 = buildBoardGraph(s2.tiles, TILE_SIZE);
const vertexTouching = (coord) => {
  for (const v of graph2.vertices.values()) {
    if (tilesTouchingVertex(graph2, v).some((c) => axialKey(c) === axialKey(coord))) return v;
  }
  return tileVertices(coord, TILE_SIZE)[0];
};

const cacheVert = vertexTouching(cacheTile.coord);
const before = s2.players.find((p) => p.id === who).resources[cacheTile.terrain];
s2 = applyAction(s2, who, { type: "placeSetupSettlement", vertex: cacheVert });
const after = s2.players.find((p) => p.id === who).resources[cacheTile.terrain];
console.log("  Log:", s2.log[s2.log.length - 1]);
assert(after >= before + 2, `Versteck bringt 2x ${cacheTile.terrain} (${before} -> ${after})`);
assert(s2.tiles.find((t) => axialKey(t.coord) === axialKey(cacheTile.coord)).treasure === null, "Fund ist verbraucht");

// Reveal the relic tile too (fresh state so placement rules don't collide).
// Force the relic tile back to its unrevealed, still-buried state — the cache
// sub-test above may have happened to sit next to it and already reveal it.
let s3 = {
  ...s2,
  buildings: [],
  setupStepAwaitingRoad: false,
  setupRound: 1,
  tiles: s2.tiles.map((t) => (axialKey(t.coord) === axialKey(relicTile.coord) ? { ...t, treasure: "relic", revealed: false } : t)),
};
const relicVert = vertexTouching(relicTile.coord);
const cardsBefore = s3.players.find((p) => p.id === who).developmentCards.length;
s3 = applyAction(s3, who, { type: "placeSetupSettlement", vertex: relicVert });
const cardsAfter = s3.players.find((p) => p.id === who).developmentCards.length;
console.log("  Log:", s3.log[s3.log.length - 1]);
assert(cardsAfter === cardsBefore + 1, "Relikt bringt eine Entwicklungskarte");

console.log("\nALLE EXPLORATIONS-TESTS BESTANDEN");
