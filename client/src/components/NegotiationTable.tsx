import { useState } from "react";
import { GameState, ResourceType, RESOURCE_TYPES, CHAT_PREFIX, CHAT_MAX_LENGTH } from "@canos/shared";
import { ResourceSprite } from "./PixelIcons";

interface Props {
  state: GameState;
  myPlayerId: string;
  sendAction: (action: any) => void;
}

export function NegotiationTable({ state, myPlayerId, sendAction }: Props) {
  const [chatDraft, setChatDraft] = useState("");
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
                <ResourceSprite resource={r} size={18} /> {theirOffer[r]}
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
                <ResourceSprite resource={r} size={18} /> {myOffer[r]} ✕
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
                  <span className="resource-icon">
                    <ResourceSprite resource={r} size={24} />
                  </span>
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

        {/* Chat right at the table, so you can haggle without leaving it. */}
        <div className="negotiation-chat">
          <div className="negotiation-chat-log">
            {state.log
              .filter((l) => l.startsWith(CHAT_PREFIX))
              .slice(-4)
              .map((l, i) => (
                <div key={i} className="log-line chat">{l}</div>
              ))}
          </div>
          <form
            className="chat-row"
            onSubmit={(e) => {
              e.preventDefault();
              const text = chatDraft.trim();
              if (!text) return;
              sendAction({ type: "sendChat", text });
              setChatDraft("");
            }}
          >
            <input
              className="chat-input"
              placeholder="Zum Aushandeln schreiben …"
              value={chatDraft}
              maxLength={CHAT_MAX_LENGTH}
              onChange={(e) => setChatDraft(e.target.value)}
            />
            <button className="chat-send" type="submit" disabled={!chatDraft.trim()} aria-label="Senden">
              ➤
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
