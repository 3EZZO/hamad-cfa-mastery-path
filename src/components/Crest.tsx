import { useId } from "react";

/* Mastery Path mark: an "MP" monogram on a navy tile with a gold frame. It
   borrows no national, state or institutional symbol. Motion lives in
   identity.css and only runs when the document is in depth mode. */
export function Crest({ size = 40, animated = false, className }: { size?: number; animated?: boolean; className?: string }) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, "");
  const gold = `url(#${id}g)`;
  return (
    <svg
      className={["crest", animated && "crest--animated", className].filter(Boolean).join(" ")}
      width={size}
      height={size}
      viewBox="0 0 64 64"
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
          <stop offset=".5" stopColor="#fff" stopOpacity=".45" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <clipPath id={`${id}c`}><rect x="3" y="3" width="58" height="58" rx="15" /></clipPath>
      </defs>
      <rect x="3" y="3" width="58" height="58" rx="15" fill="#0f1a33" stroke={gold} strokeWidth="2.2" />
      <rect x="7.5" y="7.5" width="49" height="49" rx="11" fill="none" stroke={gold} strokeWidth=".7" opacity=".75" />
      <text x="32" y="39.6" textAnchor="middle" fontFamily="var(--font-mark)" fontWeight="600" fontSize="22" letterSpacing="-0.4" fill={gold}>MP</text>
      <g clipPath={`url(#${id}c)`}>
        <g transform="skewX(-18)">
          <rect className="crest__sheen" x="-30" y="0" width="22" height="64" fill={`url(#${id}s)`} />
        </g>
      </g>
    </svg>
  );
}
