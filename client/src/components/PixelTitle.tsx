/**
 * The game's wordmark, drawn as pixels rather than set in a font: every glyph
 * is a 5x7 grid, and each lit cell gets a black outline on the sides that face
 * empty space. That outline is what gives it the chunky arcade look and keeps
 * it readable on top of the water.
 *
 * Only the letters the title needs are defined — extend GLYPHS if the wordmark
 * ever changes.
 */
const GLYPHS: Record<string, string[]> = {
  A: ["01110", "11011", "11011", "11111", "11011", "11011", "11011"],
  C: ["01110", "11011", "11000", "11000", "11000", "11011", "01110"],
  G: ["01110", "11011", "11000", "10111", "11011", "11011", "01111"],
  I: ["11111", "00100", "00100", "00100", "00100", "00100", "11111"],
  N: ["11011", "11011", "11111", "11111", "11111", "11011", "11011"],
  O: ["01110", "11011", "11011", "11011", "11011", "11011", "01110"],
  S: ["01111", "11000", "11000", "01110", "00011", "00011", "11110"],
  T: ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
  " ": ["00000", "00000", "00000", "00000", "00000", "00000", "00000"],
};

const GLYPH_W = 5;
const GLYPH_H = 7;
const GAP = 1; // empty column between letters

/** Lit cells of a whole word, in grid coordinates. */
function wordCells(word: string): { cells: [number, number][]; width: number } {
  const cells: [number, number][] = [];
  let x = 0;
  for (const char of word.toUpperCase()) {
    const glyph = GLYPHS[char];
    if (glyph) {
      glyph.forEach((row, y) => {
        row.split("").forEach((cell, gx) => {
          if (cell === "1") cells.push([x + gx, y]);
        });
      });
    }
    x += GLYPH_W + GAP;
  }
  return { cells, width: Math.max(0, x - GAP) };
}

const NEIGHBOURS: [number, number][] = [
  [-1, -1], [0, -1], [1, -1],
  [-1, 0], [1, 0],
  [-1, 1], [0, 1], [1, 1],
];

function WordRow({ word, cell, y }: { word: string; cell: number; y: number }) {
  const { cells } = wordCells(word);
  const lit = new Set(cells.map(([x, cy]) => `${x},${cy}`));
  const outline = new Set<string>();
  for (const [x, cy] of cells) {
    for (const [dx, dy] of NEIGHBOURS) {
      const key = `${x + dx},${cy + dy}`;
      if (!lit.has(key)) outline.add(key);
    }
  }
  return (
    <g transform={`translate(0, ${y})`}>
      {Array.from(outline).map((key) => {
        const [x, cy] = key.split(",").map(Number);
        return <rect key={`o${key}`} x={x * cell} y={cy * cell} width={cell} height={cell} fill="#0d1b1e" />;
      })}
      {cells.map(([x, cy]) => (
        <rect key={`l${x},${cy}`} x={x * cell} y={cy * cell} width={cell} height={cell} fill="#f1faee" />
      ))}
    </g>
  );
}

/**
 * Two stacked words that end up the same width, so the shorter line simply
 * gets bigger pixels — the classic stacked-logo look.
 */
export function PixelTitle({ lines, width = 320 }: { lines: [string, string]; width?: number }) {
  const rows = lines.map((word) => {
    const { width: cols } = wordCells(word);
    return { word, cols, cell: width / (cols + 2) }; // +2 keeps the outline inside the box
  });
  const gapPx = rows[0].cell * 1.2;
  const heights = rows.map((r) => r.cell * (GLYPH_H + 2));
  const totalHeight = heights[0] + gapPx + heights[1];

  let y = rows[0].cell; // room for the outline above the first row
  return (
    <svg
      className="pixel-title"
      viewBox={`0 0 ${width} ${totalHeight}`}
      width="100%"
      shapeRendering="crispEdges"
      role="img"
      aria-label={lines.join(" ")}
    >
      {rows.map((row, i) => {
        const offsetX = (width - row.cols * row.cell) / 2;
        const rowY = y;
        y += heights[i] + (i === 0 ? gapPx - row.cell : 0);
        return (
          <g key={row.word} transform={`translate(${offsetX}, 0)`}>
            <WordRow word={row.word} cell={row.cell} y={rowY} />
          </g>
        );
      })}
    </svg>
  );
}
