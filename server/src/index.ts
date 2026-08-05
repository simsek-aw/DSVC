import cors from "cors";
import express from "express";
import http from "http";
import path from "path";
import { customAlphabet } from "nanoid";
import { Server } from "socket.io";
import { addPlayer, applyAction, createLobby, GameError, GameState, removePlayer, setPlayerConnected } from "@canos/shared";
import { deleteRoom, getRoom, loadAllRoomsFromDisk, saveRoom } from "./roomStore";

const PORT = process.env.PORT ? Number(process.env.PORT) : 4000;

const app = express();
app.use(cors());
app.get("/health", (_req, res) => res.json({ ok: true }));

const httpServer = http.createServer(app);
const io = new Server(httpServer, { cors: { origin: "*" } });

// Serve the built client so a single deployed service handles both the
// Socket.IO API and the static frontend (no separate hosting needed).
const clientDistPath = path.join(__dirname, "..", "..", "client", "dist");
app.use(express.static(clientDistPath));
app.get("*", (_req, res) => {
  res.sendFile(path.join(clientDistPath, "index.html"));
});

loadAllRoomsFromDisk();

const ROOM_ID_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const generateRoomId = customAlphabet(ROOM_ID_ALPHABET, 5);

function broadcastState(roomId: string) {
  const state = getRoom(roomId);
  if (state) io.to(roomId).emit("state", state);
}

function sameName(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

io.on("connection", (socket) => {
  socket.on("createRoom", ({ playerName }: { playerName: string }) => {
    const roomId = generateRoomId();
    let state: GameState = createLobby(roomId);
    state = addPlayer(state, socket.id, playerName || "Spieler");
    saveRoom(state);
    // Tag this socket connection with its player id explicitly rather than
    // relying on socket.id staying valid — after any reconnect socket.id
    // changes, and "rejoin" is what re-establishes this tag on the new socket.
    (socket as any).canosPlayerId = socket.id;
    socket.join(roomId);
    socket.emit("joined", { roomId, playerId: socket.id });
    broadcastState(roomId);
  });

  socket.on("joinRoom", ({ roomId, playerName }: { roomId: string; playerName: string }) => {
    const existing = getRoom(roomId);
    if (!existing) {
      socket.emit("errorMessage", "Raum nicht gefunden.");
      return;
    }
    const name = playerName || "Spieler";

    // A disconnected player with the same name reclaims their existing seat
    // instead of getting a brand new one — this is what lets someone type the
    // room code to get back in after leaving or losing their session, even
    // once the game has already started (when a fresh addPlayer is blocked).
    const reclaimable = existing.players.find((p) => !p.connected && sameName(p.name, name));
    if (reclaimable) {
      (socket as any).canosPlayerId = reclaimable.id;
      socket.join(roomId);
      const state = setPlayerConnected(existing, reclaimable.id, true);
      saveRoom(state);
      socket.emit("joined", { roomId, playerId: reclaimable.id });
      broadcastState(roomId);
      return;
    }

    try {
      const state = addPlayer(existing, socket.id, name);
      saveRoom(state);
      (socket as any).canosPlayerId = socket.id;
      socket.join(roomId);
      socket.emit("joined", { roomId, playerId: socket.id });
      broadcastState(roomId);
    } catch (err) {
      socket.emit("errorMessage", err instanceof GameError ? err.message : "Beitritt fehlgeschlagen.");
    }
  });

  socket.on("rejoin", ({ roomId, playerId }: { roomId: string; playerId: string }) => {
    const existing = getRoom(roomId);
    if (!existing || !existing.players.some((p) => p.id === playerId)) {
      socket.emit("errorMessage", "Sitzung nicht mehr gültig, bitte neu beitreten.");
      return;
    }
    // Re-tag this socket with the persisted player id so game actions keep working.
    (socket as any).canosPlayerId = playerId;
    socket.join(roomId);
    const state = setPlayerConnected(existing, playerId, true);
    saveRoom(state);
    socket.emit("joined", { roomId, playerId });
    broadcastState(roomId);
  });

  socket.on("leaveRoom", ({ roomId }: { roomId: string }) => {
    const state = getRoom(roomId);
    const playerId = (socket as any).canosPlayerId;
    if (!state || !playerId) return;
    socket.leave(roomId);
    try {
      const next = removePlayer(state, playerId);
      if (next.players.length === 0) {
        deleteRoom(roomId);
      } else {
        saveRoom(next);
        broadcastState(roomId);
      }
    } catch {
      // Game already started — the player's seat has to stay (turn order/setup
      // depend on it), so just mark them disconnected instead of removing them.
      // They can reclaim the seat later by joining with the same name.
      const next = setPlayerConnected(state, playerId, false);
      saveRoom(next);
      broadcastState(roomId);
    }
  });

  socket.on("action", ({ roomId, action }: { roomId: string; action: any }) => {
    const state = getRoom(roomId);
    if (!state) {
      socket.emit("errorMessage", "Raum nicht gefunden.");
      return;
    }
    const playerId = (socket as any).canosPlayerId;
    if (!playerId) {
      // Reconnect handshake ("rejoin") hasn't completed on this socket yet —
      // silently falling back to socket.id here used to misattribute actions
      // to a brand new, nonexistent player after any reconnect.
      socket.emit("errorMessage", "Verbindung wird noch hergestellt, bitte kurz warten und erneut versuchen.");
      return;
    }
    try {
      const next = applyAction(state, playerId, action);
      saveRoom(next);
      broadcastState(roomId);
    } catch (err) {
      socket.emit("errorMessage", err instanceof GameError ? err.message : "Aktion ungültig.");
    }
  });

  socket.on("disconnect", () => {
    const playerId = (socket as any).canosPlayerId;
    if (!playerId) return;
    for (const roomId of socket.rooms) {
      const state = getRoom(roomId);
      if (!state) continue;
      if (state.players.some((p) => p.id === playerId)) {
        const next = setPlayerConnected(state, playerId, false);
        saveRoom(next);
        broadcastState(roomId);
      }
    }
  });
});

httpServer.listen(PORT, () => {
  console.log(`Canos Incognita server listening on :${PORT}`);
});
