// Bright turquoise pixel-art sea with a white diagonal net, in the spirit of
// classic top-down RPG water. Drawn from scratch as a seamless 16x16 tile, so
// it ships with the project and tiles without seams (period-8 diagonals inside
// a 16-cell tile, dashes keyed on even columns/rows — both wrap cleanly).
//
// It lives in its own module because two very different screens use it: the
// board (where it pans and zooms with the map) and the lobby (still backdrop).

export const WATER_BASE = "#18bdd6"; // cyan base
export const WATER_LIGHT = "#41cfe1"; // gently lighter patches
export const WATER_DEEP = "#14b0c9"; // gently darker patches
export const WATER_FOAM = "#ffffff"; // white sparkle crests

export const WATER_CELL = 5; // px per pixel-art cell — chunky, like the reference
export const WATER_GRID = 64; // cells per tile edge — big tile, so the repeat barely shows

type Cell = { x: number; y: number; fill: string };

// Deterministic value in [0,1) from a cell. Because inputs are always taken
// mod WATER_GRID, the noise repeats exactly at the tile edge, so the tile
// stays seamless while still looking irregular rather than a mechanical grid.
function hash(x: number, y: number): number {
  let h = (Math.imul(x & 255, 374761393) + Math.imul(y & 255, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

const PERIOD = 8; // diamond size; divides the 32-grid so the tile stays seamless

/**
 * Colour for one cell: a bold white diamond net (2px lines) with lighter
 * diamond interiors over a cyan base — the reference pattern — but the net is
 * broken up by a deterministic hash so it reads as water, not a rigid grid.
 */
function cellFill(x: number, y: number): string {
  const d1 = (x + y) % PERIOD; // along one diagonal
  const d2 = (((x - y) % PERIOD) + PERIOD) % PERIOD; // along the other
  const onNet = d1 <= 1 || d2 <= 1; // 2px-thick diamond outlines

  if (onNet) {
    // Keep most of the net white, but drop ~30% of it to little gaps so the
    // lines look hand-drawn and drifting rather than perfectly ruled.
    return hash(x, y) > 0.3 ? WATER_FOAM : WATER_DEEP;
  }
  const near1 = Math.min(d1, PERIOD - d1);
  const near2 = Math.min(d2, PERIOD - d2);
  if (near1 >= 3 && near2 >= 3) return WATER_LIGHT; // bright diamond interiors
  return WATER_BASE;
}

/** Merge each row into horizontal runs so the tile is a handful of rects. */
function waterRects(): Cell[] {
  const cells: Cell[] = [];
  for (let y = 0; y < WATER_GRID; y++) {
    let x = 0;
    while (x < WATER_GRID) {
      const fill = cellFill(x, y);
      let w = 1;
      while (x + w < WATER_GRID && cellFill(x + w, y) === fill) w++;
      cells.push({ x, y, fill, ...({ w } as any) });
      x += w;
    }
  }
  return cells as (Cell & { w: number })[];
}

const WATER_RECTS = waterRects() as (Cell & { w: number })[];

/** The repeating sea tile, as an SVG <pattern> for a caller's <defs>. */
export function WaterPatternTile({ id, transform }: { id: string; transform?: string }) {
  const size = WATER_GRID * WATER_CELL;
  return (
    <pattern id={id} width={size} height={size} patternUnits="userSpaceOnUse" patternTransform={transform}>
      <rect width={size} height={size} fill={WATER_BASE} />
      {WATER_RECTS.map((c, i) => (
        <rect key={i} x={c.x * WATER_CELL} y={c.y * WATER_CELL} width={c.w * WATER_CELL} height={WATER_CELL} fill={c.fill} />
      ))}
    </pattern>
  );
}

/** Full-bleed sea for screens outside the board (lobby, waiting room). */
export function WaterBackdrop() {
  return (
    <svg className="water-backdrop" aria-hidden="true">
      <defs>
        <WaterPatternTile id="water-backdrop-tile" transform="scale(1.6)" />
        <radialGradient id="water-backdrop-vignette" cx="50%" cy="40%" r="80%">
          <stop offset="0%" stopColor="#0d1b1e" stopOpacity="0.05" />
          <stop offset="100%" stopColor="#0d1b1e" stopOpacity="0.7" />
        </radialGradient>
      </defs>
      <rect width="100%" height="100%" fill="url(#water-backdrop-tile)" />
      <rect width="100%" height="100%" fill="url(#water-backdrop-vignette)" />
    </svg>
  );
}
