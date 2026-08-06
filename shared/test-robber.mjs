// Direct engine test for the robber rules: discard-on-7 and the steal flow.
import {
  createLobby, addPlayer, startGame, applyAction, handSize, TILE_SIZE,
  buildBoardGraph, tilesTouchingVertex, vertexKey, tileVertices, viewFor,
} from "./dist/index.js";

function assert(cond, msg) {
  if (!cond) { console.error("FAIL:", msg); process.exit(1); }
  console.log("  ok:", msg);
}

let s = createLobby("TEST1");
s = addPlayer(s, "A", "Anna");
s = addPlayer(s, "B", "Ben");
s = addPlayer(s, "C", "Cara");
s = startGame(s);
s = applyAction(s, "A", { type: "rollTurnOrder" });
s = applyAction(s, "B", { type: "rollTurnOrder" });
s = applyAction(s, "C", { type: "rollTurnOrder" });
console.log("Turn order:", s.turnOrder.join(" → "));

// Give three players buildings around one shared tile so the robber has
// multiple candidates there.
const tile = s.tiles.find((t) => t.terrain !== "desert");
const verts = tileVertices(tile.coord, TILE_SIZE);
s = {
  ...s,
  phase: "mainGame",
  buildings: [
    { vertex: verts[0], type: "settlement", ownerId: "A" },
    { vertex: verts[2], type: "settlement", ownerId: "B" },
    { vertex: verts[4], type: "settlement", ownerId: "C" },
  ],
  currentPlayerIndex: s.turnOrder.indexOf("A"),
};

console.log("\n--- Discard on 7 ---");
// Anna 10 cards (discards 5), Ben 8 (discards 4), Cara 3 (safe).
s = { ...s, players: s.players.map((p) =>
  p.id === "A" ? { ...p, resources: { wood: 4, brick: 3, ore: 3, wheat: 0, sheep: 0 } } :
  p.id === "B" ? { ...p, resources: { wood: 2, brick: 2, ore: 2, wheat: 2, sheep: 0 } } :
                 { ...p, resources: { wood: 1, brick: 1, ore: 1, wheat: 0, sheep: 0 } }) };

// Force a 7 by rolling until we get one (engine rolls internally).
let attempts = 0;
let rolled = s;
do {
  rolled = applyAction({ ...s, lastDiceRoll: null }, "A", { type: "rollDice" });
  attempts++;
} while (rolled.lastDiceRoll.total !== 7 && attempts < 500);
assert(rolled.lastDiceRoll.total === 7, `rolled a 7 after ${attempts} tries`);
s = rolled;

console.log("  pendingDiscards:", s.pendingDiscards);
assert(s.pendingDiscards["A"] === 5, "Anna (10 cards) must discard 5");
assert(s.pendingDiscards["B"] === 4, "Ben (8 cards) must discard 4");
assert(s.pendingDiscards["C"] === undefined, "Cara (3 cards) must not discard");

// Robber must be blocked until discards are done.
try {
  applyAction(s, "A", { type: "moveClassicRobber", coord: tile.coord });
  console.error("FAIL: robber moved before discards");
  process.exit(1);
} catch (e) { console.log("  ok: robber blocked —", e.message); }

// Wrong count rejected.
try {
  applyAction(s, "A", { type: "discardResources", resources: { wood: 2 } });
  console.error("FAIL: accepted wrong discard count");
  process.exit(1);
} catch (e) { console.log("  ok: wrong count rejected —", e.message); }

s = applyAction(s, "A", { type: "discardResources", resources: { wood: 4, brick: 1 } });
s = applyAction(s, "B", { type: "discardResources", resources: { wood: 2, brick: 2 } });
assert(handSize(s.players.find((p) => p.id === "A")) === 5, "Anna down to 5 cards");
assert(handSize(s.players.find((p) => p.id === "B")) === 4, "Ben down to 4 cards");
assert(Object.keys(s.pendingDiscards).length === 0, "all discards settled");

console.log("\n--- Steal: victim choice ---");
s = applyAction(s, "A", { type: "moveClassicRobber", coord: tile.coord });
assert(!!s.pendingSteal, "steal started after robber moved");
console.log("  candidates:", s.pendingSteal.candidateIds);
assert(s.pendingSteal.candidateIds.length === 2, "both other players are candidates");
assert(!s.pendingSteal.candidateIds.includes("A"), "thief is not a candidate");
assert(s.pendingSteal.victimId === null, "victim not auto-chosen when several possible");

// Ending the turn must be blocked mid-steal.
try {
  applyAction(s, "A", { type: "endTurn" });
  console.error("FAIL: turn ended mid-steal");
  process.exit(1);
} catch (e) { console.log("  ok: endTurn blocked —", e.message); }

s = applyAction(s, "A", { type: "chooseStealVictim", victimId: "B" });
assert(s.pendingSteal.victimId === "B", "victim chosen");
assert(s.pendingSteal.hand.length === 4, "victim's hand has 4 face-down cards");

console.log("\n--- Steal: victim reshuffles, thief draws ---");
const before = s.pendingSteal.hand.join(",");
let shuffledDifferently = false;
for (let i = 0; i < 30 && !shuffledDifferently; i++) {
  s = applyAction(s, "B", { type: "shuffleStealHand" });
  if (s.pendingSteal.hand.join(",") !== before) shuffledDifferently = true;
}
assert(shuffledDifferently, "victim can reshuffle the hand order");

// Only the victim may shuffle; only the thief may draw.
try {
  applyAction(s, "C", { type: "shuffleStealHand" });
  console.error("FAIL: outsider shuffled"); process.exit(1);
} catch (e) { console.log("  ok: outsider cannot shuffle —", e.message); }
try {
  applyAction(s, "B", { type: "stealCard", index: 0 });
  console.error("FAIL: victim stole from themselves"); process.exit(1);
} catch (e) { console.log("  ok: only thief can draw —", e.message); }

const pickIdx = 2;
const expected = s.pendingSteal.hand[pickIdx];
const annaBefore = { ...s.players.find((p) => p.id === "A").resources };
const benBefore = { ...s.players.find((p) => p.id === "B").resources };
s = applyAction(s, "A", { type: "stealCard", index: pickIdx });
const annaAfter = s.players.find((p) => p.id === "A").resources;
const benAfter = s.players.find((p) => p.id === "B").resources;
console.log(`  drew position ${pickIdx} → ${expected}`);
assert(annaAfter[expected] === annaBefore[expected] + 1, `Anna gained the ${expected}`);
assert(benAfter[expected] === benBefore[expected] - 1, `Ben lost the ${expected}`);
assert(s.pendingSteal === null, "steal cleared");
assert(handSize(s.players.find((p) => p.id === "A")) === 6, "Anna now has 6 cards");

console.log("\n--- Single candidate skips the picker ---");
let s2 = { ...s, pendingSteal: null, buildings: [
  { vertex: verts[0], type: "settlement", ownerId: "A" },
  { vertex: verts[2], type: "settlement", ownerId: "B" },
]};
const other = s2.tiles.find((t) => t.terrain !== "desert" && t.coord !== tile.coord);
s2 = { ...s2, lastDiceRoll: { die1: 3, die2: 4, total: 7 }, robberTileCoord: null, pendingDiscards: {} };
s2 = applyAction(s2, "A", { type: "moveClassicRobber", coord: tile.coord });
assert(s2.pendingSteal?.victimId === "B", "sole candidate auto-selected");

console.log("\n--- Nobody adjacent: no steal ---");
let s3 = { ...s, pendingSteal: null, buildings: [{ vertex: verts[0], type: "settlement", ownerId: "A" }],
  lastDiceRoll: { die1: 3, die2: 4, total: 7 }, robberTileCoord: null, pendingDiscards: {} };
s3 = applyAction(s3, "A", { type: "moveClassicRobber", coord: tile.coord });
assert(s3.pendingSteal === null, "no steal when only the thief is adjacent");

console.log("\nALL ROBBER TESTS PASSED");

console.log("\n--- Opfer sortiert seine Hand um ---");
{
  // Reuse the last state that had an open steal, if the script kept one around.
  let t = createLobby("RB-REORDER");
  t = addPlayer(t, "A", "Anna");
  t = addPlayer(t, "B", "Ben");
  t = startGame(t);
  t = applyAction(t, "A", { type: "rollTurnOrder" });
  t = applyAction(t, "B", { type: "rollTurnOrder" });
  t = {
    ...t,
    pendingSteal: { thiefId: "B", candidateIds: ["A"], victimId: "A", hand: ["wood", "ore", "sheep"], handCount: 3 },
  };
  const moved = applyAction(t, "A", { type: "reorderStealHand", from: 0, to: 2 });
  assert(moved.pendingSteal.hand.join(",") === "ore,sheep,wood", "Karte wandert ans Ende");
  try {
    applyAction(t, "B", { type: "reorderStealHand", from: 0, to: 1 });
    console.error("FAIL: Dieb durfte sortieren"); process.exit(1);
  } catch (e) { console.log("  ok: Dieb darf nicht sortieren —", e.message); }

  const thiefView = viewFor(t, "B");
  assert(thiefView.pendingSteal.hand.length === 0, "Dieb bekommt den Handinhalt gar nicht erst");
  assert(thiefView.pendingSteal.handCount === 3, "Dieb sieht nur die Anzahl");
  const victimView = viewFor(t, "A");
  assert(victimView.pendingSteal.hand.length === 3, "Opfer sieht seine eigenen Karten");
}

console.log("\nALLE REORDER-TESTS BESTANDEN");
