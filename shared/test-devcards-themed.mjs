// Schatz- (treasureHunt) und Sturm-Karte (storm): instant-Karten ohne Ziel.
import { createLobby, addPlayer, startGame, applyAction, handSize } from "./dist/index.js";

function assert(cond, msg) {
  if (!cond) { console.error("FAIL:", msg); process.exit(1); }
  console.log("  ok:", msg);
}

function mainGameWith(cards) {
  let s = createLobby("DEV1");
  s = addPlayer(s, "A", "Anna");
  s = addPlayer(s, "B", "Ben");
  s = startGame(s);
  return {
    ...s,
    phase: "mainGame",
    turnOrder: ["A", "B"],
    currentPlayerIndex: 0,
    players: s.players.map((p) => (p.id === "A" ? { ...p, developmentCards: [...cards] } : p)),
  };
}

// Storm: sets the weather to a storm and consumes the card.
let s = mainGameWith(["storm"]);
s = applyAction(s, "A", { type: "playStorm" });
assert(s.weather?.kind === "storm", "Sturm-Karte setzt das Wetter auf Sturm");
assert(s.players.find((p) => p.id === "A").developmentCards.length === 0, "Sturm-Karte wird verbraucht");

// Treasure hunt: consumes the card and always changes something. Empty the dev
// deck so the relic branch can't re-add cards, keeping the consumption check
// unambiguous (outcome is then either a resource cache or an empty ruin).
for (let i = 0; i < 25; i++) {
  let g = mainGameWith(["treasureHunt"]);
  g = { ...g, developmentDeck: [] };
  const beforeHand = handSize(g.players.find((p) => p.id === "A"));
  const beforeLog = g.log.length;
  g = applyAction(g, "A", { type: "playTreasureHunt" });
  const a = g.players.find((p) => p.id === "A");
  assert(a.developmentCards.length === 0, "Schatzsuche verbraucht die Karte");
  const gainedRes = handSize(a) > beforeHand;
  const logged = g.log.length > beforeLog;
  if (!(gainedRes || logged)) {
    console.error("FAIL: Schatzsuche hatte keinen sichtbaren Effekt");
    process.exit(1);
  }
}
console.log("  ok: Schatzsuche verbraucht die Karte & hat stets einen Effekt (Rohstoffe/Log)");

// A player without the card can't play it.
let t = mainGameWith([]);
let threw = false;
try { applyAction(t, "A", { type: "playStorm" }); } catch { threw = true; }
assert(threw, "ohne Sturm-Karte wird das Ausspielen abgelehnt");

console.log("\nALLE THEMEN-KARTEN-TESTS BESTANDEN");
