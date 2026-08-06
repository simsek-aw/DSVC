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
