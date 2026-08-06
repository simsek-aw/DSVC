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
export const WATER_GRID = 32; // cells per tile edge — bigger tile hides the repeat

type Cell = { x: number; y: number; fill: string };

// Deterministic value in [0,1) from a cell. Because inputs are always taken
// mod WATER_GRID, the noise repeats exactly at the tile edge, so the tile
// stays seamless while still looking irregular rather than a mechanical grid.
function hash(x: number, y: number): number {
  let h = (Math.imul(x & 255, 374761393) + Math.imul(y & 255, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

/**
 * Colour for one cell: a cyan base with soft blocky patches of lighter and
 * darker water, plus white "sparkle" pixels scattered mostly along broken
 * diagonals — the flowing-net look of the reference, without the rigid lattice.
 */
function cellFill(x: number, y: number): string {
  // Low-frequency patches (4x4 blocks) decide the base shade of the water.
  const patch = hash(x >> 2, y >> 2);
  let fill = WATER_BASE;
  if (patch > 0.72) fill = WATER_LIGHT;
  else if (patch < 0.16) fill = WATER_DEEP;

  // Sparkles: mostly along gentle diagonals so the white reads as a few
  // drifting crests, with only the odd stray fleck off them.
  const onDiag = (x + y) % 6 < 2 || (((x - y) % 6) + 6) % 6 < 2;
  const h = hash(x, y);
  if ((onDiag && h > 0.78) || h > 0.965) fill = WATER_FOAM;
  return fill;
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
