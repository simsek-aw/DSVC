import { useState } from "react";
import { socket } from "../socket";

export function Lobby() {
  const [name, setName] = useState("");
  const [roomId, setRoomId] = useState("");

  return (
    <div className="lobby-screen">
      <h1>Canos Incognita</h1>
      <p className="subtitle">Ein verdecktes Inselabenteuer für 2–6 Spieler</p>

      <input
        className="text-input"
        placeholder="Dein Name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        maxLength={20}
      />

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
        onClick={() => socket.emit("joinRoom", { roomId: roomId.trim(), playerName: name.trim() })}
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
