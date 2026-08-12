import cors from "cors";
import express from "express";
import http from "http";
import path from "path";
import { customAlphabet } from "nanoid";
import { Server } from "socket.io";
import {
  addPlayer,
  applyAction,
  computeAiActions,
  createDemoLobby,
  createLobby,
  GameError,
  GameState,
  removePlayer,
  setPlayerConnected,
  viewFor,
} from "@canos/shared";
import { deleteRoom, getRoom, loadAllRoomsFromDisk, saveRoom, sweepStaleRooms } from "./roomStore";

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

// Clean up long-dead rooms on boot and hourly thereafter (default TTL: 48h).
const ROOM_TTL_MS = Number(process.env.ROOM_TTL_MS ?? 48 * 60 * 60 * 1000);
sweepStaleRooms(ROOM_TTL_MS);
setInterval(() => {
  const removed = sweepStaleRooms(ROOM_TTL_MS);
  if (removed) console.log(`Room cleanup: removed ${removed} stale room(s).`);
}, 60 * 60 * 1000).unref();

const ROOM_ID_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const generateRoomId = customAlphabet(ROOM_ID_ALPHABET, 5);

// Every player gets their own view: tiles they have not uncovered or scouted
// are blanked out server-side, so the hidden map never reaches their client.
function broadcastState(roomId: string) {
  const state = getRoom(roomId);
  if (!state) return;
  const members = io.sockets.adapter.rooms.get(roomId);
  if (!members) return;
  for (const socketId of members) {
    const member = io.sockets.sockets.get(socketId);
    if (!member) continue;
    const pid = (member as any).canosPlayerId as string | undefined;
    member.emit("state", pid ? viewFor(state, pid) : state);
  }
}

function sameName(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

// ── Solo-KI: drive any AI seats forward on the server ─────────────────────
// One room is "driven" at a time; each accepted AI action broadcasts and
// schedules the next, with a short pause so a human can watch it play.
const AI_STEP_MS = 650;
const AI_MAX_STEPS = 300; // safety cap for a single continuous drive chain
const aiDriving = new Set<string>();

function stepAi(roomId: string, steps: number): void {
  const state = getRoom(roomId);
  if (!state || state.phase === "ended" || steps > AI_MAX_STEPS) {
    aiDriving.delete(roomId);
    return;
  }
  for (const p of state.players) {
    if (!p.isAI) continue;
    for (const action of computeAiActions(state, p.id)) {
      try {
        const next = applyAction(state, p.id, action as any);
        saveRoom(next);
        broadcastState(roomId);
        setTimeout(() => stepAi(roomId, steps + 1), AI_STEP_MS);
        return;
      } catch {
        // Illegal guess — fall through to the bot's next candidate action.
      }
    }
  }
  aiDriving.delete(roomId); // no AI had anything to do → done for now
}

function driveAi(roomId: string): void {
  if (aiDriving.has(roomId)) return;
  const state = getRoom(roomId);
  if (!state || state.phase === "ended" || !state.players.some((p) => p.isAI)) return;
  aiDriving.add(roomId);
  setTimeout(() => stepAi(roomId, 0), AI_STEP_MS);
}

// Simple per-socket sliding-window rate limit, so a buggy or hostile client
// can't flood the room with actions (each one triggers a persist + broadcast).
const RATE_WINDOW_MS = 2000;
const RATE_MAX = 25;
const actionTimes = new Map<string, number[]>();
function rateLimited(socketId: string): boolean {
  const now = Date.now();
  const recent = (actionTimes.get(socketId) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
  recent.push(now);
  actionTimes.set(socketId, recent);
  return recent.length > RATE_MAX;
}

// Shape check before the pure engine ever sees the payload: it must be a plain
// object carrying a string `type`. Blocks malformed/oversized junk early.
function isValidAction(action: unknown): action is { type: string } {
  if (typeof action !== "object" || action === null || Array.isArray(action)) return false;
  const type = (action as Record<string, unknown>).type;
  return typeof type === "string" && type.length > 0 && type.length <= 64;
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

  socket.on("createDemoRoom", ({ playerNames }: { playerNames?: string[] }) => {
    const names = playerNames?.length ? playerNames.slice(0, 6) : ["Spieler 1", "Spieler 2", "Spieler 3"];
    const roomId = generateRoomId();
    const state = createDemoLobby(roomId, names);
    saveRoom(state);
    (socket as any).canosPlayerId = state.players[0].id;
    socket.join(roomId);
    socket.emit("joined", { roomId, playerId: state.players[0].id });
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

  socket.on("action", ({ roomId, action, asPlayerId }: { roomId: string; action: any; asPlayerId?: string }) => {
    if (typeof roomId !== "string" || !roomId) {
      socket.emit("errorMessage", "Ungültige Anfrage.");
      return;
    }
    if (!isValidAction(action)) {
      socket.emit("errorMessage", "Ungültige Aktion.");
      return;
    }
    if (rateLimited(socket.id)) {
      socket.emit("errorMessage", "Zu viele Aktionen — bitte kurz durchatmen.");
      return;
    }
    const state = getRoom(roomId);
    if (!state) {
      socket.emit("errorMessage", "Raum nicht gefunden.");
      return;
    }
    // Demo rooms are single-device sandboxes, so this one connection is
    // allowed to act for any seat in them. Everywhere else the socket's own
    // confirmed identity is the only thing that counts.
    const playerId =
      state.demoMode && asPlayerId && state.players.some((p) => p.id === asPlayerId)
        ? asPlayerId
        : (socket as any).canosPlayerId;
    if (!playerId) {
      // Reconnect handshake ("rejoin") hasn't completed on this socket yet —
      // silently falling back to socket.id here used to misattribute actions
      // to a brand new, nonexistent player after any reconnect.
      socket.emit("errorMessage", "Verbindung wird noch hergestellt, bitte kurz warten und erneut versuchen.");
      return;
    }
    try {
      const next = applyAction(state, playerId, action as any);
      saveRoom(next);
      broadcastState(roomId);
      driveAi(roomId); // let any AI seats take their turn(s) next
    } catch (err) {
      socket.emit("errorMessage", err instanceof GameError ? err.message : "Aktion ungültig.");
    }
  });

  socket.on("disconnect", () => {
    actionTimes.delete(socket.id);
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
