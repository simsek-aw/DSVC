import { GameState, totalVictoryPoints, objectiveComplete, SECRET_OBJECTIVES } from "@canos/shared";

interface Props {
  state: GameState;
  myPlayerId: string;
  sendAction: (action: any) => void;
  onLeave: () => void;
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
