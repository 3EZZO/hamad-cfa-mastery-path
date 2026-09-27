import type { ErrorEntry } from "../types";

/** An open Mistake Review entry whose planned revisit date has arrived. */
export function isRetestDue(entry: ErrorEntry, today: string): boolean {
  return !entry.resolved && Boolean(entry.revisitDate) && entry.revisitDate <= today;
}
