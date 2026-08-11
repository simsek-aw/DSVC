// The map generator must be deterministic per seed, so a group can rematch the
// exact same island — and startGame must record the seed it used.
import { generateMap, createLobby, addPlayer, startGame } from "./dist/index.js";

function assert(cond, msg) {
  if (!cond) { console.error("FAIL:", msg); process.exit(1); }
  console.log("  ok:", msg);
}

const a = generateMap({ playerCount: 4, seed: 12345 });
const b = generateMap({ playerCount: 4, seed: 12345 });
const c = generateMap({ playerCount: 4, seed: 99999 });

assert(a.seed === 12345, "der übergebene Seed wird zurückgegeben");
assert(JSON.stringify(a.tiles) === JSON.stringify(b.tiles), "gleicher Seed → identische Insel");
assert(JSON.stringify(a.tiles) !== JSON.stringify(c.tiles), "anderer Seed → andere Insel");

const r1 = generateMap({ playerCount: 4 });
assert(typeof r1.seed === "number" && r1.seed > 0, "ohne Seed wird ein zufälliger vergeben");

// Two seeded runs must not leak determinism into a later unseeded one.
const r2 = generateMap({ playerCount: 4 });
assert(r1.seed !== r2.seed, "aufeinanderfolgende Zufalls-Seeds unterscheiden sich");

// startGame with a fixed seed records it on the state and reproduces the board.
let s = createLobby("SEED1");
s = addPlayer(s, "A", "Anna");
s = addPlayer(s, "B", "Ben");
s = applySeed(s, 4242);
s = startGame(s);
assert(s.mapSeed === 4242, "startGame speichert den benutzten Seed auf dem State");

function applySeed(state, seed) {
  return { ...state, settings: { ...state.settings, mapSeed: seed } };
}

const direct = generateMap({ playerCount: 2, seed: 4242 });
assert(JSON.stringify(direct.tiles) === JSON.stringify(s.tiles), "startGame-Insel == direkt erzeugte Insel bei gleichem Seed");

console.log("\nALLE SEED-TESTS BESTANDEN");
