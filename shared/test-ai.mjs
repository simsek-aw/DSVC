// Drives a full all-AI game with the same "try candidates in order" loop the
// server uses, to prove the bot never stalls and actually develops the board.
import { createLobby, addPlayer, startGame, applyAction, computeAiActions } from "./dist/index.js";

function assert(cond, msg) {
  if (!cond) { console.error("FAIL:", msg); process.exit(1); }
  console.log("  ok:", msg);
}

let s = createLobby("AIGAME");
s = addPlayer(s, "A", "Anna");
s = addPlayer(s, "B", "Ben");
s = addPlayer(s, "C", "Cara");
s = startGame(s);
// Make every seat a bot so the loop plays the whole game by itself.
s = { ...s, players: s.players.map((p) => ({ ...p, isAI: true })) };

let steps = 0;
let reachedMain = false;
let applied = true;
while (applied && s.phase !== "ended" && steps < 6000) {
  applied = false;
  for (const p of s.players) {
    for (const action of computeAiActions(s, p.id)) {
      try {
        s = applyAction(s, p.id, action);
        applied = true;
        break;
      } catch {
        // illegal guess → next candidate
      }
    }
    if (applied) break;
  }
  if (s.phase === "mainGame") reachedMain = true;
  steps++;
}

assert(reachedMain, "die KI führt das Spiel bis in die Hauptphase");
assert(steps < 6000, `die KI stallt nicht (in ${steps} Schritten fertig oder weit gekommen)`);

const totalBuildings = s.buildings.length;
assert(totalBuildings >= 6, `es wurde gebaut (mind. die 6 Startsiedlungen, tatsächlich ${totalBuildings})`);
const anyRoads = s.roads.length >= 6;
assert(anyRoads, `Straßen wurden gelegt (${s.roads.length})`);

// The loop must have TERMINATED because the game ended or hit the cap — never
// because the AI ran out of legal moves mid-game (that would be a stall).
assert(s.phase === "ended" || steps >= 6000 || applied === false ? s.phase === "ended" || applied : true, "kein Deadlock");

if (s.phase === "ended") {
  const winner = s.players.find((p) => p.id === s.winnerId);
  console.log(`  ok: ein Spiel wurde von der KI zu Ende gespielt — Sieger: ${winner?.name}`);
} else {
  console.log(`  ok: KI spielte ${steps} Schritte flüssig durch (Bauten: ${totalBuildings}, Straßen: ${s.roads.length})`);
}

console.log("\nALLE KI-TESTS BESTANDEN");
