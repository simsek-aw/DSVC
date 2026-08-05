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

export type BuildMode = null | "road" | "settlement" | "city" | "knight" | "bribery" | "roadBuilding";

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
};

function tilePolygonPoints(center: { x: number; y: number }, size: number): string {
  return hexCorners(center, size)
    .map((c) => `${c.x},${c.y}`)
    .join(" ");
}

export function HexBoard({ state, myPlayerId, buildMode, sendAction, freeRoadEdges, onSelectFreeRoadEdge }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [view, setView] = useState({ scale: 48, x: 0, y: 0 });
  const dragRef = useRef<{ startX: number; startY: number; viewX: number; viewY: number } | null>(null);
  const pinchRef = useRef<{ startDist: number; startScale: number } | null>(null);

  const graph = useMemo(() => buildBoardGraph(state.tiles, TILE_SIZE), [state.tiles]);

  const onPointerDown = (e: React.PointerEvent) => {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    dragRef.current = { startX: e.clientX, startY: e.clientY, viewX: view.x, viewY: view.y };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragRef.current) return;
    // Stop the browser from also treating this as a page-scroll/swipe gesture
    // (belt-and-suspenders alongside the CSS touch-action: none below).
    e.preventDefault();
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    setView((v) => ({ ...v, x: dragRef.current!.viewX + dx, y: dragRef.current!.viewY + dy }));
  };
  const onPointerUp = () => {
    dragRef.current = null;
  };
  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    setView((v) => ({ ...v, scale: Math.min(120, Math.max(20, v.scale - e.deltaY * 0.05)) }));
  };

  // Pinch-to-zoom for touch devices.
  const touchDistance = (touches: React.TouchList) => {
    const [a, b] = [touches[0], touches[1]];
    return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
  };
  const onTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      pinchRef.current = { startDist: touchDistance(e.touches), startScale: view.scale };
    }
  };
  const onTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2 && pinchRef.current) {
      e.preventDefault();
      const dist = touchDistance(e.touches);
      const ratio = dist / pinchRef.current.startDist;
      setView((v) => ({ ...v, scale: Math.min(120, Math.max(20, pinchRef.current!.startScale * ratio)) }));
    }
  };
  const onTouchEnd = () => {
    pinchRef.current = null;
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
    }
  };

  return (
    <svg
      ref={svgRef}
      className="hex-board"
      style={{ touchAction: "none" }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerLeave={onPointerUp}
      onWheel={onWheel}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
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
  onClickTile,
}: {
  tile: Tile;
  center: { x: number; y: number };
  size: number;
  isBribed: boolean;
  onClickTile: () => void;
}) {
  const points = tilePolygonPoints(center, size * 0.97);
  const fill = tile.revealed ? TERRAIN_COLORS[tile.terrain] : "#1b263b";

  return (
    <g onClick={onClickTile} className="tile-group">
      <polygon points={points} fill={fill} stroke="#0d1b1e" strokeWidth={1.5} />
      {!tile.revealed && (
        <text x={center.x} y={center.y} textAnchor="middle" dominantBaseline="middle" className="tile-back-glyph">
          ?
        </text>
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
