/**
 * The wordmark in the classic engraved-serif style of old strategy-game logos:
 * a small italic top line flanked by rules, and a big beveled title with a
 * metallic gold→brown gradient. Drawn as SVG with a serif system font, so it
 * needs no font files and scales crisply.
 */
export function EngravedTitle({ top = "Canos", main = "INCOGNITA" }: { top?: string; main?: string }) {
  return (
    <svg
      className="engraved-title"
      viewBox="0 0 460 150"
      width="100%"
      role="img"
      aria-label={`${top} ${main}`}
    >
      <defs>
        {/* Light gold at the top edge, deep brown at the base — the metal sheen. */}
        <linearGradient id="et-gold" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#fdf6cf" />
          <stop offset="16%" stopColor="#f4dc82" />
          <stop offset="44%" stopColor="#cf9a2c" />
          <stop offset="72%" stopColor="#8a5416" />
          <stop offset="100%" stopColor="#43270b" />
        </linearGradient>
        <linearGradient id="et-rule" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#8a5416" stopOpacity="0" />
          <stop offset="50%" stopColor="#e7c766" />
          <stop offset="100%" stopColor="#8a5416" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* Top line: two thin rules on each side of a small italic word. */}
      <g>
        {[30, 34].map((y) => (
          <line key={`l${y}`} x1="72" y1={y} x2="188" y2={y} stroke="url(#et-rule)" strokeWidth="1.6" />
        ))}
        {[30, 34].map((y) => (
          <line key={`r${y}`} x1="272" y1={y} x2="388" y2={y} stroke="url(#et-rule)" strokeWidth="1.6" />
        ))}
        <text
          x="230"
          y="36"
          textAnchor="middle"
          fontFamily="Georgia, 'Times New Roman', serif"
          fontStyle="italic"
          fontSize="26"
          fill="url(#et-gold)"
          stroke="#2e1808"
          strokeWidth="0.4"
        >
          {top}
        </text>
      </g>

      {/* Main title: a dark drop-shadow copy for depth, then the gilded face. */}
      <g fontFamily="Georgia, 'Times New Roman', serif" fontWeight="700" fontSize="66" textAnchor="middle" letterSpacing="1">
        <text x="231" y="120" fill="#1c0f04">
          {main}
        </text>
        <text x="230" y="118" fill="url(#et-gold)" stroke="#2e1808" strokeWidth="1">
          {main}
        </text>
      </g>
    </svg>
  );
}
