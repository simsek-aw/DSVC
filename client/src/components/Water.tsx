// Hand-built pixel-art sea in the FireRed/LeafGreen vein: a saturated mid-blue
// crossed by continuous horizontal ripple lines that step up and down in a
// square wave. Drawn from scratch, so it ships with the project.
//
// It lives in its own module because two very different screens use it: the
// board (where it pans and zooms with the map) and the lobby (where it is a
// still backdrop behind the logo).

export const WATER_BASE = "#3878d0";
export const WATER_DEEP = "#2a5cab";
export const WATER_CREST = "#79b4ec";
export const WATER_FOAM = "#c6e4ff";

export const WATER_CELL = 4; // px per pixel-art cell
export const WATER_GRID = 16; // cells per tile edge
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
    out.push(<rect key={`${key}-${k}`} x={x * cell} y={y * cell} width={WAVE_STEP * cell} height={cell} fill={WATER_CREST} />);
    if (bright) {
      // A shorter, brighter glint sitting on top of the run.
      out.push(
        <rect key={`${key}-${k}-g`} x={(x + 1) * cell} y={y * cell} width={2 * cell} height={cell / 2} fill={WATER_FOAM} />,
      );
    }
    // Shadow tucked just beneath the crest gives the line some body.
    out.push(
      <rect key={`${key}-${k}-s`} x={x * cell} y={(y + 1) * cell} width={WAVE_STEP * cell} height={cell / 2} fill={WATER_DEEP} />,
    );
  }
  return out;
}

/** The repeating sea tile, as an SVG <pattern> for a caller's <defs>. */
export function WaterPatternTile({ id, transform }: { id: string; transform?: string }) {
  const size = WATER_GRID * WATER_CELL;
  return (
    <pattern id={id} width={size} height={size} patternUnits="userSpaceOnUse" patternTransform={transform}>
      <rect width={size} height={size} fill={WATER_BASE} />
      {WAVE_ROWS.map(([yTop, phase, bright], i) => rippleRects(yTop, phase, bright, i, WATER_CELL))}
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
          <stop offset="100%" stopColor="#0d1b1e" stopOpacity="0.75" />
        </radialGradient>
      </defs>
      <rect width="100%" height="100%" fill="url(#water-backdrop-tile)" />
      <rect width="100%" height="100%" fill="url(#water-backdrop-vignette)" />
    </svg>
  );
}
