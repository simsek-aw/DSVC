import { buildBoardGraph, tilesTouchingVertex, vertexNeighborsOf } from "./boardGraph";
import { AxialCoord, axialKey, edgeKey, vertexKey } from "./hexGrid";
import { generateMap } from "./mapGenerator";
import {
  BUILD_COSTS,
  Building,
  ClientAction,
  DiceRoll,
  GameState,
  Player,
  ResourceType,
  RESOURCE_TYPES,
  Road,
  Tile,
  VICTORY_POINTS_TO_WIN,
} from "./types";

export const TILE_SIZE = 1;

export class GameError extends Error {}

function emptyResources(): Record<ResourceType, number> {
  return { wood: 0, brick: 0, ore: 0, wheat: 0, sheep: 0 };
}

const PLAYER_COLORS = ["#e63946", "#2a9d8f", "#f4a261", "#457b9d", "#8338ec", "#ffb703"];

export function createLobby(roomId: string): GameState {
  return {
    roomId,
    phase: "lobby",
    players: [],
    turnOrder: [],
    currentPlayerIndex: 0,
    setupRound: 1,
    setupStepAwaitingRoad: false,
    tiles: [],
    buildings: [],
    roads: [],
    lastDiceRoll: null,
    robberTileCoord: null,
    modifierRobberTileCoord: null,
    winnerId: null,
    log: [],
  };
}

export function addPlayer(state: GameState, playerId: string, name: string): GameState {
  if (state.phase !== "lobby") throw new GameError("Spiel läuft bereits, Beitritt nicht mehr möglich.");
  if (state.players.length >= 6) throw new GameError("Raum ist voll (max. 6 Spieler).");
  const player: Player = {
    id: playerId,
    name,
    color: PLAYER_COLORS[state.players.length % PLAYER_COLORS.length],
    connected: true,
    resources: emptyResources(),
    victoryPoints: 0,
    turnOrderRoll: null,
  };
  return { ...state, players: [...state.players, player], log: [...state.log, `${name} ist beigetreten.`] };
}

export function setPlayerConnected(state: GameState, playerId: string, connected: boolean): GameState {
  return {
    ...state,
    players: state.players.map((p) => (p.id === playerId ? { ...p, connected } : p)),
  };
}

function rollTwoDice(): DiceRoll {
  const die1 = 1 + Math.floor(Math.random() * 6);
  const die2 = 1 + Math.floor(Math.random() * 6);
  return { die1, die2, total: die1 + die2 };
}

function findTile(state: GameState, coord: AxialCoord): Tile {
  const tile = state.tiles.find((t) => axialKey(t.coord) === axialKey(coord));
  if (!tile) throw new GameError("Feld existiert nicht.");
  return tile;
}

function currentPlayer(state: GameState): Player {
  const id = state.turnOrder[state.currentPlayerIndex];
  const player = state.players.find((p) => p.id === id);
  if (!player) throw new GameError("Aktueller Spieler nicht gefunden.");
  return player;
}

function requireCurrentPlayer(state: GameState, playerId: string) {
  if (currentPlayer(state).id !== playerId) throw new GameError("Nicht dein Zug.");
}

function updatePlayer(state: GameState, playerId: string, fn: (p: Player) => Player): GameState {
  return { ...state, players: state.players.map((p) => (p.id === playerId ? fn(p) : p)) };
}

function revealTilesTouching(state: GameState, vertex: { x: number; y: number }): GameState {
  const graph = buildBoardGraph(state.tiles, TILE_SIZE);
  const touching = tilesTouchingVertex(graph, vertex);
  const touchingKeys = new Set(touching.map((c) => axialKey(c)));
  return {
    ...state,
    tiles: state.tiles.map((t) => (touchingKeys.has(axialKey(t.coord)) ? { ...t, revealed: true } : t)),
  };
}

export function startGame(state: GameState): GameState {
  if (state.phase !== "lobby") throw new GameError("Spiel wurde bereits gestartet.");
  if (state.players.length < 2) throw new GameError("Mindestens 2 Spieler nötig.");
  const { tiles } = generateMap({ playerCount: state.players.length, tileSize: TILE_SIZE });
  return {
    ...state,
    phase: "turnOrderRoll",
    tiles,
    log: [...state.log, "Spiel gestartet. Alle würfeln um die Zugreihenfolge."],
  };
}

function nextIndexSnake(state: GameState): { index: number; setupRound: 1 | 2; done: boolean } {
  const n = state.turnOrder.length;
  if (state.setupRound === 1) {
    if (state.currentPlayerIndex < n - 1) return { index: state.currentPlayerIndex + 1, setupRound: 1, done: false };
    return { index: n - 1, setupRound: 2, done: false }; // last player goes again first in round 2
  }
  if (state.currentPlayerIndex > 0) return { index: state.currentPlayerIndex - 1, setupRound: 2, done: false };
  return { index: 0, setupRound: 2, done: true };
}

function revealAllNumbers(state: GameState): GameState {
  return { ...state, tiles: state.tiles.map((t) => ({ ...t, numberRevealed: true })) };
}

function produceResources(state: GameState, total: number): GameState {
  let next = state;
  for (const tile of state.tiles) {
    if (tile.numberToken !== total) continue;
    if (tile.hasClassicRobber) continue;
    if (tile.terrain === "desert") continue;
    const resource = tile.terrain as ResourceType;
    const producers = state.buildings.filter((b) =>
      buildBoardGraph(state.tiles, TILE_SIZE)
        .vertexTiles.get(vertexKey(b.vertex))
        ?.some((c) => axialKey(c) === axialKey(tile.coord))
    );
    for (const b of producers) {
      const amount = b.type === "city" ? 2 : 1;
      let recipientId = b.ownerId;
      let finalAmount = amount;
      if (tile.modifierRobber?.variant === "corrupt" && tile.modifierRobber.beneficiaryPlayerId) {
        recipientId = tile.modifierRobber.beneficiaryPlayerId;
        next = { ...next, log: [...next.log, `Bestochener Räuber leitet die Ernte auf einem ${resource}-Feld um!`] };
      } else if (tile.modifierRobber?.variant === "boon") {
        finalAmount = amount * 2;
        next = { ...next, log: [...next.log, `Boost-Räuber verdoppelt die Ernte auf einem ${resource}-Feld!`] };
      }
      next = updatePlayer(next, recipientId, (p) => ({
        ...p,
        resources: { ...p.resources, [resource]: p.resources[resource] + finalAmount },
      }));
    }
  }
  return next;
}

function checkVictory(state: GameState): GameState {
  const winner = state.players.find((p) => p.victoryPoints >= VICTORY_POINTS_TO_WIN);
  if (!winner) return state;
  return { ...state, phase: "ended", winnerId: winner.id, log: [...state.log, `${winner.name} hat gewonnen!`] };
}

function hasEnoughResources(player: Player, cost: Partial<Record<ResourceType, number>>): boolean {
  return RESOURCE_TYPES.every((r) => player.resources[r] >= (cost[r] ?? 0));
}

function payCost(player: Player, cost: Partial<Record<ResourceType, number>>): Player {
  const resources = { ...player.resources };
  for (const r of RESOURCE_TYPES) resources[r] -= cost[r] ?? 0;
  return { ...player, resources };
}

export function applyAction(state: GameState, playerId: string, action: ClientAction): GameState {
  switch (action.type) {
    case "createRoom":
    case "joinRoom":
      throw new GameError("Diese Aktion wird außerhalb der Engine behandelt.");

    case "startGame":
      return startGame(state);

    case "rollTurnOrder": {
      if (state.phase !== "turnOrderRoll") throw new GameError("Nicht in der Würfelphase.");
      const player = state.players.find((p) => p.id === playerId);
      if (!player) throw new GameError("Spieler nicht gefunden.");
      if (player.turnOrderRoll !== null) throw new GameError("Du hast schon gewürfelt.");
      const roll = rollTwoDice();
      let next = updatePlayer(state, playerId, (p) => ({ ...p, turnOrderRoll: roll.total }));
      next = { ...next, log: [...next.log, `${player.name} würfelt ${roll.total} für die Startreihenfolge.`] };
      if (next.players.every((p) => p.turnOrderRoll !== null)) {
        const ordered = [...next.players].sort((a, b) => (b.turnOrderRoll ?? 0) - (a.turnOrderRoll ?? 0));
        next = {
          ...next,
          turnOrder: ordered.map((p) => p.id),
          phase: "setup",
          currentPlayerIndex: 0,
          setupRound: 1,
          log: [...next.log, `${ordered[0].name} beginnt und platziert die erste Siedlung.`],
        };
      }
      return next;
    }

    case "placeSetupSettlement": {
      if (state.phase !== "setup") throw new GameError("Nicht in der Aufbauphase.");
      requireCurrentPlayer(state, playerId);
      if (state.setupStepAwaitingRoad) throw new GameError("Erst die Straße für die letzte Siedlung legen.");
      const vk = vertexKey(action.vertex);
      if (state.buildings.some((b) => vertexKey(b.vertex) === vk)) throw new GameError("Platz bereits belegt.");
      const graph = buildBoardGraph(state.tiles, TILE_SIZE);
      const tooClose = vertexNeighborsOf(graph, action.vertex).some((n) =>
        state.buildings.some((b) => vertexKey(b.vertex) === vertexKey(n))
      );
      if (tooClose) throw new GameError("Zu nah an einer bestehenden Siedlung (Abstandsregel).");

      const building: Building = { vertex: action.vertex, type: "settlement", ownerId: playerId };
      let next: GameState = { ...state, buildings: [...state.buildings, building], setupStepAwaitingRoad: true };
      next = revealTilesTouching(next, action.vertex);
      next = updatePlayer(next, playerId, (p) => ({ ...p, victoryPoints: p.victoryPoints + 1 }));

      // Second settlement of setup grants immediate starting resources (classic Catan rule).
      if (state.setupRound === 2) {
        const touched = tilesTouchingVertex(graph, action.vertex);
        for (const coord of touched) {
          const tile = findTile(next, coord);
          if (tile.terrain === "desert") continue;
          const resource = tile.terrain as ResourceType;
          next = updatePlayer(next, playerId, (p) => ({
            ...p,
            resources: { ...p.resources, [resource]: p.resources[resource] + 1 },
          }));
        }
        // Assign a beneficiary for any newly revealed "corrupt" modifier robber tile.
        for (const coord of touched) {
          const tile = findTile(next, coord);
          if (tile.modifierRobber?.variant === "corrupt" && !tile.modifierRobber.beneficiaryPlayerId) {
            const others = next.players.filter((p) => p.id !== playerId);
            const beneficiary = others[Math.floor(Math.random() * others.length)] ?? next.players[0];
            next = {
              ...next,
              tiles: next.tiles.map((t) =>
                axialKey(t.coord) === axialKey(coord)
                  ? { ...t, modifierRobber: { ...t.modifierRobber!, beneficiaryPlayerId: beneficiary.id } }
                  : t
              ),
            };
          }
        }
      } else {
        for (const coord of tilesTouchingVertex(graph, action.vertex)) {
          const tile = findTile(next, coord);
          if (tile.modifierRobber?.variant === "corrupt" && !tile.modifierRobber.beneficiaryPlayerId) {
            const others = next.players.filter((p) => p.id !== playerId);
            const beneficiary = others[Math.floor(Math.random() * others.length)] ?? next.players[0];
            next = {
              ...next,
              tiles: next.tiles.map((t) =>
                axialKey(t.coord) === axialKey(coord)
                  ? { ...t, modifierRobber: { ...t.modifierRobber!, beneficiaryPlayerId: beneficiary.id } }
                  : t
              ),
            };
          }
        }
      }

      return next;
    }

    case "placeSetupRoad": {
      if (state.phase !== "setup") throw new GameError("Nicht in der Aufbauphase.");
      requireCurrentPlayer(state, playerId);
      if (!state.setupStepAwaitingRoad) throw new GameError("Erst eine Siedlung platzieren.");
      const ek = edgeKey(action.edge);
      if (state.roads.some((r) => edgeKey(r.edge) === ek)) throw new GameError("Straße bereits vorhanden.");
      const lastSettlement = [...state.buildings].reverse().find((b) => b.ownerId === playerId);
      if (!lastSettlement) throw new GameError("Keine Siedlung zum Verbinden gefunden.");
      const touchesLast =
        vertexKey(action.edge.a) === vertexKey(lastSettlement.vertex) ||
        vertexKey(action.edge.b) === vertexKey(lastSettlement.vertex);
      if (!touchesLast) throw new GameError("Straße muss an die zuletzt gebaute Siedlung anschließen.");

      const road: Road = { edge: action.edge, ownerId: playerId };
      let next: GameState = { ...state, roads: [...state.roads, road], setupStepAwaitingRoad: false };

      const { index, setupRound, done } = nextIndexSnake(next);
      if (done) {
        next = revealAllNumbers(next);
        next = { ...next, phase: "mainGame", currentPlayerIndex: 0, setupRound, log: [...next.log, "Aufbauphase beendet — alle Zahlen werden aufgedeckt!"] };
      } else {
        next = { ...next, currentPlayerIndex: index, setupRound };
      }
      return next;
    }

    case "rollDice": {
      if (state.phase !== "mainGame") throw new GameError("Nicht in der Hauptspielphase.");
      requireCurrentPlayer(state, playerId);
      if (state.lastDiceRoll) throw new GameError("Du hast diese Runde bereits gewürfelt.");
      const roll = rollTwoDice();
      let next: GameState = { ...state, lastDiceRoll: roll, log: [...state.log, `${currentPlayer(state).name} würfelt ${roll.total}.`] };
      if (roll.total === 7) {
        next = { ...next, log: [...next.log, "7 gewürfelt! Der klassische Räuber muss bewegt werden."] };
      } else {
        next = produceResources(next, roll.total);
      }
      return next;
    }

    case "moveClassicRobber": {
      if (state.phase !== "mainGame") throw new GameError("Nicht in der Hauptspielphase.");
      requireCurrentPlayer(state, playerId);
      if (!state.lastDiceRoll || state.lastDiceRoll.total !== 7) throw new GameError("Räuber darf nur nach einer 7 bewegt werden.");
      const target = findTile(state, action.coord);
      let next: GameState = {
        ...state,
        tiles: state.tiles.map((t) => ({ ...t, hasClassicRobber: axialKey(t.coord) === axialKey(target.coord) })),
        robberTileCoord: target.coord,
      };
      next = { ...next, log: [...next.log, `Räuber wandert auf ein ${target.terrain}-Feld.`] };
      return next;
    }

    case "buildRoad": {
      if (state.phase !== "mainGame") throw new GameError("Nicht in der Hauptspielphase.");
      requireCurrentPlayer(state, playerId);
      const player = currentPlayer(state);
      if (!hasEnoughResources(player, BUILD_COSTS.road)) throw new GameError("Nicht genug Rohstoffe für eine Straße.");
      const ek = edgeKey(action.edge);
      if (state.roads.some((r) => edgeKey(r.edge) === ek)) throw new GameError("Straße bereits vorhanden.");
      const connected =
        state.roads.some(
          (r) =>
            r.ownerId === playerId &&
            (vertexKey(r.edge.a) === vertexKey(action.edge.a) ||
              vertexKey(r.edge.a) === vertexKey(action.edge.b) ||
              vertexKey(r.edge.b) === vertexKey(action.edge.a) ||
              vertexKey(r.edge.b) === vertexKey(action.edge.b))
        ) ||
        state.buildings.some(
          (b) =>
            b.ownerId === playerId &&
            (vertexKey(b.vertex) === vertexKey(action.edge.a) || vertexKey(b.vertex) === vertexKey(action.edge.b))
        );
      if (!connected) throw new GameError("Straße muss an dein Straßen- oder Siedlungsnetz anschließen.");

      let next = updatePlayer(state, playerId, (p) => payCost(p, BUILD_COSTS.road));
      next = { ...next, roads: [...next.roads, { edge: action.edge, ownerId: playerId }] };
      return next;
    }

    case "buildSettlement": {
      if (state.phase !== "mainGame") throw new GameError("Nicht in der Hauptspielphase.");
      requireCurrentPlayer(state, playerId);
      const player = currentPlayer(state);
      if (!hasEnoughResources(player, BUILD_COSTS.settlement)) throw new GameError("Nicht genug Rohstoffe für eine Siedlung.");
      const vk = vertexKey(action.vertex);
      if (state.buildings.some((b) => vertexKey(b.vertex) === vk)) throw new GameError("Platz bereits belegt.");
      const graph = buildBoardGraph(state.tiles, TILE_SIZE);
      const tooClose = vertexNeighborsOf(graph, action.vertex).some((n) =>
        state.buildings.some((b) => vertexKey(b.vertex) === vertexKey(n))
      );
      if (tooClose) throw new GameError("Zu nah an einer bestehenden Siedlung (Abstandsregel).");
      const connectedByOwnRoad = state.roads.some(
        (r) =>
          r.ownerId === playerId &&
          (vertexKey(r.edge.a) === vk || vertexKey(r.edge.b) === vk)
      );
      if (!connectedByOwnRoad) throw new GameError("Siedlung muss an eine eigene Straße anschließen.");

      let next = updatePlayer(state, playerId, (p) => payCost(p, BUILD_COSTS.settlement));
      next = { ...next, buildings: [...next.buildings, { vertex: action.vertex, type: "settlement", ownerId: playerId }] };
      next = revealTilesTouching(next, action.vertex);
      next = updatePlayer(next, playerId, (p) => ({ ...p, victoryPoints: p.victoryPoints + 1 }));
      next = checkVictory(next);
      return next;
    }

    case "buildCity": {
      if (state.phase !== "mainGame") throw new GameError("Nicht in der Hauptspielphase.");
      requireCurrentPlayer(state, playerId);
      const player = currentPlayer(state);
      if (!hasEnoughResources(player, BUILD_COSTS.city)) throw new GameError("Nicht genug Rohstoffe für eine Stadt.");
      const vk = vertexKey(action.vertex);
      const existing = state.buildings.find((b) => vertexKey(b.vertex) === vk);
      if (!existing || existing.ownerId !== playerId || existing.type !== "settlement")
        throw new GameError("Hier steht keine eigene Siedlung zum Ausbauen.");

      let next = updatePlayer(state, playerId, (p) => payCost(p, BUILD_COSTS.city));
      next = {
        ...next,
        buildings: next.buildings.map((b) => (vertexKey(b.vertex) === vk ? { ...b, type: "city" } : b)),
      };
      next = updatePlayer(next, playerId, (p) => ({ ...p, victoryPoints: p.victoryPoints + 1 }));
      next = checkVictory(next);
      return next;
    }

    case "endTurn": {
      if (state.phase !== "mainGame") throw new GameError("Nicht in der Hauptspielphase.");
      requireCurrentPlayer(state, playerId);
      if (!state.lastDiceRoll) throw new GameError("Erst würfeln, bevor der Zug beendet wird.");
      if (state.lastDiceRoll.total === 7 && !state.robberTileCoord) {
        throw new GameError("Räuber muss nach einer 7 erst bewegt werden.");
      }
      const nextIndex = (state.currentPlayerIndex + 1) % state.turnOrder.length;
      return { ...state, currentPlayerIndex: nextIndex, lastDiceRoll: null, robberTileCoord: null };
    }

    default:
      throw new GameError("Unbekannte Aktion.");
  }
}
