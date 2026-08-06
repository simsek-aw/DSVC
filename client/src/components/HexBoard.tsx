import { useMemo, useRef, useState } from "react";
import {
  AxialCoord,
  BUILD_COSTS,
  EdgeId,
  GameState,
  ResourceType,
  TERRAIN_NAMES_DE,
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
import { MarkerKind, MarkerSpriteAt, NumberChipAt, ResourceSpriteAt, ShipSpriteAt } from "./PixelIcons";
import { WaterPatternTile } from "./Water";

export type BuildMode = null | "road" | "settlement" | "city" | "knight" | "bribery" | "roadBuilding" | "scout";

interface Props {
  state: GameState;
  myPlayerId: string;
  buildMode: BuildMode;
  sendAction: (action: any) => void;
  freeRoadEdges?: EdgeId[];
  onSelectFreeRoadEdge?: (edge: EdgeId) => void;
  onInspect?: (info: MapInfo | null) => void;
  boardRef?: React.MutableRefObject<BoardApi | null>;
}

/** A small handle GameView uses to place harvest sprites over the right tile. */
export interface BoardApi {
  /** Viewport pixel position of a tile's centre, or null if the board isn't mounted. */
  getTileScreenPos(coord: AxialCoord): { x: number; y: number } | null;
}

/** Short explanation of a map element, shown when the player taps it. */
export interface MapInfo {
  title: string;
  text: string;
}

// Flat mode: sea and terrain become clean solid colours (with a soft sea
// gradient and soft coast), while all icons/sprites stay pixel-art. Flip to
// false to get the fully pixel-textured board back.
const FLAT = true;

const TERRAIN_COLORS: Record<string, string> = {
  wood: "#3a8f5f",
  brick: "#c9773a",
  ore: "#7c8791",
  wheat: "#eec860",
  sheep: "#a7cf5c",
  desert: "#e0b784",
  unknown: "#22364a",
};

// Soft coast + sea tones for flat mode.
const FLAT_SAND = "#efdca8";
const FLAT_SHALLOW = "#6fdbec";
const FLAT_SEA_TOP = "#46d2e3";
const FLAT_SEA_BOTTOM = "#158fa8";

// A simple zig-zag ("Zacken") motif, used at low opacity so flat sea and land
// still carry a bit of hand-drawn texture. Two staggered rows per tile.
const ZACKEN_W = 16;
const ZACKEN_H = 16;
const ZACKEN_PATH = ["M0 4 L4 1 L8 4 L12 1 L16 4", "M0 12 L4 9 L8 12 L12 9 L16 12"];

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

export function HexBoard({
  state,
  myPlayerId,
  buildMode,
  sendAction,
  freeRoadEdges,
  onSelectFreeRoadEdge,
  onInspect,
  boardRef,
}: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [view, setView] = useState({ scale: 48, x: 0, y: 0 });

  // Expose the current tile→screen mapping so the harvest fly can start on the
  // exact tile. Reassigned every render, so it always uses the latest pan/zoom.
  if (boardRef) {
    boardRef.current = {
      getTileScreenPos(coord: AxialCoord) {
        const svg = svgRef.current;
        if (!svg) return null;
        const rect = svg.getBoundingClientRect();
        const p = axialToPixel(coord, view.scale);
        return { x: rect.left + view.x + svg.clientWidth / 2 + p.x, y: rect.top + view.y + svg.clientHeight / 2 + p.y };
      },
    };
  }

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

  // Frame the whole island: fit its bounding box into the board and centre it.
  const recenter = () => {
    if (state.tiles.length === 0) return;
    const pts = state.tiles.map((t) => axialToPixel(t.coord, 1)); // unscaled centres
    const minX = Math.min(...pts.map((p) => p.x));
    const maxX = Math.max(...pts.map((p) => p.x));
    const minY = Math.min(...pts.map((p) => p.y));
    const maxY = Math.max(...pts.map((p) => p.y));
    const spanX = maxX - minX + 2; // +2 board units of margin for the hex edges
    const spanY = maxY - minY + 2;
    const w = svgRef.current?.clientWidth ?? 400;
    const h = svgRef.current?.clientHeight ?? 400;
    const scale = Math.max(20, Math.min(120, Math.min(w / spanX, h / spanY)));
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    setView({ scale, x: -cx * scale, y: -cy * scale });
  };

  const px = (coord: AxialCoord) => axialToPixel(coord, view.scale);
  const me = state.players.find((p) => p.id === myPlayerId);

  // When a number is rolled (not a 7), every matching tile flashes once. The key
  // changes with each roll so React remounts the flash and the animation replays,
  // even when the same number comes up twice in a row.
  const roll = state.lastDiceRoll;
  const harvestValue = roll && roll.total !== 7 ? roll.total : null;
  const harvestKey = roll ? `${roll.die1}-${roll.die2}-${state.currentPlayerIndex}` : "";

  const canAffordRoad = affordable(state, myPlayerId, "road");
  const canAffordSettlement = affordable(state, myPlayerId, "settlement");
  const canAffordCity = affordable(state, myPlayerId, "city");

  const awaitingRobberMove = state.lastDiceRoll?.total === 7 && !state.robberTileCoord;

  // While a tap is supposed to place the robber or aim a card, taps must reach
  // the tile itself — explaining things would swallow them.
  const aiming = awaitingRobberMove || buildMode === "knight" || buildMode === "bribery" || buildMode === "scout";
  const inspect = aiming ? undefined : onInspect;

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
    <>
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
      onClick={() => onInspect?.(null)}
    >
      <WaterPattern
        view={view}
        centerX={(svgRef.current?.clientWidth ?? 400) / 2}
        centerY={(svgRef.current?.clientHeight ?? 400) / 2}
      />
      <rect x={0} y={0} width="100%" height="100%" fill={FLAT ? "url(#seaGradient)" : "url(#water)"} />
      {FLAT && <rect x={0} y={0} width="100%" height="100%" fill="url(#seaZacken)" />}
      <rect x={0} y={0} width="100%" height="100%" fill="url(#waterVignette)" />
      <g transform={`translate(${view.x + (svgRef.current?.clientWidth ?? 400) / 2}, ${view.y + (svgRef.current?.clientHeight ?? 400) / 2})`}>
        <CoastLayer tiles={state.tiles} scale={view.scale} />
        {state.tiles.map((tile) => {
          const center = px(tile.coord);
          return (
            <TilePiece
              key={axialKey(tile.coord)}
              tile={tile}
              center={center}
              size={view.scale}
              scouted={tile.scoutedBy.includes(myPlayerId)}
              onClickTile={() => handleTileClick(tile)}
              onInspect={inspect}
              harvesting={harvestValue !== null && tile.revealed && tile.numberRevealed && tile.numberToken === harvestValue}
              harvestKey={harvestKey}
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

        {/* Roads first, so a settlement/city always sits on top of its roads. */}
        {state.roads.map((road) => {
          const owner = state.players.find((p) => p.id === road.ownerId);
          return (
            <RoadPlanks
              key={edgeKey(road.edge)}
              a={scalePoint(road.edge.a, view.scale)}
              b={scalePoint(road.edge.b, view.scale)}
              size={view.scale}
              color={owner?.color ?? "#fff"}
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
              {/* Ghost preview of what a tap would build here. */}
              {clickable && buildMode && buildMode !== "roadBuilding" && (
                <g className="build-ghost">
                  <BuildingSprite
                    type={buildMode === "city" ? "city" : "settlement"}
                    cx={p.x}
                    cy={p.y}
                    size={view.scale}
                    color={me?.color ?? "#fff"}
                  />
                </g>
              )}
              {building && (
                <BuildingSprite type={building.type} cx={p.x} cy={p.y} size={view.scale} color={owner?.color ?? "#fff"} />
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

        <MarkerLayer
          tiles={state.tiles}
          scale={view.scale}
          briberyCoord={state.briberyTileCoord}
          briberyBeneficiary={state.players.find((p) => p.id === state.briberyBeneficiaryId)?.name ?? "den Spieler"}
          onInspect={inspect}
        />
      </g>
    </svg>
    <button className="recenter-btn" onClick={recenter} title="Karte zentrieren" aria-label="Karte zentrieren">
      ⌖
    </button>
    </>
  );
}

// Pixel textures for the land, in the same handheld-RPG register as the sea:
// a flat base colour with a handful of darker and lighter marks that read as
// canopy, brickwork, rock facets, crop rows and tufts of grass.
const TERRAIN_CELL = 3;
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
    base: "#48cadb",
    marks: [
      [0, 1, 3, 1, "#7fe0ec"], [5, 2, 2, 1, "#7fe0ec"],
      [2, 4, 3, 1, "#7fe0ec"], [6, 6, 2, 1, "#7fe0ec"],
      [3, 0, 1, 1, "#18bdd6"], [1, 5, 2, 1, "#18bdd6"], [5, 7, 2, 1, "#18bdd6"],
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

interface MarkerTone {
  bg: string;
  border: string;
}

const MARKER_TONES: Record<MarkerKind, MarkerTone> = {
  robber: { bg: "#1b263b", border: "#e63946" },
  boost: { bg: "#14453f", border: "#f4d35e" },
  bribery: { bg: "#3f2a1d", border: "#f4a261" },
};

/**
 * Robber, boost figure and bribery marker sit in little speech bubbles that
 * hover over the board and point down at their tile, instead of a bare emoji
 * floating on the terrain. Drawn as one layer after all tiles so a bubble is
 * never clipped by the neighbouring hex it overlaps.
 */
const MARKER_INFO: Record<MarkerKind, MapInfo> = {
  robber: {
    title: "Räuber",
    text: "Blockiert dieses Feld komplett: es liefert nichts mehr, bis jemand eine 7 würfelt und ihn weiterzieht. Wer eine 7 würfelt, darf danach einem Anlieger eine Karte klauen.",
  },
  boost: {
    title: "Boost-Figur",
    text: "Dieses Feld liefert die doppelte Ernte — für alle, die daran bauen. Die Figur liegt seit Kartenerstellung fest und wandert nicht.",
  },
  bribery: {
    title: "Bestochener Räuber",
    text: "Die Ernte dieses Feldes geht an einen anderen Spieler, statt an die Anlieger. Der Effekt hält, bis jemand eine 7 würfelt oder selbst eine Bestechung spielt.",
  },
};

function MarkerLayer({
  tiles,
  scale,
  briberyCoord,
  briberyBeneficiary,
  onInspect,
}: {
  tiles: Tile[];
  scale: number;
  briberyCoord: AxialCoord | null;
  briberyBeneficiary: string;
  onInspect?: (info: MapInfo) => void;
}) {
  return (
    <g pointerEvents={onInspect ? "auto" : "none"}>
      {tiles.map((tile) => {
        const marks: { key: MarkerKind; title: string }[] = [];
        if (tile.revealed && tile.hasClassicRobber) marks.push({ key: "robber", title: "Klassischer Räuber" });
        if (tile.revealed && tile.hasBoostToken) marks.push({ key: "boost", title: "Boost-Figur" });
        if (briberyCoord && axialKey(briberyCoord) === axialKey(tile.coord)) marks.push({ key: "bribery", title: "Bestochen" });
        if (marks.length === 0) return null;

        const center = axialToPixel(tile.coord, scale);
        const w = scale * 0.56;
        const h = scale * 0.46;
        const bottom = center.y - scale * 0.44; // bubble sits just above the tile
        const tipY = center.y - scale * 0.2; // and points into it
        return marks.map((mark, i) => {
          const cx = center.x + (i - (marks.length - 1) / 2) * (w + scale * 0.08);
          const tone = MARKER_TONES[mark.key];
          return (
            <g
              key={`${axialKey(tile.coord)}-${mark.key}`}
              className={`map-bubble ${onInspect ? "inspectable" : ""}`}
              onClick={(e) => {
                if (!onInspect) return;
                e.stopPropagation();
                const info = MARKER_INFO[mark.key];
                onInspect(
                  mark.key === "bribery"
                    ? { ...info, text: info.text.replace("an einen anderen Spieler", `an ${briberyBeneficiary}`) }
                    : info,
                );
              }}
            >
              <title>{mark.title}</title>
              <path
                d={`M ${cx - w * 0.18} ${bottom - 1} L ${cx + w * 0.18} ${bottom - 1} L ${cx} ${tipY} Z`}
                fill={tone.bg}
                stroke={tone.border}
                strokeWidth={1.5}
                strokeLinejoin="round"
              />
              <rect
                x={cx - w / 2}
                y={bottom - h}
                width={w}
                height={h}
                rx={h * 0.34}
                fill={tone.bg}
                stroke={tone.border}
                strokeWidth={1.5}
              />
              <MarkerSpriteAt kind={mark.key} x={cx} y={bottom - h / 2} size={h * 0.72} />
            </g>
          );
        });
      })}
    </g>
  );
}

/**
 * The shoreline. Three concentric rings of the same hex silhouette are drawn
 * underneath the tiles — sandbank, beach, then the tiles themselves on top.
 * Because every ring is a plain fill with no stroke, the overlapping hexes
 * merge into one island outline instead of showing per-tile seams, and the
 * scalloped edge that falls out of it looks hand-drawn rather than geometric.
 */
function CoastLayer({ tiles, scale }: { tiles: Tile[]; scale: number }) {
  const rings: { factor: number; fill: string; opacity?: number }[] = FLAT
    ? [
        { factor: 1.34, fill: FLAT_SHALLOW, opacity: 0.5 }, // soft light-water halo
        { factor: 1.15, fill: FLAT_SAND }, // sand shore
      ]
    : [
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
  const transform = `translate(${view.x + centerX}, ${view.y + centerY}) scale(${view.scale / 48})`;
  return (
    <defs>
      {FLAT ? (
        <>
          {/* A clean top-to-bottom sea gradient — no pixel noise. */}
          <linearGradient id="seaGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={FLAT_SEA_TOP} />
            <stop offset="100%" stopColor={FLAT_SEA_BOTTOM} />
          </linearGradient>
          {/* Sparse zig-zag "wave" rows over the sea, drifting with the map. */}
          <pattern id="seaZacken" width={ZACKEN_W} height={ZACKEN_H} patternUnits="userSpaceOnUse" patternTransform={transform}>
            {ZACKEN_PATH.map((d, i) => (
              <path key={i} d={d} fill="none" stroke="#bff0f7" strokeWidth={1.1} strokeLinecap="round" opacity={0.5} />
            ))}
          </pattern>
          {/* A light zig-zag hatch — used for desert/unknown and the fallback. */}
          <pattern id="zacken" width={ZACKEN_W} height={ZACKEN_H} patternUnits="userSpaceOnUse" patternTransform={`scale(${view.scale / 48})`}>
            {ZACKEN_PATH.map((d, i) => (
              <path key={i} d={d} fill="none" stroke="#ffffff" strokeWidth={1} strokeLinecap="round" />
            ))}
          </pattern>
          {/* Per-terrain line motifs (trees, stalks, clouds, bricks, rocks). */}
          <FlatMotifPatterns scale={view.scale} />
        </>
      ) : (
        <>
          <WaterPatternTile id="water" transform={transform} />
          <TerrainPatterns scale={view.scale} />
        </>
      )}
      {/* Darkens the edges so the island stays the focus. */}
      <radialGradient id="waterVignette" cx="50%" cy="42%" r="75%">
        <stop offset="0%" stopColor="#0d1b1e" stopOpacity="0" />
        <stop offset="100%" stopColor="#0d1b1e" stopOpacity={FLAT ? 0.28 : 0.5} />
      </radialGradient>
    </defs>
  );
}

function scalePoint(v: VertexId, scale: number) {
  return { x: v.x * scale, y: v.y * scale };
}

// Which terrains get their own line motif; the rest fall back to the zig-zag.
const TERRAIN_MOTIFS = new Set(["wood", "brick", "ore", "wheat", "sheep"]);

/**
 * One faint line-art pattern per land terrain, so a flat field still hints at
 * what it is: little pines on wood, stalks on wheat, clouds on wool, brick
 * coursing on brick, angular rocks on ore. Drawn in a darker shade of the
 * terrain at low opacity, and scaled to the current zoom like the tiles.
 */
function FlatMotifPatterns({ scale }: { scale: number }) {
  const t = `scale(${scale / 48})`;
  const S = 24; // pattern cell size in board units (pre-zoom)
  const common = {
    fill: "none" as const,
    strokeWidth: 1,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    strokeOpacity: 0.4,
  };
  const motif: Record<string, JSX.Element> = {
    // Two little pine trees.
    wood: (
      <g stroke={shade(TERRAIN_COLORS.wood, 0.5)} {...common}>
        <path d="M4 12 L7 5 L10 12 Z" />
        <line x1="7" y1="12" x2="7" y2="15" />
        <path d="M15 21 L18 14 L21 21 Z" />
        <line x1="18" y1="21" x2="18" y2="24" />
      </g>
    ),
    // Brick coursing.
    brick: (
      <g stroke={shade(TERRAIN_COLORS.brick, 0.55)} {...common}>
        <line x1="0" y1="8" x2="24" y2="8" />
        <line x1="0" y1="16" x2="24" y2="16" />
        <line x1="8" y1="0" x2="8" y2="8" />
        <line x1="18" y1="0" x2="18" y2="8" />
        <line x1="3" y1="8" x2="3" y2="16" />
        <line x1="13" y1="8" x2="13" y2="16" />
        <line x1="8" y1="16" x2="8" y2="24" />
        <line x1="18" y1="16" x2="18" y2="24" />
      </g>
    ),
    // A couple of angular rocks.
    ore: (
      <g stroke={shade(TERRAIN_COLORS.ore, 0.5)} {...common}>
        <path d="M3 16 L5 9 L11 10 L13 15 L8 18 Z" />
        <path d="M15 7 L18 3 L22 6 L20 11 L16 10 Z" />
      </g>
    ),
    // Three fanned stalks, twice.
    wheat: (
      <g stroke={shade(TERRAIN_COLORS.wheat, 0.5)} {...common}>
        <path d="M6 16 L4 7 M6 16 L6 6 M6 16 L8 7" />
        <path d="M6 8 L4.5 9 M6 7 L4.5 8 M6 8 L7.5 9 M6 7 L7.5 8" strokeWidth={0.7} />
        <path d="M17 23 L15 14 M17 23 L17 13 M17 23 L19 14" />
      </g>
    ),
    // Little cloud puffs.
    sheep: (
      <g stroke={shade(TERRAIN_COLORS.sheep, 0.5)} {...common}>
        <path d="M3 12 q0 -3 3 -3 q1 -3 4 -2 q3 -1 3 2 q3 0 1 3 Z" />
        <path d="M14 20 q0 -2.5 2.5 -2.5 q1 -2.5 3.5 -1.5 q2.5 -0.5 1 2.5 Z" />
      </g>
    ),
  };
  return (
    <>
      {Array.from(TERRAIN_MOTIFS).map((terrain) => (
        <pattern key={terrain} id={`tex-${terrain}`} width={S} height={S} patternUnits="userSpaceOnUse" patternTransform={t}>
          {motif[terrain]}
        </pattern>
      ))}
    </>
  );
}

/** Darkens a hex colour for outlines and shading, keeping it in the same hue. */
function shade(hex: string, factor: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.round(((n >> 16) & 255) * factor);
  const g = Math.round(((n >> 8) & 255) * factor);
  const b = Math.round((n & 255) * factor);
  return `rgb(${r}, ${g}, ${b})`;
}

/**
 * A settlement (little house) or city (twin-towered keep), drawn as pixel-ish
 * rectangles in the owner's colour with a darker roof and outline. Sits centred
 * on a board vertex; no rotation needed.
 */
function BuildingSprite({ type, cx, cy, size, color }: { type: "settlement" | "city"; cx: number; cy: number; size: number; color: string }) {
  const dark = shade(color, 0.55);
  const roof = shade(color, 0.72);
  const sw = Math.max(1, size * 0.025);
  if (type === "city") {
    // A squat keep with a battlemented top: reads as "bigger/stronger" even small.
    const w = size * 0.42;
    const h = size * 0.26;
    const x = cx - w / 2;
    const y = cy - h * 0.4;
    const m = w / 5; // merlon width — three teeth, two gaps
    return (
      <g stroke={dark} strokeWidth={sw} strokeLinejoin="round">
        <rect x={x} y={y} width={w} height={h} fill={color} />
        {/* battlements */}
        <rect x={x} y={y - m * 0.7} width={m} height={m * 0.8} fill={roof} />
        <rect x={cx - m / 2} y={y - m * 0.7} width={m} height={m * 0.8} fill={roof} />
        <rect x={x + w - m} y={y - m * 0.7} width={m} height={m * 0.8} fill={roof} />
        {/* gate */}
        <rect x={cx - w * 0.12} y={y + h * 0.35} width={w * 0.24} height={h * 0.65} fill={dark} />
      </g>
    );
  }
  // A plain house: square body the same width as its gable roof, no overhang,
  // so it never reads as an arrow.
  const w = size * 0.26;
  const bodyH = size * 0.23;
  const roofH = size * 0.12;
  const x = cx - w / 2;
  const y = cy - bodyH * 0.4;
  return (
    <g stroke={dark} strokeWidth={sw} strokeLinejoin="round">
      <rect x={x} y={y} width={w} height={bodyH} fill={color} />
      <polygon points={`${x - sw},${y + sw} ${cx},${y - roofH} ${x + w + sw},${y + sw}`} fill={shade(color, 0.58)} />
      <rect x={cx - w * 0.17} y={y + bodyH * 0.42} width={w * 0.34} height={bodyH * 0.58} fill={dark} />
    </g>
  );
}

/**
 * A road drawn as a short run of wooden planks in the owner's colour: a dark
 * base gives it an outline, then two lighter fills leave a seam down the middle
 * and cross-ties suggest the boards.
 */
function RoadPlanks({ a, b, size, color }: { a: { x: number; y: number }; b: { x: number; y: number }; size: number; color: string }) {
  const angle = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  const w = Math.max(3, size * 0.11);
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  const dark = shade(color, 0.55);
  const ties = Math.max(2, Math.round(len / (size * 0.28)));
  return (
    <g transform={`translate(${mx}, ${my}) rotate(${angle})`}>
      <rect x={-len / 2} y={-w / 2} width={len} height={w} fill={dark} rx={w * 0.3} />
      <rect x={-len / 2 + w * 0.15} y={-w / 2 + w * 0.15} width={len - w * 0.3} height={w * 0.7} fill={color} rx={w * 0.2} />
      {Array.from({ length: ties - 1 }, (_, i) => {
        const x = -len / 2 + (len / ties) * (i + 1);
        return <rect key={i} x={x - w * 0.06} y={-w / 2} width={w * 0.12} height={w} fill={dark} />;
      })}
    </g>
  );
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
  scouted,
  onClickTile,
  onInspect,
  harvesting,
  harvestKey,
}: {
  tile: Tile;
  center: { x: number; y: number };
  size: number;
  scouted: boolean;
  onClickTile: () => void;
  onInspect?: (info: MapInfo) => void;
  harvesting: boolean;
  harvestKey: string;
}) {
  const points = tilePolygonPoints(center, size * 0.97);
  // A scouted tile shows its terrain only to the player who paid for the look,
  // dimmed and dashed so it stays visibly "not officially uncovered yet".
  const known = tile.revealed || scouted;
  const fill = known
    ? FLAT || !TERRAIN_TEXTURES[tile.terrain]
      ? TERRAIN_COLORS[tile.terrain]
      : `url(#terrain-${tile.terrain})`
    : FLAT
    ? "#22364a"
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
      {/* A faint terrain motif (or zig-zag fallback) gives the flat tile texture. */}
      {FLAT && known &&
        (TERRAIN_MOTIFS.has(tile.terrain) ? (
          <polygon points={points} fill={`url(#tex-${tile.terrain})`} pointerEvents="none" />
        ) : (
          <polygon points={points} fill="url(#zacken)" opacity={0.1} pointerEvents="none" />
        ))}
      {harvesting && (
        <polygon key={harvestKey} className="harvest-pulse" points={points} pointerEvents="none" />
      )}
      {!tile.revealed && !scouted && (
        <text
          x={center.x}
          y={center.y}
          textAnchor="middle"
          dominantBaseline="middle"
          className={`tile-back-glyph ${onInspect ? "inspectable" : ""}`}
          onClick={(e) => {
            if (!onInspect) return;
            e.stopPropagation();
            onInspect({
              title: "Verdecktes Feld",
              text: "Niemand weiß, was hier liegt. Es dreht sich um, sobald eine Siedlung eine seiner Ecken berührt — oder du schickst vorher für 1 Wolle einen Spähtrupp (🔭 in der Bauleiste), dann siehst nur du es.",
            });
          }}
        >
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
      {/* The tile says what it produces, in the same pixel art as the hand —
          upper left so it never fights with the number token. */}
      {tile.revealed && tile.terrain !== "desert" && tile.terrain !== "unknown" && (
        <ResourceSpriteAt
          resource={tile.terrain as ResourceType}
          x={center.x - size * 0.46}
          y={center.y - size * 0.3}
          size={size * 0.38}
        />
      )}
      {tile.revealed && tile.numberRevealed && tile.numberToken !== null && (
        <NumberChipAt value={tile.numberToken} x={center.x} y={center.y} size={size * 0.62} />
      )}
      {tile.revealed && tile.port && <PortBerth tile={tile} center={center} size={size} onInspect={onInspect} />}
    </g>
  );
}

/**
 * A port drawn where it belongs: out on the water beside its tile, not on top
 * of the terrain. The berth sits on the outward side of the coastal edge the
 * port was placed on, with a short jetty back to the shore.
 */
function PortBerth({
  tile,
  center,
  size,
  onInspect,
}: {
  tile: Tile;
  center: { x: number; y: number };
  size: number;
  onInspect?: (info: MapInfo) => void;
}) {
  const port = tile.port;
  if (!port) return null;

  const [a, b] = port.edgeVertices;
  const mid = { x: ((a.x + b.x) / 2) * size, y: ((a.y + b.y) / 2) * size };
  const dx = mid.x - center.x;
  const dy = mid.y - center.y;
  const len = Math.hypot(dx, dy) || 1;
  const berth = { x: mid.x + (dx / len) * size * 0.42, y: mid.y + (dy / len) * size * 0.42 };
  const twoForOne = port.resource !== "any";
  const labelY = berth.y + size * 0.36;

  return (
    <g
      className={onInspect ? "inspectable" : undefined}
      onClick={(e) => {
        if (!onInspect) return;
        e.stopPropagation();
        onInspect(
          twoForOne
            ? {
                title: `Hafen 2:1 (${TERRAIN_NAMES_DE[port.resource as ResourceType]})`,
                text: `Baust du eine Siedlung an diese Küste, tauschst du hier 2 ${TERRAIN_NAMES_DE[port.resource as ResourceType]} gegen 1 beliebigen Rohstoff.`,
              }
            : {
                title: "Hafen 3:1",
                text: "Baust du eine Siedlung an diese Küste, darfst du hier 3 gleiche Rohstoffe gegen 1 beliebigen tauschen — statt der üblichen 4:1 bei der Bank.",
              },
        );
      }}
    >
      {/* Two mooring lines, one to each corner of the port's edge: those are
          exactly the two spots where a settlement gets to use the harbour. */}
      {[a, b].map((v, i) => (
        <line
          key={i}
          x1={v.x * size}
          y1={v.y * size}
          x2={berth.x}
          y2={berth.y}
          stroke="#8a4e15"
          strokeWidth={Math.max(1.5, size * 0.05)}
          strokeLinecap="round"
        />
      ))}
      {[a, b].map((v, i) => (
        <circle key={`dot${i}`} cx={v.x * size} cy={v.y * size} r={Math.max(1.5, size * 0.06)} fill="#8a4e15" />
      ))}
      <ShipSpriteAt x={berth.x} y={berth.y} size={size * 0.46} />
      {twoForOne && (
        <ResourceSpriteAt resource={port.resource as ResourceType} x={berth.x - size * 0.2} y={labelY} size={size * 0.26} />
      )}
      <text
        x={twoForOne ? berth.x + size * 0.12 : berth.x}
        y={labelY}
        textAnchor="middle"
        dominantBaseline="central"
        className="port-label"
        fontSize={size * 0.26}
      >
        {port.ratio}:1
      </text>
    </g>
  );
}
