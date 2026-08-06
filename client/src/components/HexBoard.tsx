import { useMemo, useRef, useState } from "react";
import {
  AxialCoord,
  BUILD_COSTS,
  EdgeId,
  GameState,
  TILE_SIZE,
  Tile,
  VertexId,
  axialKey,
  axialToPixel,
  buildBoardGraph,
  edgeKey,
  hexCorners,
  vertexKey,
} from "@canos/shared";

export type BuildMode = null | "road" | "settlement" | "city" | "knight" | "bribery" | "roadBuilding" | "scout";

interface Props {
  state: GameState;
  myPlayerId: string;
  buildMode: BuildMode;
  sendAction: (action: any) => void;
  freeRoadEdges?: EdgeId[];
  onSelectFreeRoadEdge?: (edge: EdgeId) => void;
}

const TERRAIN_COLORS: Record<string, string> = {
  wood: "#2d6a4f",
  brick: "#bc6c25",
  ore: "#6c757d",
  wheat: "#e9c46a",
  sheep: "#a7c957",
  desert: "#d4a373",
  unknown: "#1b263b",
};

function tilePolygonPoints(center: { x: number; y: number }, size: number): string {
  return hexCorners(center, size)
    .map((c) => `${c.x},${c.y}`)
    .join(" ");
}

type Gesture =
  | { kind: "pan"; startX: number; startY: number; viewX: number; viewY: number }
  | { kind: "pinch"; startDist: number; startScale: number }
  | null;

function distanceBetween(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function HexBoard({ state, myPlayerId, buildMode, sendAction, freeRoadEdges, onSelectFreeRoadEdge }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [view, setView] = useState({ scale: 48, x: 0, y: 0 });

  // Pointer Events alone (no separate legacy Touch Events) unify mouse, touch
  // and pen across modern browsers — mixing both APIs on the same element is
  // what previously let a two-finger touch fire pan and pinch logic at once
  // and fight over `view`. Every active pointer's last known position lives
  // here; the gesture is derived fresh from however many are currently down.
  const pointersRef = useRef(new Map<number, { x: number; y: number }>());
  const gestureRef = useRef<Gesture>(null);

  const graph = useMemo(() => buildBoardGraph(state.tiles, TILE_SIZE), [state.tiles]);

  const restartGesture = () => {
    const points = Array.from(pointersRef.current.values());
    if (points.length >= 2) {
      gestureRef.current = { kind: "pinch", startDist: distanceBetween(points[0], points[1]), startScale: view.scale };
    } else if (points.length === 1) {
      gestureRef.current = { kind: "pan", startX: points[0].x, startY: points[0].y, viewX: view.x, viewY: view.y };
    } else {
      gestureRef.current = null;
    }
  };

  const onPointerDown = (e: React.PointerEvent) => {
    try {
      (e.target as Element).setPointerCapture?.(e.pointerId);
    } catch {
      // Some browsers/elements can reject pointer capture — panning still
      // works without it, so just carry on rather than breaking the drag.
    }
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    restartGesture();
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!pointersRef.current.has(e.pointerId)) return;
    // Stop the browser from also treating this as a page-scroll/swipe gesture
    // (belt-and-suspenders alongside the CSS touch-action: none below).
    e.preventDefault();
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const gesture = gestureRef.current;
    if (!gesture) return;
    const points = Array.from(pointersRef.current.values());

    if (gesture.kind === "pinch" && points.length >= 2) {
      const dist = distanceBetween(points[0], points[1]);
      if (!Number.isFinite(dist) || dist <= 0) return;
      const nextScale = Math.min(120, Math.max(20, gesture.startScale * (dist / gesture.startDist)));
      if (Number.isFinite(nextScale)) setView((v) => ({ ...v, scale: nextScale }));
    } else if (gesture.kind === "pan" && points.length === 1) {
      const dx = points[0].x - gesture.startX;
      const dy = points[0].y - gesture.startY;
      if (Number.isFinite(dx) && Number.isFinite(dy)) {
        setView((v) => ({ ...v, x: gesture.viewX + dx, y: gesture.viewY + dy }));
      }
    }
  };

  const endPointer = (e: React.PointerEvent) => {
    pointersRef.current.delete(e.pointerId);
    restartGesture();
  };

  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    setView((v) => ({ ...v, scale: Math.min(120, Math.max(20, v.scale - e.deltaY * 0.05)) }));
  };

  const px = (coord: AxialCoord) => axialToPixel(coord, view.scale);

  const canAffordRoad = affordable(state, myPlayerId, "road");
  const canAffordSettlement = affordable(state, myPlayerId, "settlement");
  const canAffordCity = affordable(state, myPlayerId, "city");

  const awaitingRobberMove = state.lastDiceRoll?.total === 7 && !state.robberTileCoord;

  const handleTileClick = (tile: Tile) => {
    if (awaitingRobberMove) {
      sendAction({ type: "moveClassicRobber", coord: tile.coord });
    } else if (buildMode === "knight") {
      sendAction({ type: "playKnight", coord: tile.coord });
    } else if (buildMode === "bribery" && tile.revealed) {
      sendAction({ type: "playBribery", coord: tile.coord });
    } else if (buildMode === "scout" && !tile.revealed) {
      sendAction({ type: "scoutTile", coord: tile.coord });
    }
  };

  return (
    <svg
      ref={svgRef}
      className="hex-board"
      style={{ touchAction: "none" }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endPointer}
      onPointerLeave={endPointer}
      onPointerCancel={endPointer}
      onWheel={onWheel}
    >
      <WaterPattern />
      <rect x={0} y={0} width="100%" height="100%" fill="url(#water)" />
      <rect x={0} y={0} width="100%" height="100%" fill="url(#waterVignette)" />
      <g transform={`translate(${view.x + (svgRef.current?.clientWidth ?? 400) / 2}, ${view.y + (svgRef.current?.clientHeight ?? 400) / 2})`}>
        {state.tiles.map((tile) => {
          const center = px(tile.coord);
          const isBribed = state.briberyTileCoord && axialKey(state.briberyTileCoord) === axialKey(tile.coord);
          return (
            <TilePiece
              key={axialKey(tile.coord)}
              tile={tile}
              center={center}
              size={view.scale}
              isBribed={!!isBribed}
              scouted={tile.scoutedBy.includes(myPlayerId)}
              onClickTile={() => handleTileClick(tile)}
            />
          );
        })}

        {(buildMode === "road" || buildMode === "roadBuilding") &&
          Array.from(graph.edges.values()).map((edge) => {
            const occupied = state.roads.some((r) => edgeKey(r.edge) === edgeKey(edge));
            const alreadySelected = freeRoadEdges?.some((e) => edgeKey(e) === edgeKey(edge));
            if (occupied || alreadySelected) return null;
            if (buildMode === "road" && !canAffordRoad) return null;
            const a = scalePoint(edge.a, view.scale);
            const b = scalePoint(edge.b, view.scale);
            return (
              <line
                key={edgeKey(edge)}
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                className="edge-hitbox"
                onClick={() => (buildMode === "roadBuilding" ? onSelectFreeRoadEdge?.(edge) : sendAction({ type: "buildRoad", edge }))}
              />
            );
          })}

        {freeRoadEdges?.map((edge) => {
          const a = scalePoint(edge.a, view.scale);
          const b = scalePoint(edge.b, view.scale);
          return (
            <line
              key={`pending-${edgeKey(edge)}`}
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              stroke="#f4a261"
              strokeWidth={Math.max(3, view.scale * 0.08)}
              strokeDasharray="4 4"
              strokeLinecap="round"
            />
          );
        })}

        {Array.from(graph.vertices.values()).map((v) => {
          const vk = vertexKey(v);
          const building = state.buildings.find((b) => vertexKey(b.vertex) === vk);
          const p = scalePoint(v, view.scale);
          const owner = building && state.players.find((pl) => pl.id === building.ownerId);

          const isMyTurn = state.turnOrder[state.currentPlayerIndex] === myPlayerId;
          const clickable =
            (buildMode === "settlement" && !building && canAffordSettlement) ||
            (buildMode === "city" && building?.ownerId === myPlayerId && building.type === "settlement" && canAffordCity) ||
            (state.phase === "setup" && !building && isMyTurn && !state.setupStepAwaitingRoad);

          return (
            <g key={vk}>
              {clickable && (
                <circle
                  cx={p.x}
                  cy={p.y}
                  r={Math.max(6, view.scale * 0.14)}
                  className="vertex-hitbox"
                  onClick={() =>
                    sendAction(
                      state.phase === "setup"
                        ? { type: "placeSetupSettlement", vertex: v }
                        : buildMode === "city"
                        ? { type: "buildCity", vertex: v }
                        : { type: "buildSettlement", vertex: v }
                    )
                  }
                />
              )}
              {building && (
                <rect
                  x={p.x - view.scale * 0.12}
                  y={p.y - view.scale * 0.12}
                  width={view.scale * 0.24}
                  height={view.scale * 0.24}
                  fill={owner?.color ?? "#fff"}
                  stroke="#111"
                  strokeWidth={1.5}
                  rx={building.type === "city" ? 2 : 8}
                />
              )}
            </g>
          );
        })}

        {state.phase === "setup" &&
          state.setupStepAwaitingRoad &&
          state.turnOrder[state.currentPlayerIndex] === myPlayerId &&
          Array.from(graph.edges.values()).map((edge) => {
            const occupied = state.roads.some((r) => edgeKey(r.edge) === edgeKey(edge));
            if (occupied) return null;
            // Only edges touching the settlement just placed are legal during setup —
            // filtering here avoids letting players click a road the server will reject anyway.
            const lastOwnSettlement = [...state.buildings].reverse().find((b) => b.ownerId === myPlayerId);
            if (!lastOwnSettlement) return null;
            const touchesLast =
              vertexKey(edge.a) === vertexKey(lastOwnSettlement.vertex) || vertexKey(edge.b) === vertexKey(lastOwnSettlement.vertex);
            if (!touchesLast) return null;
            const a = scalePoint(edge.a, view.scale);
            const b = scalePoint(edge.b, view.scale);
            return (
              <line
                key={edgeKey(edge)}
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                className="edge-hitbox"
                onClick={() => sendAction({ type: "placeSetupRoad", edge })}
              />
            );
          })}

        {state.roads.map((road) => {
          const owner = state.players.find((p) => p.id === road.ownerId);
          const a = scalePoint(road.edge.a, view.scale);
          const b = scalePoint(road.edge.b, view.scale);
          return (
            <line
              key={edgeKey(road.edge)}
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              stroke={owner?.color ?? "#fff"}
              strokeWidth={Math.max(3, view.scale * 0.08)}
              strokeLinecap="round"
            />
          );
        })}
      </g>
    </svg>
  );
}

// Hand-built pixel-art sea, in the spirit of classic blocky water tiles but
// drawn from scratch (and darkened) so it sits under the board without
// competing with the terrain colours.
const WATER_BASE = "#12303f";
const WATER_MID = "#1d5875";
const WATER_LIGHT = "#2b83a1";
const WATER_FOAM = "#57b3cc";

const WATER_CELL = 4; // px per pixel-art cell
const WATER_GRID = 26; // cells per tile edge

// Rounded lumps rather than straight dashes — straight rows of pixels read as
// brickwork, whereas clipped corners read as swells on water.
type Blob = { x: number; y: number; w: number; h: number; c: string };
const WATER_BLOBS: Blob[] = [
  { x: 2, y: 2, w: 7, h: 5, c: WATER_MID },
  { x: 15, y: 3, w: 8, h: 5, c: WATER_MID },
  { x: 8, y: 11, w: 7, h: 5, c: WATER_MID },
  { x: 19, y: 15, w: 5, h: 4, c: WATER_MID },
  { x: 2, y: 17, w: 6, h: 4, c: WATER_MID },
  { x: 11, y: 20, w: 6, h: 4, c: WATER_MID },
  { x: 11, y: 6, w: 4, h: 3, c: WATER_LIGHT },
  { x: 3, y: 10, w: 3, h: 2, c: WATER_LIGHT },
  { x: 20, y: 9, w: 4, h: 3, c: WATER_LIGHT },
  { x: 15, y: 17, w: 3, h: 2, c: WATER_LIGHT },
  { x: 5, y: 22, w: 4, h: 2, c: WATER_LIGHT },
];
const WATER_FOAM_DOTS: [number, number][] = [
  [5, 4], [18, 5], [12, 13], [21, 16], [4, 18], [14, 21], [9, 8], [23, 12],
];

// A pixel "blob": full body with the corner cells shaved off.
function blobRects(b: Blob, key: number) {
  const r = (x: number, y: number, w: number, h: number, i: string) => (
    <rect key={`${key}-${i}`} x={x * WATER_CELL} y={y * WATER_CELL} width={w * WATER_CELL} height={h * WATER_CELL} fill={b.c} />
  );
  return [
    r(b.x + 1, b.y, b.w - 2, 1, "t"),
    r(b.x, b.y + 1, b.w, b.h - 2, "m"),
    r(b.x + 1, b.y + b.h - 1, b.w - 2, 1, "b"),
  ];
}

function WaterPattern() {
  const size = WATER_GRID * WATER_CELL;
  return (
    <defs>
      <pattern id="water" width={size} height={size} patternUnits="userSpaceOnUse">
        <rect width={size} height={size} fill={WATER_BASE} />
        {WATER_BLOBS.map((b, i) => blobRects(b, i))}
        {WATER_FOAM_DOTS.map(([x, y], i) => (
          <rect key={`f${i}`} x={x * WATER_CELL} y={y * WATER_CELL} width={WATER_CELL} height={WATER_CELL} fill={WATER_FOAM} />
        ))}
      </pattern>
      {/* Darkens the edges so the island stays the focus. */}
      <radialGradient id="waterVignette" cx="50%" cy="42%" r="72%">
        <stop offset="0%" stopColor="#0d1b1e" stopOpacity="0" />
        <stop offset="100%" stopColor="#0d1b1e" stopOpacity="0.72" />
      </radialGradient>
    </defs>
  );
}

function scalePoint(v: VertexId, scale: number) {
  return { x: v.x * scale, y: v.y * scale };
}

function affordable(state: GameState, playerId: string, cost: "road" | "settlement" | "city"): boolean {
  const player = state.players.find((p) => p.id === playerId);
  if (!player) return false;
  const costs = BUILD_COSTS[cost];
  return Object.entries(costs).every(([resource, amount]) => player.resources[resource as keyof typeof player.resources] >= (amount ?? 0));
}

function TilePiece({
  tile,
  center,
  size,
  isBribed,
  scouted,
  onClickTile,
}: {
  tile: Tile;
  center: { x: number; y: number };
  size: number;
  isBribed: boolean;
  scouted: boolean;
  onClickTile: () => void;
}) {
  const points = tilePolygonPoints(center, size * 0.97);
  // A scouted tile shows its terrain only to the player who paid for the look,
  // dimmed and dashed so it stays visibly "not officially uncovered yet".
  const known = tile.revealed || scouted;
  const fill = known ? TERRAIN_COLORS[tile.terrain] : "#1b263b";

  return (
    <g onClick={onClickTile} className="tile-group">
      <polygon
        points={points}
        fill={fill}
        fillOpacity={tile.revealed ? 1 : scouted ? 0.5 : 1}
        stroke={scouted && !tile.revealed ? "#a8dadc" : "#0d1b1e"}
        strokeWidth={1.5}
        strokeDasharray={scouted && !tile.revealed ? "4 3" : undefined}
      />
      {!tile.revealed && !scouted && (
        <text x={center.x} y={center.y} textAnchor="middle" dominantBaseline="middle" className="tile-back-glyph">
          ?
        </text>
      )}
      {!tile.revealed && scouted && (
        <>
          <text x={center.x} y={center.y - size * 0.1} textAnchor="middle" dominantBaseline="middle" className="scout-glyph">
            🔭
          </text>
          {tile.numberToken !== null && (
            <text x={center.x} y={center.y + size * 0.3} textAnchor="middle" dominantBaseline="middle" className="scout-number">
              {tile.numberToken}
            </text>
          )}
        </>
      )}
      {tile.revealed && tile.numberRevealed && tile.numberToken !== null && (
        <>
          <circle cx={center.x} cy={center.y} r={size * 0.28} fill="#f1faee" stroke="#111" strokeWidth={1} />
          <text x={center.x} y={center.y} textAnchor="middle" dominantBaseline="middle" className="tile-number">
            {tile.numberToken}
          </text>
        </>
      )}
      {tile.revealed && tile.hasClassicRobber && (
        <text x={center.x} y={center.y - size * 0.5} textAnchor="middle" className="robber-glyph">
          <title>Klassischer Räuber</title>
          🥷
        </text>
      )}
      {tile.revealed && tile.hasBoostToken && (
        <text x={center.x} y={center.y - size * 0.5} textAnchor="middle" className="robber-glyph">
          <title>Boost-Figur</title>
          ✨
        </text>
      )}
      {isBribed && (
        <text x={center.x + size * 0.4} y={center.y - size * 0.5} textAnchor="middle" className="robber-glyph">
          <title>Bestochen</title>
          💰
        </text>
      )}
      {tile.revealed && tile.port && (
        <text x={center.x} y={center.y + size * 0.6} textAnchor="middle" className="port-glyph">
          ⚓{tile.port.resource === "any" ? "3:1" : "2:1"}
        </text>
      )}
    </g>
  );
}
