import fs from "fs";
import path from "path";
import { GameState } from "@canos/shared";

// Overridable so a deployment can point this at a mounted persistent volume
// (e.g. Fly.io) instead of the container's ephemeral local disk.
const DATA_DIR = process.env.ROOM_DATA_DIR ?? path.join(__dirname, "..", "data", "rooms");

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const rooms = new Map<string, GameState>();

function filePathFor(roomId: string): string {
  return path.join(DATA_DIR, `${roomId}.json`);
}

export function loadAllRoomsFromDisk(): void {
  for (const file of fs.readdirSync(DATA_DIR)) {
    if (!file.endsWith(".json")) continue;
    try {
      const raw = fs.readFileSync(path.join(DATA_DIR, file), "utf-8");
      const state: GameState = JSON.parse(raw);
      rooms.set(state.roomId, state);
    } catch {
      // Skip corrupted room files rather than crashing the server.
    }
  }
}

export function getRoom(roomId: string): GameState | undefined {
  return rooms.get(roomId);
}

export function saveRoom(state: GameState): void {
  rooms.set(state.roomId, state);
  fs.writeFile(filePathFor(state.roomId), JSON.stringify(state), () => {});
}

export function allRoomIds(): string[] {
  return Array.from(rooms.keys());
}

export function deleteRoom(roomId: string): void {
  rooms.delete(roomId);
  fs.unlink(filePathFor(roomId), () => {});
}
