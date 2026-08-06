import { useState } from "react";
import { socket } from "../socket";
import { EngravedTitle } from "./EngravedTitle";
import { WaterBackdrop } from "./Water";
import { roomFromUrl } from "../invite";

export function Lobby() {
  const invitedRoom = roomFromUrl();
  const [name, setName] = useState("");
  const [roomId, setRoomId] = useState(invitedRoom);
  const invited = invitedRoom.length > 0;

  const join = () => {
    socket.emit("joinRoom", { roomId: roomId.trim(), playerName: name.trim() });
    // Drop the ?room= param so leaving later doesn't drag us back into the invite.
    if (invited) window.history.replaceState({}, "", window.location.pathname);
  };

  return (
    <div className="lobby-screen">
      <WaterBackdrop />
      <EngravedTitle top="Canos" main="INCOGNITA" />
      <p className="subtitle">Ein verdecktes Inselabenteuer für 2–6 Spieler</p>

      {/* Opened from an invite link: lead straight into joining that room. */}
      {invited && (
        <>
          <p className="invite-note">
            Du wurdest zu Raum <span className="room-code">{invitedRoom}</span> eingeladen — gib deinen Namen ein und tritt bei.
          </p>
          <input
            className="text-input"
            placeholder="Dein Name"
            value={name}
            autoFocus
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && name.trim() && join()}
            maxLength={20}
          />
          <button className="primary-button" disabled={!name.trim()} onClick={join}>
            Raum {invitedRoom} beitreten
          </button>
          <div className="divider">oder neu starten</div>
        </>
      )}

      {!invited && (
        <input
          className="text-input"
          placeholder="Dein Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={20}
        />
      )}

      <button
        className="primary-button"
        disabled={!name.trim()}
        onClick={() => socket.emit("createRoom", { playerName: name.trim() })}
      >
        Neuen Raum erstellen
      </button>

      <div className="divider">oder</div>

      <input
        className="text-input"
        placeholder="Raum-Code"
        value={roomId}
        onChange={(e) => setRoomId(e.target.value.toUpperCase())}
        maxLength={8}
      />
      <button
        className="secondary-button"
        disabled={!name.trim() || !roomId.trim()}
        onClick={join}
      >
        Raum beitreten
      </button>

      <div className="divider">oder</div>

      <button
        className="demo-button"
        onClick={() => socket.emit("createDemoRoom", { playerNames: ["Rot", "Grün", "Orange"] })}
      >
        🎮 Demo starten (allein testen)
      </button>
      <p className="hint">
        Im Demo-Modus steuerst du alle drei Spieler von diesem Gerät — praktisch, um das Spiel ohne
        Mitspieler auszuprobieren.
      </p>
    </div>
  );
}
