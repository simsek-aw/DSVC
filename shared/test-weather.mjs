// Island events: drawn every 3 rounds, last exactly one round, and each effect
// touches only its one spot (production or the bank ratio).
import { createLobby, addPlayer, startGame, applyAction, bestBankRatio, EVENT_EVERY_ROUNDS } from "./dist/index.js";

function assert(cond, msg) {
  if (!cond) { console.error("FAIL:", msg); process.exit(1); }
  console.log("  ok:", msg);
}

let s = createLobby("W1");
s = addPlayer(s, "A", "Anna");
s = addPlayer(s, "B", "Ben");
s = startGame(s);
s = applyAction(s, "A", { type: "rollTurnOrder" });
s = applyAction(s, "B", { type: "rollTurnOrder" });
s = { ...s, phase: "mainGame", currentPlayerIndex: 0 };

// Play whole rounds by ending both players' turns; watch when weather turns on.
function endOneTurn(state) {
  const who = state.turnOrder[state.currentPlayerIndex];
  state = { ...state, lastDiceRoll: { die1: 1, die2: 2, total: 3 } };
  return applyAction(state, who, { type: "endTurn" });
}

let sawEvent = false;
for (let round = 1; round <= EVENT_EVERY_ROUNDS; round++) {
  s = endOneTurn(s); // player A
  s = endOneTurn(s); // player B -> wraps, roundCount = round
  assert(s.roundCount === round, `Runde ${round} gezählt`);
  if (round % EVENT_EVERY_ROUNDS === 0) {
    assert(s.weather !== null, `Ereignis in Runde ${round} gezogen (${s.weather.kind})`);
    sawEvent = true;
  } else {
    assert(s.weather === null, `kein Ereignis in Runde ${round}`);
  }
}
assert(sawEvent, "mindestens ein Ereignis gesehen");

// It lasts exactly one round: a full extra round later, it's gone.
s = endOneTurn(s);
s = endOneTurn(s);
assert(s.weather === null, "Ereignis nach einer Runde wieder vorbei");

// Bank ratio effects, checked directly.
const storm = { ...s, weather: { kind: "storm" }, buildings: [], roads: [] };
assert(bestBankRatio(storm, "A", "wood") === 4, "Sturm sperrt Häfen (4:1)");
const fair = { ...s, weather: { kind: "fair" }, buildings: [], roads: [] };
assert(bestBankRatio(fair, "A", "wood") === 3, "Fernhandel macht Bank 1 günstiger (4->3)");

console.log("\nALLE WETTER-TESTS BESTANDEN");
