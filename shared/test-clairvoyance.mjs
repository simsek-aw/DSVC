// The Späh-Karte (clairvoyance) publicly reveals a chosen hidden tile and hands
// any buried treasure to the player who played it.
import { createLobby, addPlayer, startGame, applyAction } from "./dist/index.js";

function assert(cond, msg) {
  if (!cond) { console.error("FAIL:", msg); process.exit(1); }
  console.log("  ok:", msg);
}

let s = createLobby("SEER1");
s = addPlayer(s, "A", "Anna");
s = addPlayer(s, "B", "Ben");
s = startGame(s);

// Drop straight into the main game with Anna to move, holding a Späh-Karte.
s = {
  ...s,
  phase: "mainGame",
  turnOrder: ["A", "B"],
  currentPlayerIndex: 0,
  players: s.players.map((p) => (p.id === "A" ? { ...p, developmentCards: ["clairvoyance"] } : p)),
};

const hidden = s.tiles.find((t) => !t.revealed);
assert(!!hidden, "es gibt ein verdecktes Feld zum Aufdecken");
// Bury a cache under it so we can check the treasure is claimed.
const cacheResource = hidden.terrain === "desert" ? "wheat" : hidden.terrain;
s = { ...s, tiles: s.tiles.map((t) => (t === hidden ? { ...t, treasure: "cache" } : t)) };
const before = s.players.find((p) => p.id === "A").resources[cacheResource];

s = applyAction(s, "A", { type: "playClairvoyance", coord: hidden.coord });

const after = s.players.find((p) => p.id === "A");
const revealedNow = s.tiles.find((t) => t.coord.q === hidden.coord.q && t.coord.r === hidden.coord.r);
assert(revealedNow.revealed, "das gewählte Feld ist jetzt aufgedeckt");
assert(after.developmentCards.length === 0, "die Späh-Karte wurde verbraucht");
assert(after.resources[cacheResource] === before + 2, "der Cache-Schatz (2 Rohstoffe) wurde eingesammelt");

// Playing it on an already-revealed tile is rejected.
let threw = false;
try {
  applyAction(s, "A", { type: "playClairvoyance", coord: hidden.coord });
} catch {
  threw = true;
}
assert(threw, "ein bereits aufgedecktes Feld wird abgelehnt");

console.log("\nALLE SPÄH-KARTEN-TESTS BESTANDEN");
