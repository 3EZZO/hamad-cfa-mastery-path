import { useId } from "react";

/* Original Mastery Path crest: shield, laurel and "MP" monogram. It borrows no
   national, state or institutional symbol. Motion lives in identity.css and
   only runs when the document is in depth mode. */
const SHIELD = "M32 3 58 11v22c0 17-12 29-26 36C18 62 6 50 6 33V11Z";
const INNER = "M32 7.5 54 14.3v18.5c0 14.6-10 25-22 31.5-12-6.5-22-16.9-22-31.5V14.3Z";
const LEAVES: [number, number, number][] = [[19, 57, -42], [15, 50.5, -26], [13, 43.5, -10], [13, 36.5, 6], [15, 29.5, 22]];

export function Crest({ size = 40, animated = false, className }: { size?: number; animated?: boolean; className?: string }) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, "");
  const gold = `url(#${id}g)`;
  return (
    <svg
      className={["crest", animated && "crest--animated", className].filter(Boolean).join(" ")}
      width={size}
      height={Math.round((size * 72) / 64)}
      viewBox="0 0 64 72"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id={`${id}g`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#f6e2a8" />
          <stop offset=".5" stopColor="#d2ab55" />
          <stop offset="1" stopColor="#8f6a1c" />
        </linearGradient>
        <linearGradient id={`${id}s`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#fff" stopOpacity="0" />
          <stop offset=".5" stopColor="#fff" stopOpacity=".5" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <clipPath id={`${id}c`}><path d={SHIELD} /></clipPath>
      </defs>
      <path d={SHIELD} fill="#0f1a33" stroke={gold} strokeWidth="2.5" strokeLinejoin="round" />
      <path d={INNER} fill="none" stroke={gold} strokeWidth=".8" opacity=".7" />
      <path d="M32 12.5 35 17.5 32 22.5 29 17.5Z" fill={gold} />
      <g fill={gold}>
        {LEAVES.map(([x, y, r]) => (
          <g key={`${x}-${y}`}>
            <ellipse cx={x} cy={y} rx="2.1" ry="4.4" transform={`rotate(${r} ${x} ${y})`} />
            <ellipse cx={64 - x} cy={y} rx="2.1" ry="4.4" transform={`rotate(${-r} ${64 - x} ${y})`} />
          </g>
        ))}
      </g>
      <text x="32" y="44" textAnchor="middle" fontFamily="'Source Serif 4', Georgia, serif" fontWeight="600" fontSize="18" fill={gold}>MP</text>
      <g clipPath={`url(#${id}c)`}>
        <g transform="skewX(-18)">
          <rect className="crest__sheen" x="-30" y="0" width="22" height="72" fill={`url(#${id}s)`} />
        </g>
      </g>
    </svg>
  );
}
