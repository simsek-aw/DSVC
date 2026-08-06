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
