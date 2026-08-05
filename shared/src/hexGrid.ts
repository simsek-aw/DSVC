// Axial hex coordinates, flat-top orientation.
export interface AxialCoord {
  q: number;
  r: number;
}

export function axialKey(c: AxialCoord): string {
  return `${c.q},${c.r}`;
}

export function axialEquals(a: AxialCoord, b: AxialCoord): boolean {
  return a.q === b.q && a.r === b.r;
}

const FLAT_TOP_DIRECTIONS: AxialCoord[] = [
  { q: 1, r: 0 },
  { q: 1, r: -1 },
  { q: 0, r: -1 },
  { q: -1, r: 0 },
  { q: -1, r: 1 },
  { q: 0, r: 1 },
];

export function axialNeighbors(c: AxialCoord): AxialCoord[] {
  return FLAT_TOP_DIRECTIONS.map((d) => ({ q: c.q + d.q, r: c.r + d.r }));
}

export function axialDistance(a: AxialCoord, b: AxialCoord): number {
  const dq = a.q - b.q;
  const dr = a.r - b.r;
  return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
}

// Pixel center of a flat-top hex tile for a given size (distance center-to-corner).
export function axialToPixel(c: AxialCoord, size: number): { x: number; y: number } {
  const x = size * ((3 / 2) * c.q);
  const y = size * ((Math.sqrt(3) / 2) * c.q + Math.sqrt(3) * c.r);
  return { x, y };
}

export function hexCorners(center: { x: number; y: number }, size: number): { x: number; y: number }[] {
  const corners: { x: number; y: number }[] = [];
  for (let i = 0; i < 6; i++) {
    const angleDeg = 60 * i;
    const angleRad = (Math.PI / 180) * angleDeg;
    corners.push({
      x: center.x + size * Math.cos(angleRad),
      y: center.y + size * Math.sin(angleRad),
    });
  }
  return corners;
}

// A vertex (settlement/city spot) is identified by the 2-3 tiles that share it,
// represented canonically by rounding pixel position to avoid float drift.
export interface VertexId {
  x: number;
  y: number;
}

export function vertexKey(v: VertexId): string {
  return `${Math.round(v.x * 100)},${Math.round(v.y * 100)}`;
}

// An edge (road spot) is identified by its two endpoint vertices, order-independent.
export interface EdgeId {
  a: VertexId;
  b: VertexId;
}

export function edgeKey(e: EdgeId): string {
  const ka = vertexKey(e.a);
  const kb = vertexKey(e.b);
  return ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
}

export function tileVertices(c: AxialCoord, size: number): VertexId[] {
  return hexCorners(axialToPixel(c, size), size);
}

export function tileEdges(c: AxialCoord, size: number): EdgeId[] {
  const verts = tileVertices(c, size);
  const edges: EdgeId[] = [];
  for (let i = 0; i < 6; i++) {
    edges.push({ a: verts[i], b: verts[(i + 1) % 6] });
  }
  return edges;
}
