import {
  GameState,
  Player,
  totalVictoryPoints,
  objectiveComplete,
  SECRET_OBJECTIVES,
  handSize,
  longestRoadLength,
} from "@canos/shared";

interface Props {
  state: GameState;
  myPlayerId: string;
  sendAction: (action: any) => void;
  onLeave: () => void;
}

interface Award {
  icon: string;
  title: string;
  who: string;
  detail: string;
}

// End-of-game superlatives, all derived from the final board so they're exact
// and need no per-turn tracking. Each award goes to the single leader; ties and
// all-zero categories are skipped so the panel only shows real standouts.
function computeAwards(state: GameState): Award[] {
  const leader = (value: (p: Player) => number): { p: Player; v: number } | null => {
    let best: Player | null = null;
    let bestV = 0;
    let tie = false;
    for (const p of state.players) {
      const v = value(p);
      if (v > bestV) {
        bestV = v;
        best = p;
        tie = false;
      } else if (v === bestV && bestV > 0) {
        tie = true;
      }
    }
    return best && bestV > 0 && !tie ? { p: best, v: bestV } : null;
  };

  const specs: { icon: string; title: string; value: (p: Player) => number; unit: string }[] = [
    { icon: "🛣️", title: "Wegebauer", value: (p) => longestRoadLength(state.roads, p.id), unit: "Straßen am Stück" },
    { icon: "⚔️", title: "Kriegsherr", value: (p) => p.knightsPlayed, unit: "Ritter" },
    { icon: "🏙️", title: "Stadtplaner", value: (p) => state.buildings.filter((b) => b.ownerId === p.id && b.type === "city").length, unit: "Städte" },
    { icon: "🏗️", title: "Baulöwe", value: (p) => state.buildings.filter((b) => b.ownerId === p.id).length, unit: "Bauten" },
    { icon: "💰", title: "Hamsterer", value: (p) => handSize(p), unit: "Karten auf der Hand" },
    { icon: "🃏", title: "Kartenfuchs", value: (p) => p.developmentCards.length, unit: "Entwicklungskarten" },
  ];

  const awards: Award[] = [];
  for (const s of specs) {
    const top = leader(s.value);
    if (top) awards.push({ icon: s.icon, title: s.title, who: top.p.name, detail: `${top.v} ${s.unit}` });
  }
  return awards;
}

/**
 * End-of-game overlay: now that it's over, every player's points are revealed
 * and ranked. The host can restart with the same seats, everyone can leave.
 */
export function VictoryScreen({ state, myPlayerId, sendAction, onLeave }: Props) {
  const ranked = [...state.players]
    .map((p) => ({ p, vp: totalVictoryPoints(state, p.id) }))
    .sort((a, b) => b.vp - a.vp);
  const winner = state.players.find((p) => p.id === state.winnerId);
  const isHost = state.players[0]?.id === myPlayerId;
  const awards = computeAwards(state);

  return (
    <div className="victory-overlay">
      <div className="victory-box">
        <div className="victory-crown">🏆</div>
        <h2>{winner?.name ?? "Niemand"} gewinnt!</h2>
        <p className="hint">Endstand — jetzt zählen alle Punkte offen.</p>

        <ol className="victory-standings">
          {ranked.map(({ p, vp }, i) => (
            <li key={p.id} className={p.id === state.winnerId ? "winner" : ""} style={{ borderColor: p.color }}>
              <div className="victory-row">
                <span className="victory-rank">{i + 1}.</span>
                <span className="player-dot" style={{ background: p.color }} />
                <span className="victory-name">
                  {p.name}
                  {p.id === myPlayerId && " (du)"}
                </span>
                <span className="victory-badges">
                  {state.longestRoadPlayerId === p.id && <span title="Längste Straße">🛣️</span>}
                  {state.largestArmyPlayerId === p.id && <span title="Größte Rittermacht">⚔️</span>}
                </span>
                <span className="victory-vp">{vp}</span>
              </div>
              {p.objective && (
                <div className="victory-objective">
                  🎯 {SECRET_OBJECTIVES[p.objective].title}
                  {objectiveComplete(state, p.id) ? (
                    <span className="obj-done"> ✓ +{SECRET_OBJECTIVES[p.objective].bonus}</span>
                  ) : (
                    <span className="obj-miss"> — nicht erfüllt</span>
                  )}
                </div>
              )}
            </li>
          ))}
        </ol>

        {awards.length > 0 && (
          <div className="victory-awards">
            <p className="victory-awards-title">Auszeichnungen</p>
            <div className="award-grid">
              {awards.map((a) => (
                <div key={a.title} className="award-card" title={a.detail}>
                  <span className="award-icon">{a.icon}</span>
                  <span className="award-text">
                    <span className="award-title">{a.title}</span>
                    <span className="award-who">
                      {a.who} · {a.detail}
                    </span>
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="victory-actions">
          {isHost ? (
            <button className="primary-button" onClick={() => sendAction({ type: "restartGame" })}>
              🔄 Nochmal
            </button>
          ) : (
            <p className="hint">Warte auf ein neues Spiel vom Host …</p>
          )}
          <button className="secondary-button" onClick={onLeave}>
            Zur Lobby
          </button>
        </div>
      </div>
    </div>
  );
}
