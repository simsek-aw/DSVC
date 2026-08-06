import { useRef, useState } from "react";
import { GameState, ResourceType, RESOURCE_TYPES } from "@canos/shared";
import { ResourceSprite } from "./PixelIcons";

interface Props {
  state: GameState;
  myPlayerId: string;
  sendAction: (action: any) => void;
}

/** Forces players over the hand limit to pick which cards to throw away. */
export function DiscardPanel({ state, myPlayerId, sendAction }: Props) {
  const owed = state.pendingDiscards[myPlayerId] ?? 0;
  const [picked, setPicked] = useState<Partial<Record<ResourceType, number>>>({});
  const me = state.players.find((p) => p.id === myPlayerId);
  if (owed <= 0 || !me) return null;

  const pickedTotal = RESOURCE_TYPES.reduce((s, r) => s + (picked[r] ?? 0), 0);

  return (
    <div className="robber-overlay">
      <div className="robber-box">
        <h3>Zu viele Karten!</h3>
        <p className="hint">
          Wirf {owed} Karte{owed === 1 ? "" : "n"} ab — {pickedTotal}/{owed} gewählt.
        </p>
        <div className="discard-grid">
          {RESOURCE_TYPES.map((r) => {
            const have = me.resources[r];
            const chosen = picked[r] ?? 0;
            return (
              <div key={r} className="discard-cell">
                <span className="resource-icon">
                  <ResourceSprite resource={r} size={24} />
                </span>
                <span className="discard-count">
                  {have - chosen}
                  {chosen > 0 && <span className="discard-chosen"> −{chosen}</span>}
                </span>
                <div className="discard-buttons">
                  <button disabled={chosen <= 0} onClick={() => setPicked({ ...picked, [r]: chosen - 1 })}>
                    −
                  </button>
                  <button
                    disabled={chosen >= have || pickedTotal >= owed}
                    onClick={() => setPicked({ ...picked, [r]: chosen + 1 })}
                  >
                    +
                  </button>
                </div>
              </div>
            );
          })}
        </div>
        <button
          className="primary-button"
          disabled={pickedTotal !== owed}
          onClick={() => {
            sendAction({ type: "discardResources", resources: picked });
            setPicked({});
          }}
        >
          Abwerfen
        </button>
      </div>
    </div>
  );
}

/**
 * The steal: thief first picks a victim (when the robber's tile touches more
 * than one player), then draws blind from the victim's fanned-out hand — while
 * the victim can keep reshuffling until the moment the thief commits.
 */
export function StealPanel({ state, myPlayerId, sendAction }: Props) {
  const steal = state.pendingSteal;
  if (!steal) return null;

  const amThief = steal.thiefId === myPlayerId;
  const amVictim = steal.victimId === myPlayerId;
  const thief = state.players.find((p) => p.id === steal.thiefId);
  const victim = steal.victimId ? state.players.find((p) => p.id === steal.victimId) : null;

  if (!amThief && !amVictim) {
    return (
      <div className="robber-overlay passive">
        <div className="robber-box">
          <h3>🥷 {thief?.name} raubt …</h3>
          <p className="hint">{victim ? `${victim.name} wird bestohlen.` : "Ziel wird gewählt."}</p>
        </div>
      </div>
    );
  }

  // Thief still has to choose whom to rob.
  if (!steal.victimId) {
    if (!amThief) return null;
    return (
      <div className="robber-overlay">
        <div className="robber-box">
          <h3>Wen willst du bestehlen?</h3>
          <div className="victim-list">
            {steal.candidateIds.map((id) => {
              const p = state.players.find((pl) => pl.id === id);
              if (!p) return null;
              return (
                <button key={id} style={{ borderColor: p.color }} onClick={() => sendAction({ type: "chooseStealVictim", victimId: id })}>
                  <span className="player-dot" style={{ background: p.color }} />
                  {p.name}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  if (amVictim) return <VictimHand steal={steal} thiefName={thief?.name ?? ""} sendAction={sendAction} />;

  // The thief only ever sees backs — the contents never even reach this client.
  const count = steal.handCount;
  return (
    <div className="robber-overlay">
      <div className="robber-box">
        <h3>Zieh eine Karte von {victim?.name}</h3>
        <div className="steal-hand">
          {Array.from({ length: count }, (_, i) => (
            <button
              key={i}
              className="steal-card"
              style={{ transform: `rotate(${(i - (count - 1) / 2) * 7}deg)` }}
              onClick={() => sendAction({ type: "stealCard", index: i })}
            >
              ?
            </button>
          ))}
        </div>
        <p className="hint">Verdeckt — such dir eine aus. Achtung: dein Opfer sortiert vielleicht noch um.</p>
      </div>
    </div>
  );
}

/**
 * The victim's side of the steal. They see their own cards face up (they know
 * what they hold anyway) and can drag them into a new order or shuffle, right
 * up until the thief commits to a position.
 */
function VictimHand({
  steal,
  thiefName,
  sendAction,
}: {
  steal: NonNullable<GameState["pendingSteal"]>;
  thiefName: string;
  sendAction: (action: any) => void;
}) {
  const [drag, setDrag] = useState<{ from: number; over: number } | null>(null);
  const cardRefs = useRef<(HTMLDivElement | null)[]>([]);

  // While dragging, show the order the drop would produce.
  const order = steal.hand.map((card, i) => ({ card, i }));
  if (drag && drag.from !== drag.over) {
    const [moved] = order.splice(drag.from, 1);
    order.splice(drag.over, 0, moved);
  }

  const indexAt = (clientX: number): number | null => {
    for (let i = 0; i < cardRefs.current.length; i++) {
      const el = cardRefs.current[i];
      if (!el) continue;
      const r = el.getBoundingClientRect();
      if (clientX >= r.left && clientX <= r.right) return i;
    }
    return null;
  };

  return (
    <div className="robber-overlay">
      <div className="robber-box">
        <h3>{thiefName} greift nach deinen Karten!</h3>
        <div className="steal-hand victim">
          {order.map(({ card, i }, slot) => (
            <div
              key={i}
              ref={(el) => (cardRefs.current[slot] = el)}
              className={`steal-card face-up ${drag?.over === slot ? "dragging" : ""}`}
              style={{ transform: `rotate(${(slot - (order.length - 1) / 2) * 7}deg)` }}
              onPointerDown={(e) => {
                (e.target as Element).setPointerCapture?.(e.pointerId);
                setDrag({ from: slot, over: slot });
              }}
              onPointerMove={(e) => {
                if (!drag) return;
                const over = indexAt(e.clientX);
                if (over !== null && over !== drag.over) setDrag({ ...drag, over });
              }}
              onPointerUp={() => {
                if (drag && drag.from !== drag.over) {
                  sendAction({ type: "reorderStealHand", from: drag.from, to: drag.over });
                }
                setDrag(null);
              }}
              onPointerCancel={() => setDrag(null)}
            >
              <ResourceSprite resource={card} size={34} />
            </div>
          ))}
        </div>
        <button className="primary-button" onClick={() => sendAction({ type: "shuffleStealHand" })}>
          🔀 Schnell mischen!
        </button>
        <p className="hint">
          Nur du siehst deine Karten — {thiefName} sieht die Rückseiten. Karten verschieben oder mischen, solange noch nicht gezogen
          wurde.
        </p>
      </div>
    </div>
  );
}
