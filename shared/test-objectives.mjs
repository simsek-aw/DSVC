// Secret objectives: dealt only when the room enables them, hidden from
// opponents until the game ends, and worth extra victory points once fulfilled.
import {
  createLobby, addPlayer, startGame, applyAction, viewFor,
  totalVictoryPoints, objectiveComplete,
} from "./dist/index.js";

function assert(cond, msg) {
  if (!cond) { console.error("FAIL:", msg); process.exit(1); }
  console.log("  ok:", msg);
}

// --- Off by default: no objectives dealt. ---
{
  let s = createLobby("OBJ0");
  s = addPlayer(s, "A", "Anna");
  s = addPlayer(s, "B", "Ben");
  assert(s.settings.secretObjectives === false, "objectives default off");
  s = startGame(s);
  assert(s.players.every((p) => p.objective === null), "no objective dealt when disabled");
}

// --- Host toggle, then each player is dealt exactly one. ---
{
  let s = createLobby("OBJ1");
  s = addPlayer(s, "A", "Anna"); // host = first player
  s = addPlayer(s, "B", "Ben");
  s = addPlayer(s, "C", "Cara");
  // Non-host cannot change settings.
  let threw = false;
  try { applyAction(s, "B", { type: "setRoomSettings", settings: { secretObjectives: true } }); }
  catch { threw = true; }
  assert(threw, "non-host rejected from changing settings");
  s = applyAction(s, "A", { type: "setRoomSettings", settings: { secretObjectives: true } });
  assert(s.settings.secretObjectives === true, "host enabled objectives");
  s = startGame(s);
  assert(s.players.every((p) => p.objective !== null), "every player got an objective");

  // --- Masking: opponents' objectives are blanked mid-game, mine is visible. ---
  const viewA = viewFor(s, "A");
  const meA = viewA.players.find((p) => p.id === "A");
  const otherA = viewA.players.filter((p) => p.id !== "A");
  assert(meA.objective !== null, "I can see my own objective");
  assert(otherA.every((p) => p.objective === null), "opponents' objectives hidden mid-game");

  // --- At game end everything is revealed. ---
  const ended = { ...s, phase: "ended" };
  const viewEnd = viewFor(ended, "A");
  assert(viewEnd.players.every((p) => p.objective !== null), "objectives revealed at game end");
}

// --- Bonus counts toward the total once the condition holds. ---
{
  let s = createLobby("OBJ2");
  s = addPlayer(s, "A", "Anna");
  s = addPlayer(s, "B", "Ben");
  // Force a known objective + a board that fulfils it (3 cities → metropolis, +2).
  s = {
    ...s,
    players: s.players.map((p) => (p.id === "A" ? { ...p, objective: "metropolis", victoryPoints: 6 } : p)),
    buildings: [
      { vertex: "v1", type: "city", ownerId: "A" },
      { vertex: "v2", type: "city", ownerId: "A" },
      { vertex: "v3", type: "city", ownerId: "A" },
    ],
  };
  assert(objectiveComplete(s, "A") === true, "3 cities fulfils metropolis");
  assert(totalVictoryPoints(s, "A") === 8, "objective adds its +2 to the total");

  // Remove a city → objective incomplete, bonus gone.
  const s2 = { ...s, buildings: s.buildings.slice(0, 2) };
  assert(objectiveComplete(s2, "A") === false, "2 cities does not fulfil metropolis");
  assert(totalVictoryPoints(s2, "A") === 6, "incomplete objective adds nothing");
}

console.log("objectives: all passed");

// --- Special buildings: gated by the room toggle, one per player, no VP,
//     each with an effect (lighthouse = better bank rate). ---
import { SPECIAL_BUILDINGS, bestBankRatio } from "./dist/index.js";
{
  let s = createLobby("SB1");
  s = addPlayer(s, "A", "Anna");
  s = addPlayer(s, "B", "Ben");
  // disabled by default -> rejected
  let threw = false;
  try { applyAction(s, "A", { type: "buildSpecial", building: "lighthouse" }); } catch { threw = true; }
  assert(threw, "buildSpecial rejected when disabled");

  s = applyAction(s, "A", { type: "setRoomSettings", settings: { specialBuildings: true } });
  s = startGame(s);
  s = applyAction(s, "A", { type: "rollTurnOrder" });
  s = applyAction(s, "B", { type: "rollTurnOrder" });
  // force into mainGame with A on turn and plenty of resources
  s = { ...s, phase: "mainGame", currentPlayerIndex: 0, turnOrder: ["A", "B"],
    players: s.players.map((p) => (p.id === "A" ? { ...p, resources: { wood: 5, brick: 5, ore: 5, wheat: 5, sheep: 5 } } : p)) };

  const rateBefore = bestBankRatio(s, "A", "wood");
  const vpBefore = totalVictoryPoints(s, "A");
  s = applyAction(s, "A", { type: "buildSpecial", building: "lighthouse" });
  assert(s.players.find((p) => p.id === "A").specialBuildings.includes("lighthouse"), "lighthouse recorded");
  assert(totalVictoryPoints(s, "A") === vpBefore, "special building gives NO victory points");
  assert(bestBankRatio(s, "A", "wood") === Math.max(2, rateBefore - 1), "lighthouse improves bank rate by one step");
  const spentWood = 5 - s.players.find((p) => p.id === "A").resources.wood;
  assert(spentWood === (SPECIAL_BUILDINGS.lighthouse.cost.wood ?? 0), "lighthouse cost deducted");

  // limit 1: cannot build the other one afterwards
  let threw2 = false;
  try { applyAction(s, "A", { type: "buildSpecial", building: "watchtower" }); } catch { threw2 = true; }
  assert(threw2, "second special building rejected (limit 1)");
}

console.log("special buildings: all passed");
