import { ResourceType } from "@canos/shared";

/**
 * Hand-drawn 10x10 resource sprites in the flat, high-contrast style of the
 * old Game Boy Advance Pokémon games (FireRed/LeafGreen). Everything here is
 * self-created pixel art — no external assets — so it ships with the project
 * and scales cleanly to any icon size.
 *
 * Each sprite is a list of rows; every character maps to a colour in the
 * sprite's own palette, "." means transparent.
 */
interface Sprite {
  palette: Record<string, string>;
  rows: string[];
}

const SPRITES: Record<ResourceType, Sprite> = {
  // Log seen from the side: end grain rings on the left, bark to the right.
  wood: {
    palette: { O: "#3a2412", r: "#c99a63", R: "#8a5a2b", L: "#6b3f1d", l: "#7f4d24" },
    rows: [
      "..........",
      "..OOOOOOO.",
      ".OrRrOllLO",
      "OrRRRrOLLO",
      "OrRRRrOLlO",
      "OrRRRrOLLO",
      ".OrRrOllLO",
      "..OOOOOOO.",
      "..........",
      "..........",
    ],
  },
  // Staggered brickwork with pale mortar joints.
  brick: {
    palette: { O: "#4a1d0e", B: "#b5482a", b: "#d4694a", M: "#7a2f18" },
    rows: [
      "..........",
      ".OOOOOOOO.",
      ".ObBBMBBBO",
      ".OBBBMBbBO",
      ".OMMMMMMMO",
      ".OBMBbBBBO",
      ".ObMBBBBBO",
      ".OOOOOOOOO",
      "..........",
      "..........",
    ],
  },
  // Rough ore chunk with a bright facet and a glint.
  ore: {
    palette: { O: "#2f3439", l: "#aeb8bf", m: "#7d878f", d: "#565f66", s: "#e8f1f7" },
    rows: [
      "..........",
      "....OO....",
      "...OllO...",
      "..OlsmmO..",
      ".OlmmmddO.",
      "OlmmmdddO.",
      "OmmmdddddO",
      ".OmdddddO.",
      "..OOOOOO..",
      "..........",
    ],
  },
  // Ear of wheat on a green stem with two leaves.
  wheat: {
    palette: { O: "#6b4a10", G: "#e8c15a", g: "#f7e2a8", S: "#8fa832", L: "#b7cc57" },
    rows: [
      "....OO....",
      "...OGGO...",
      "...OgGO...",
      "..OGGGGO..",
      "..OGgGGO..",
      "..OGGgGO..",
      "...OSSO...",
      ".OLLSSLLO.",
      "...OSSO...",
      "...OSSO...",
    ],
  },
  // Ball of wool with a swirl.
  sheep: {
    palette: { O: "#4a4a52", W: "#f2f2ec", s: "#cfd0c8" },
    rows: [
      "..........",
      "...OOOO...",
      "..OWWWWO..",
      ".OWWssWWO.",
      "OWsWWWsWWO",
      "OWsWWsWWWO",
      "OWWsssWWWO",
      ".OWWWWWWO.",
      "..OWWWWO..",
      "...OOOO...",
    ],
  },
};

/** Merges each row into horizontal runs so a sprite is ~20 rects, not 100. */
function spriteRects(sprite: Sprite) {
  const rects: { x: number; y: number; w: number; fill: string }[] = [];
  sprite.rows.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      const ch = row[x];
      let w = 1;
      while (x + w < row.length && row[x + w] === ch) w++;
      const fill = sprite.palette[ch];
      if (fill) rects.push({ x, y, w, fill });
      x += w;
    }
  });
  return rects;
}

const RECTS: Record<ResourceType, ReturnType<typeof spriteRects>> = {
  wood: spriteRects(SPRITES.wood),
  brick: spriteRects(SPRITES.brick),
  ore: spriteRects(SPRITES.ore),
  wheat: spriteRects(SPRITES.wheat),
  sheep: spriteRects(SPRITES.sheep),
};

/** The three figures that can sit on a tile, in the same 10x10 style. */
export type MarkerKind = "robber" | "boost" | "bribery";

const MARKER_SPRITES: Record<MarkerKind, Sprite> = {
  // Hooded thief with a bright pair of eyes.
  robber: {
    palette: { O: "#0b0f14", h: "#2b3a4a", H: "#46586b", e: "#f1faee" },
    rows: [
      "...OOOO...",
      "..OhHHhO..",
      ".OhHHHHhO.",
      ".OhhhhhhO.",
      ".OheOOehO.",
      ".OhhhhhhO.",
      "OhhhhhhhhO",
      "OhHhhhhHhO",
      "OhhhhhhhhO",
      ".OOOOOOOO.",
    ],
  },
  // Four-pointed sparkle for the boost figure.
  boost: {
    palette: { O: "#8a6d1f", Y: "#fff3b0", y: "#f4d35e" },
    rows: [
      "....OO....",
      "...OyyO...",
      "..OyYYyO..",
      ".OyYYYYyO.",
      "OyYYYYYYyO",
      "OyYYYYYYyO",
      ".OyYYYYyO.",
      "..OyYYyO..",
      "...OyyO...",
      "....OO....",
    ],
  },
  // Money bag for the bribed tile.
  bribery: {
    palette: { O: "#4a2f10", b: "#d9a441", B: "#f2d478", t: "#8a5a2b" },
    rows: [
      "....OO....",
      "...OttO...",
      "..OtttO...",
      ".ObbbbbbO.",
      "ObbbBBbbbO",
      "ObbBBBBbbO",
      "ObbbBBbbbO",
      ".ObbbbbbO.",
      "..OOOOOO..",
      "..........",
    ],
  },
};

const MARKER_RECTS: Record<MarkerKind, ReturnType<typeof spriteRects>> = {
  robber: spriteRects(MARKER_SPRITES.robber),
  boost: spriteRects(MARKER_SPRITES.boost),
  bribery: spriteRects(MARKER_SPRITES.bribery),
};

// A little sailing boat moored next to a port tile.
const SHIP = spriteRects({
  palette: { O: "#25313d", m: "#5a3a1a", S: "#f1faee", s: "#c9d6de", h: "#8a4e15" },
  rows: [
    "..........",
    "....m.....",
    "....mSS...",
    "....mSSs..",
    "....mSSSs.",
    "....mSSSs.",
    "....m.....",
    "OhhhhhhhhO",
    ".OhhhhhhO.",
    "..OOOOOO..",
  ],
});

export function ShipSpriteAt({ x, y, size }: { x: number; y: number; size: number }) {
  return (
    <g transform={`translate(${x - size / 2}, ${y - size / 2}) scale(${size / 10})`} shapeRendering="crispEdges">
      {SHIP.map((r, i) => (
        <rect key={i} x={r.x} y={r.y} width={r.w} height={1} fill={r.fill} />
      ))}
    </g>
  );
}

export function MarkerSpriteAt({ kind, x, y, size }: { kind: MarkerKind; x: number; y: number; size: number }) {
  return (
    <g transform={`translate(${x - size / 2}, ${y - size / 2}) scale(${size / 10})`} shapeRendering="crispEdges">
      {MARKER_RECTS[kind].map((r, i) => (
        <rect key={i} x={r.x} y={r.y} width={r.w} height={1} fill={r.fill} />
      ))}
    </g>
  );
}

// --- Number chips -----------------------------------------------------------
// A 3x5 pixel digit font, the smallest size where every digit still reads.
const DIGITS: Record<string, string[]> = {
  "0": ["111", "101", "101", "101", "111"],
  "1": ["010", "110", "010", "010", "111"],
  "2": ["111", "001", "111", "100", "111"],
  "3": ["111", "001", "111", "001", "111"],
  "4": ["101", "101", "111", "001", "001"],
  "5": ["111", "100", "111", "001", "111"],
  "6": ["111", "100", "111", "101", "111"],
  "7": ["111", "001", "010", "010", "010"],
  "8": ["111", "101", "111", "101", "111"],
  "9": ["111", "101", "111", "001", "111"],
};

const CHIP_GRID = 16;

/** Row spans of a pixel circle — the stepped edge is what sells the 8-bit look. */
function circleSpans(grid: number, radius: number): [number, number][] {
  const c = grid / 2;
  const spans: [number, number][] = [];
  for (let y = 0; y < grid; y++) {
    const dy = y + 0.5 - c;
    const half = Math.sqrt(Math.max(0, radius * radius - dy * dy));
    const from = Math.round(c - half);
    const to = Math.round(c + half);
    spans.push([from, Math.max(from, to)]);
  }
  return spans;
}

const CHIP_OUTER = circleSpans(CHIP_GRID, 8);
const CHIP_INNER = circleSpans(CHIP_GRID, 6.6);

/**
 * A pixel-art number token: stepped circle, dark rim, the number in a 3x5
 * font and the classic pip row underneath (more pips = more likely). 6 and 8
 * stay red, exactly like on the cardboard chips.
 */
export function NumberChipAt({ value, x, y, size }: { value: number; x: number; y: number; size: number }) {
  const hot = value === 6 || value === 8;
  const ink = hot ? "#c1121f" : "#1b263b";
  const digits = String(value).split("");
  const textW = digits.length * 3 + (digits.length - 1); // 1px gap between digits
  const textX = Math.round((CHIP_GRID - textW) / 2);
  const textY = 4;
  const pips = 6 - Math.abs(7 - value);
  const pipY = 10;
  const pipX = Math.round((CHIP_GRID - (pips * 2 - 1)) / 2);

  return (
    <g transform={`translate(${x - size / 2}, ${y - size / 2}) scale(${size / CHIP_GRID})`} shapeRendering="crispEdges">
      {CHIP_OUTER.map(([from, to], row) =>
        to > from ? <rect key={`o${row}`} x={from} y={row} width={to - from} height={1} fill="#2b2118" /> : null,
      )}
      {CHIP_INNER.map(([from, to], row) =>
        to > from ? <rect key={`i${row}`} x={from} y={row} width={to - from} height={1} fill="#f4ecd8" /> : null,
      )}
      {/* A one-pixel shade along the lower edge gives the token some relief. */}
      {CHIP_INNER.slice(11).map(([from, to], i) =>
        to > from ? <rect key={`s${i}`} x={from} y={11 + i} width={to - from} height={1} fill="#dccdae" /> : null,
      )}
      {digits.flatMap((digit, di) =>
        DIGITS[digit].flatMap((row, ry) =>
          row.split("").map((cell, rx) =>
            cell === "1" ? (
              <rect key={`d${di}-${ry}-${rx}`} x={textX + di * 4 + rx} y={textY + ry} width={1} height={1} fill={ink} />
            ) : null,
          ),
        ),
      )}
      {Array.from({ length: pips }, (_, i) => (
        <rect key={`p${i}`} x={pipX + i * 2} y={pipY} width={1} height={1} fill={ink} />
      ))}
    </g>
  );
}

/**
 * The same sprite, but as a plain <g> for use inside an existing SVG (the game
 * board), centred on (x, y) so it can be dropped onto a hex tile.
 */
export function ResourceSpriteAt({ resource, x, y, size }: { resource: ResourceType; x: number; y: number; size: number }) {
  return (
    <g transform={`translate(${x - size / 2}, ${y - size / 2}) scale(${size / 10})`} shapeRendering="crispEdges">
      {RECTS[resource].map((r, i) => (
        <rect key={i} x={r.x} y={r.y} width={r.w} height={1} fill={r.fill} />
      ))}
    </g>
  );
}

export function ResourceSprite({ resource, size = 24 }: { resource: ResourceType; size?: number }) {
  return (
    <svg
      className="pixel-sprite"
      width={size}
      height={size}
      viewBox="0 0 10 10"
      shapeRendering="crispEdges"
      aria-hidden="true"
      focusable="false"
    >
      {RECTS[resource].map((r, i) => (
        <rect key={i} x={r.x} y={r.y} width={r.w} height={1} fill={r.fill} />
      ))}
    </svg>
  );
}
