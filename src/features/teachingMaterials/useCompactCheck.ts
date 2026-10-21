import { useEffect, useState } from "react";

/** Keep the dialog semantics aligned with the CSS layout breakpoint. */
export function useCompactCheck(): boolean {
  const query = "(max-width: 899px)";
  const [compact, setCompact] = useState(() => typeof window !== "undefined" && !!window.matchMedia?.(query).matches);
  useEffect(() => {
    const media = typeof window === "undefined" ? undefined : window.matchMedia?.(query);
    if (!media) return;
    const update = () => setCompact(media.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  return compact;
}
