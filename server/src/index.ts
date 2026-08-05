import cors from "cors";
import express from "express";
import http from "http";
import path from "path";
import { customAlphabet } from "nanoid";
import { Server } from "socket.io";
import { addPlayer, applyAction, createLobby, GameError, GameState, setPlayerConnected } from "@canos/shared";
import { getRoom, loadAllRoomsFromDisk, saveRoom } from "./roomStore";

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

io.on("connection", (socket) => {
  socket.on("createRoom", ({ playerName }: { playerName: string }) => {
    const roomId = generateRoomId();
    let state: GameState = createLobby(roomId);
    state = addPlayer(state, socket.id, playerName || "Spieler");
    saveRoom(state);
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
    try {
      const state = addPlayer(existing, socket.id, playerName || "Spieler");
      saveRoom(state);
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

  socket.on("action", ({ roomId, action }: { roomId: string; action: any }) => {
    const state = getRoom(roomId);
    if (!state) {
      socket.emit("errorMessage", "Raum nicht gefunden.");
      return;
    }
    const playerId = (socket as any).canosPlayerId ?? socket.id;
    try {
      const next = applyAction(state, playerId, action);
      saveRoom(next);
      broadcastState(roomId);
    } catch (err) {
      socket.emit("errorMessage", err instanceof GameError ? err.message : "Aktion ungültig.");
    }
  });

  socket.on("disconnect", () => {
    for (const roomId of socket.rooms) {
      const state = getRoom(roomId);
      if (!state) continue;
      const playerId = (socket as any).canosPlayerId ?? socket.id;
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
