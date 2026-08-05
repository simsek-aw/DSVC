import { GameState, ResourceType, RESOURCE_TYPES } from "@canos/shared";

const RESOURCE_ICONS: Record<ResourceType, string> = {
  wood: "🪵",
  brick: "🧱",
  ore: "⛏️",
  wheat: "🌾",
  sheep: "🐑",
};

interface Props {
  state: GameState;
  myPlayerId: string;
  sendAction: (action: any) => void;
}

export function NegotiationTable({ state, myPlayerId, sendAction }: Props) {
  const negotiation = state.negotiation;
  if (!negotiation) return null;

  const amInitiator = negotiation.initiatorId === myPlayerId;
  const amPartner = negotiation.partnerId === myPlayerId;
  if (!amInitiator && !amPartner) return null; // spectators don't see the table

  const initiator = state.players.find((p) => p.id === negotiation.initiatorId);
  const partner = state.players.find((p) => p.id === negotiation.partnerId);
  const otherId = amInitiator ? negotiation.partnerId : negotiation.initiatorId;
  const other = amInitiator ? partner : initiator;
  const me = state.players.find((p) => p.id === myPlayerId);

  if (negotiation.status === "pending") {
    // The invited player decides; the initiator just waits.
    if (amPartner) {
      return (
        <div className="negotiation-overlay">
          <div className="negotiation-box invite">
            <h3>{initiator?.name} möchte mit dir handeln</h3>
            <div className="inline-picker">
              <button className="primary-button" onClick={() => sendAction({ type: "respondNegotiation", accept: true })}>
                Tisch öffnen
              </button>
              <button onClick={() => sendAction({ type: "respondNegotiation", accept: false })}>Ablehnen</button>
            </div>
          </div>
        </div>
      );
    }
    return (
      <div className="negotiation-overlay">
        <div className="negotiation-box invite">
          <h3>Warte auf {partner?.name} …</h3>
          <button onClick={() => sendAction({ type: "cancelNegotiation" })}>Abbrechen</button>
        </div>
      </div>
    );
  }

  const myOffer = negotiation.offers[myPlayerId] ?? {};
  const theirOffer = negotiation.offers[otherId] ?? {};
  const iConfirmed = !!negotiation.confirmed[myPlayerId];
  const theyConfirmed = !!negotiation.confirmed[otherId];
  const tableEmpty =
    RESOURCE_TYPES.every((r) => !(myOffer[r] ?? 0)) && RESOURCE_TYPES.every((r) => !(theirOffer[r] ?? 0));

  return (
    <div className="negotiation-overlay">
      <div className="negotiation-box">
        <div className="negotiation-header">
          <span>Verhandlung mit {other?.name}</span>
          <button className="small" onClick={() => sendAction({ type: "cancelNegotiation" })}>
            ✕
          </button>
        </div>

        <div className={`table-side ${theyConfirmed ? "confirmed" : ""}`}>
          <span className="table-side-label">
            {other?.name} bietet {theyConfirmed ? "✅" : ""}
          </span>
          <div className="table-slots">
            {RESOURCE_TYPES.filter((r) => (theirOffer[r] ?? 0) > 0).map((r) => (
              <span key={r} className="table-slot">
                {RESOURCE_ICONS[r]} {theirOffer[r]}
              </span>
            ))}
            {RESOURCE_TYPES.every((r) => !(theirOffer[r] ?? 0)) && <span className="table-empty">— noch nichts —</span>}
          </div>
        </div>

        <div className={`table-side mine ${iConfirmed ? "confirmed" : ""}`}>
          <span className="table-side-label">Du bietest {iConfirmed ? "✅" : ""}</span>
          <div className="table-slots">
            {RESOURCE_TYPES.filter((r) => (myOffer[r] ?? 0) > 0).map((r) => (
              <button
                key={r}
                className="table-slot removable"
                title="Zurücknehmen"
                onClick={() => sendAction({ type: "changeNegotiationOffer", resource: r, delta: -1 })}
              >
                {RESOURCE_ICONS[r]} {myOffer[r]} ✕
              </button>
            ))}
            {RESOURCE_TYPES.every((r) => !(myOffer[r] ?? 0)) && <span className="table-empty">— noch nichts —</span>}
          </div>
        </div>

        <div className="negotiation-hand">
          <span className="table-side-label">Antippen, um auf den Tisch zu legen</span>
          <div className="negotiation-hand-row">
            {RESOURCE_TYPES.map((r) => {
              const available = (me?.resources[r] ?? 0) - (myOffer[r] ?? 0);
              return (
                <button
                  key={r}
                  disabled={available <= 0}
                  onClick={() => sendAction({ type: "changeNegotiationOffer", resource: r, delta: 1 })}
                >
                  <span className="resource-icon">{RESOURCE_ICONS[r]}</span>
                  <span className="resource-count">{available}</span>
                </button>
              );
            })}
          </div>
        </div>

        <button
          className={`primary-button ${iConfirmed ? "toggle-active" : ""}`}
          disabled={tableEmpty}
          onClick={() => sendAction({ type: "setNegotiationConfirmed", confirmed: !iConfirmed })}
        >
          {iConfirmed ? "Zustimmung zurückziehen" : "Deal bestätigen"}
        </button>
        <p className="hint">
          {theyConfirmed ? `${other?.name} hat bestätigt.` : `Warte auf ${other?.name}.`} Jede Änderung am Tisch setzt
          beide Bestätigungen zurück.
        </p>
      </div>
    </div>
  );
}
