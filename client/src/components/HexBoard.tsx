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
      <WaterPattern
        view={view}
        centerX={(svgRef.current?.clientWidth ?? 400) / 2}
        centerY={(svgRef.current?.clientHeight ?? 400) / 2}
      />
      <rect x={0} y={0} width="100%" height="100%" fill="url(#water)" />
      <rect x={0} y={0} width="100%" height="100%" fill="url(#waterVignette)" />
      <g transform={`translate(${view.x + (svgRef.current?.clientWidth ?? 400) / 2}, ${view.y + (svgRef.current?.clientHeight ?? 400) / 2})`}>
        <CoastLayer tiles={state.tiles} scale={view.scale} />
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
// Water in the FireRed/LeafGreen vein: a saturated mid-blue sea crossed by
// continuous horizontal ripple lines that step up and down in a square wave,
// rather than the scattered speckles of the earlier games.
const WATER_BASE = "#3878d0";
const WATER_DEEP = "#2a5cab";
const WATER_CREST = "#79b4ec";
const WATER_FOAM = "#c6e4ff";

const WATER_CELL = 4; // px per pixel-art cell
const WATER_GRID = 16; // cells per tile edge
const WAVE_STEP = 4; // cells per half period — divides the grid, so rows tile seamlessly

// yTop, phase (in cells), and whether the line carries a bright highlight.
const WAVE_ROWS: [number, number, boolean][] = [
  [2, 0, true],
  [9, 8, false],
];

/** One ripple line: alternating 4-cell runs stepping between two rows. */
function rippleRects(yTop: number, phase: number, bright: boolean, key: number, cell: number) {
  const out: JSX.Element[] = [];
  for (let k = 0; k * WAVE_STEP < WATER_GRID; k++) {
    const x = (k * WAVE_STEP + phase) % WATER_GRID;
    const y = yTop + (k % 2 === 0 ? 0 : 1);
    out.push(
      <rect key={`${key}-${k}`} x={x * cell} y={y * cell} width={WAVE_STEP * cell} height={cell} fill={WATER_CREST} />
    );
    if (bright) {
      // A shorter, brighter glint sitting on top of the run.
      out.push(
        <rect key={`${key}-${k}-g`} x={(x + 1) * cell} y={y * cell} width={2 * cell} height={cell / 2} fill={WATER_FOAM} />
      );
    }
    // Shadow tucked just beneath the crest gives the line some body.
    out.push(
      <rect key={`${key}-${k}-s`} x={x * cell} y={(y + 1) * cell} width={WAVE_STEP * cell} height={cell / 2} fill={WATER_DEEP} />
    );
  }
  return out;
}

// Pixel textures for the land, in the same handheld-RPG register as the sea:
// a flat base colour with a handful of darker and lighter marks that read as
// canopy, brickwork, rock facets, crop rows and tufts of grass.
const TERRAIN_CELL = 4;
const TERRAIN_GRID = 8;

type Mark = [number, number, number, number, string]; // x, y, w, h, colour

const TERRAIN_TEXTURES: Record<string, { base: string; marks: Mark[] }> = {
  wood: {
    base: "#2d6a4f",
    marks: [
      [1, 1, 2, 2, "#52b788"], [0, 3, 1, 1, "#1b4332"], [3, 0, 1, 1, "#52b788"],
      [5, 3, 2, 2, "#52b788"], [4, 5, 1, 1, "#1b4332"], [7, 2, 1, 1, "#52b788"],
      [2, 5, 2, 2, "#52b788"], [1, 7, 1, 1, "#1b4332"], [6, 6, 1, 1, "#52b788"],
    ],
  },
  brick: {
    base: "#bc6c25",
    marks: [
      [0, 1, 3, 1, "#8a4e15"], [4, 1, 3, 1, "#8a4e15"],
      [2, 3, 3, 1, "#8a4e15"], [6, 3, 2, 1, "#8a4e15"],
      [0, 5, 3, 1, "#8a4e15"], [4, 5, 3, 1, "#8a4e15"],
      [1, 2, 1, 1, "#d98c46"], [5, 4, 1, 1, "#d98c46"], [3, 6, 1, 1, "#d98c46"],
    ],
  },
  ore: {
    base: "#6c757d",
    marks: [
      [1, 1, 2, 1, "#adb5bd"], [2, 2, 2, 1, "#495057"],
      [5, 2, 2, 1, "#adb5bd"], [6, 3, 1, 1, "#495057"],
      [2, 5, 2, 1, "#adb5bd"], [3, 6, 2, 1, "#495057"],
      [6, 6, 1, 1, "#adb5bd"], [0, 4, 1, 1, "#495057"],
    ],
  },
  wheat: {
    base: "#e9c46a",
    marks: [
      [1, 0, 1, 3, "#c9a227"], [3, 1, 1, 3, "#c9a227"], [5, 0, 1, 3, "#c9a227"],
      [7, 2, 1, 3, "#c9a227"], [0, 4, 1, 3, "#c9a227"], [2, 5, 1, 3, "#c9a227"],
      [4, 4, 1, 3, "#c9a227"], [6, 5, 1, 3, "#c9a227"],
      [2, 2, 1, 1, "#f7e2a8"], [6, 1, 1, 1, "#f7e2a8"], [3, 6, 1, 1, "#f7e2a8"],
    ],
  },
  sheep: {
    base: "#a7c957",
    marks: [
      [2, 1, 1, 1, "#6a994e"], [1, 2, 2, 1, "#6a994e"],
      [6, 2, 1, 1, "#6a994e"], [5, 3, 2, 1, "#6a994e"],
      [3, 5, 1, 1, "#6a994e"], [2, 6, 2, 1, "#6a994e"],
      [0, 0, 1, 1, "#c9e07a"], [7, 5, 1, 1, "#c9e07a"], [4, 3, 1, 1, "#c9e07a"],
    ],
  },
  // Not terrains — the two rings that make the island sit in shallow water:
  // a pale beach right at the shoreline and a lighter sandbank under water.
  sand: {
    base: "#f0dfae",
    marks: [
      [1, 1, 2, 1, "#d6bd85"], [5, 0, 1, 1, "#d6bd85"], [3, 3, 2, 1, "#d6bd85"],
      [6, 4, 1, 1, "#d6bd85"], [0, 6, 2, 1, "#d6bd85"], [4, 7, 2, 1, "#d6bd85"],
      [2, 2, 1, 1, "#f6ecc9"], [7, 1, 1, 1, "#f6ecc9"], [5, 5, 1, 1, "#f6ecc9"],
      [1, 4, 1, 1, "#f6ecc9"],
    ],
  },
  shallow: {
    base: "#4f96e0",
    marks: [
      [0, 1, 3, 1, "#79b4ec"], [5, 2, 2, 1, "#79b4ec"],
      [2, 4, 3, 1, "#79b4ec"], [6, 6, 2, 1, "#79b4ec"],
      [3, 0, 1, 1, "#3878d0"], [1, 5, 2, 1, "#3878d0"], [5, 7, 2, 1, "#3878d0"],
    ],
  },
  desert: {
    base: "#d4a373",
    marks: [
      [0, 2, 4, 1, "#b8814e"], [5, 1, 3, 1, "#b8814e"],
      [2, 5, 4, 1, "#b8814e"], [6, 6, 2, 1, "#b8814e"],
      [3, 3, 2, 1, "#b8814e"], [0, 7, 3, 1, "#b8814e"],
      [1, 1, 1, 1, "#e8c8a5"], [4, 4, 1, 1, "#e8c8a5"], [7, 3, 1, 1, "#e8c8a5"],
    ],
  },
};

/**
 * The shoreline. Three concentric rings of the same hex silhouette are drawn
 * underneath the tiles — sandbank, beach, then the tiles themselves on top.
 * Because every ring is a plain fill with no stroke, the overlapping hexes
 * merge into one island outline instead of showing per-tile seams, and the
 * scalloped edge that falls out of it looks hand-drawn rather than geometric.
 */
function CoastLayer({ tiles, scale }: { tiles: Tile[]; scale: number }) {
  const rings: { factor: number; fill: string; opacity?: number }[] = [
    { factor: 1.42, fill: "url(#terrain-shallow)", opacity: 0.5 },
    { factor: 1.28, fill: "url(#terrain-shallow)" },
    { factor: 1.14, fill: "url(#terrain-sand)" },
  ];
  return (
    <g pointerEvents="none">
      {rings.map((ring) => (
        <g key={ring.factor} fill={ring.fill} fillOpacity={ring.opacity}>
          {tiles.map((tile) => (
            <polygon
              key={axialKey(tile.coord)}
              points={tilePolygonPoints(axialToPixel(tile.coord, scale), scale * ring.factor)}
            />
          ))}
        </g>
      ))}
    </g>
  );
}

/** One repeating texture per terrain, scaled to match the current zoom. */
function TerrainPatterns({ scale }: { scale: number }) {
  const size = TERRAIN_GRID * TERRAIN_CELL;
  // Tiles live inside the board's translated group, so the pattern already
  // travels with the map; only the zoom has to be applied here.
  const transform = `scale(${scale / 48})`;
  return (
    <>
      {Object.entries(TERRAIN_TEXTURES).map(([terrain, { base, marks }]) => (
        <pattern
          key={terrain}
          id={`terrain-${terrain}`}
          width={size}
          height={size}
          patternUnits="userSpaceOnUse"
          patternTransform={transform}
        >
          <rect width={size} height={size} fill={base} />
          {marks.map(([x, y, w, h, c], i) => (
            <rect key={i} x={x * TERRAIN_CELL} y={y * TERRAIN_CELL} width={w * TERRAIN_CELL} height={h * TERRAIN_CELL} fill={c} />
          ))}
        </pattern>
      ))}
    </>
  );
}

/**
 * The sea is drawn as a repeating pattern that carries the board's own pan and
 * zoom, so dragging the map drags the water with it rather than sliding the
 * island across a fixed backdrop.
 */
function WaterPattern({ view, centerX, centerY }: { view: { scale: number; x: number; y: number }; centerX: number; centerY: number }) {
  const size = WATER_GRID * WATER_CELL;
  const transform = `translate(${view.x + centerX}, ${view.y + centerY}) scale(${view.scale / 48})`;
  return (
    <defs>
      <pattern id="water" width={size} height={size} patternUnits="userSpaceOnUse" patternTransform={transform}>
        <rect width={size} height={size} fill={WATER_BASE} />
        {WAVE_ROWS.map(([yTop, phase, bright], i) => rippleRects(yTop, phase, bright, i, WATER_CELL))}
      </pattern>
      <TerrainPatterns scale={view.scale} />
      {/* Darkens the edges so the island stays the focus. */}
      <radialGradient id="waterVignette" cx="50%" cy="42%" r="75%">
        <stop offset="0%" stopColor="#0d1b1e" stopOpacity="0" />
        <stop offset="100%" stopColor="#0d1b1e" stopOpacity="0.5" />
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
  const fill = known
    ? TERRAIN_TEXTURES[tile.terrain]
      ? `url(#terrain-${tile.terrain})`
      : TERRAIN_COLORS[tile.terrain]
    : "#1b263b";

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
