import { useEffect, useRef } from "react";

/**
 * Keeps the selected week and a view's `…/week-N` hash in step.
 *
 * On arriving at the view, a week named in the link wins over the current
 * selection; afterwards every change of selection is written to the hash.
 * The link is read live from the hash (`readLinkedWeek`) rather than from
 * segment state, which is still one render behind on the arrival render —
 * reading the stale state is what made `#weekly/week-7` or
 * `#roadmap/week-12`, opened while the app was running, land on the current
 * week instead.
 *
 * `readLinkedWeek` returns the week in the link, null when the link names
 * none, or undefined when another section owns the hash (nothing to do).
 */
export function useWeekMirror({
  active,
  readLinkedWeek,
  writeWeek,
  selectedWeek,
  setSelectedWeek,
}: {
  active: boolean;
  readLinkedWeek: () => number | null | undefined;
  writeWeek: (week: number) => void;
  selectedWeek: number;
  setSelectedWeek: (week: number) => void;
}): void {
  const arrived = useRef(false);
  const latest = useRef({ readLinkedWeek, writeWeek, setSelectedWeek });
  latest.current = { readLinkedWeek, writeWeek, setSelectedWeek };

  useEffect(() => {
    if (!active) {
      arrived.current = false;
      return;
    }
    const { readLinkedWeek: read, writeWeek: write, setSelectedWeek: select } = latest.current;
    const firstRun = !arrived.current;
    arrived.current = true;
    const linked = read();
    if (linked === undefined) return;
    if (firstRun && linked !== null) {
      if (linked !== selectedWeek) select(linked);
      return;
    }
    if (linked !== selectedWeek) write(selectedWeek);
  }, [active, selectedWeek]);
}
