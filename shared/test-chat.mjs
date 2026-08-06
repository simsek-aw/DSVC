// Chat rides in the log stream, so it has to be trimmed, attributed and capped.
import { createLobby, addPlayer, applyAction, CHAT_PREFIX, CHAT_MAX_LENGTH } from "./dist/index.js";

function assert(cond, msg) {
  if (!cond) { console.error("FAIL:", msg); process.exit(1); }
  console.log("  ok:", msg);
}

let s = createLobby("CHAT1");
s = addPlayer(s, "A", "Anna");
s = addPlayer(s, "B", "Ben");

s = applyAction(s, "A", { type: "sendChat", text: "  Wer hat Erz?  " });
assert(s.log[s.log.length - 1] === `${CHAT_PREFIX}Anna: Wer hat Erz?`, "Nachricht landet getrimmt und mit Namen im Log");

try {
  applyAction(s, "B", { type: "sendChat", text: "   " });
  console.error("FAIL: leere Nachricht erlaubt"); process.exit(1);
} catch (e) { console.log("  ok: leere Nachricht abgelehnt —", e.message); }

s = applyAction(s, "B", { type: "sendChat", text: "x".repeat(500) });
const last = s.log[s.log.length - 1];
assert(last.length <= CHAT_PREFIX.length + "Ben: ".length + CHAT_MAX_LENGTH, "zu lange Nachricht wird gekappt");

for (let i = 0; i < 400; i++) s = applyAction(s, "A", { type: "sendChat", text: `Nr ${i}` });
assert(s.log.length <= 200, `Log bleibt gedeckelt (${s.log.length} Einträge)`);
assert(s.log[s.log.length - 1] === `${CHAT_PREFIX}Anna: Nr 399`, "die neuesten Einträge bleiben stehen");

console.log("\nALLE CHAT-TESTS BESTANDEN");
