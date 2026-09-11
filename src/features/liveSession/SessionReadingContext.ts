import { createContext } from "react";
// React context also crosses the full-library portal; no persistent state here.
export const SessionReadingContext = createContext(1);
