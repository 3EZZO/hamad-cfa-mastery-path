import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { Moon, Sun } from "lucide-react";

export type Theme = "light" | "dark";
export const THEME_STORAGE_KEY = "hamad-mastery-theme";
/** Session Mode keeps its own device preference and opens dark by default. */
export const SESSION_THEME_STORAGE_KEY = "hamad-session-theme";
const ThemeContext = createContext({ theme: "light" as Theme, toggle: () => {}, enterSession: () => () => {} });

export function readTheme(): Theme {
  try { return localStorage.getItem(THEME_STORAGE_KEY) === "dark" ? "dark" : "light"; }
  catch { return "light"; }
}

export function readSessionTheme(): Theme {
  try { return localStorage.getItem(SESSION_THEME_STORAGE_KEY) === "light" ? "light" : "dark"; }
  catch { return "dark"; }
}

export function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme === "dark" ? "dark" : "only light";
  document.querySelector('meta[name="color-scheme"]')?.setAttribute("content", theme);
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme === "dark" ? "#0a1120" : "#14213d");
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [trackerTheme, setTrackerTheme] = useState<Theme>(readTheme);
  const [sessionTheme, setSessionTheme] = useState<Theme>(readSessionTheme);
  const [inSession, setInSession] = useState(false);
  const theme = inSession ? sessionTheme : trackerTheme;
  useEffect(() => { applyTheme(theme); }, [theme]);
  useEffect(() => {
    const receive = (event: StorageEvent) => {
      if (event.key === THEME_STORAGE_KEY || event.key === null) setTrackerTheme(readTheme());
      if (event.key === SESSION_THEME_STORAGE_KEY || event.key === null) setSessionTheme(readSessionTheme());
    };
    window.addEventListener("storage", receive);
    return () => window.removeEventListener("storage", receive);
  }, []);
  const toggle = () => {
    const next = theme === "dark" ? "light" : "dark";
    (inSession ? setSessionTheme : setTrackerTheme)(next);
    // A device preference only: never included in tracker or session writes.
    try { localStorage.setItem(inSession ? SESSION_THEME_STORAGE_KEY : THEME_STORAGE_KEY, next); } catch { /* Keep working in memory. */ }
  };
  const enterSession = useCallback(() => {
    setInSession(true);
    return () => setInSession(false);
  }, []);
  return <ThemeContext.Provider value={{ theme, toggle, enterSession }}>{children}</ThemeContext.Provider>;
}

/** Switches the document to the Session Mode theme while the caller is mounted. */
export function useSessionThemeScope() {
  const { enterSession } = useContext(ThemeContext);
  useEffect(() => enterSession(), [enterSession]);
}

/** Current theme and toggler for controls rendered outside ThemeToggle. */
export function useTheme() {
  return useContext(ThemeContext);
}

export function ThemeToggle() {
  const { theme, toggle } = useContext(ThemeContext);
  const dark = theme === "dark";
  return (
    <button type="button" className="theme-toggle" onClick={toggle}
      aria-label={dark ? "Switch to light theme" : "Switch to dark theme"}
      title={dark ? "Switch to light theme" : "Switch to dark theme"}>
      {dark ? <Sun size={18} aria-hidden="true" /> : <Moon size={18} aria-hidden="true" />}
    </button>
  );
}
