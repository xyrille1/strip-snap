"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

export type BoothThemeId = "classic" | "neon" | "kawaii";

export interface BoothThemeMeta {
  id: BoothThemeId;
  name: string;
}

// Display metadata only — the actual color/border/radius/shadow/font values
// live entirely in app/globals.css's `[data-theme]` blocks, applied purely
// via the CSS custom properties tailwind.config.ts's tokens point at. This
// list exists just so ThemeSelector has something to render buttons for.
export const BOOTH_THEMES: BoothThemeMeta[] = [
  { id: "classic", name: "Classic Sketch" },
  { id: "neon", name: "Neon Cyberpunk" },
  { id: "kawaii", name: "Kawaii Pastel" },
];

const STORAGE_KEY = "strip-snap-booth-theme";
const DEFAULT_THEME: BoothThemeId = "classic";

interface BoothThemeContextValue {
  themeId: BoothThemeId;
  setThemeId: (id: BoothThemeId) => void;
}

const BoothThemeContext = createContext<BoothThemeContextValue>({
  themeId: DEFAULT_THEME,
  setThemeId: () => {},
});

function isBoothThemeId(value: string | null): value is BoothThemeId {
  return value === "classic" || value === "neon" || value === "kawaii";
}

/**
 * Applies the chosen theme to `<html data-theme="…">`, which is what every
 * `[data-theme="…"]` block in app/globals.css keys off of — the whole app
 * re-themes purely through that CSS cascade, this provider's only real job
 * is picking which value goes on the attribute and persisting the choice.
 * Defaults to "classic" (the CSS `:root` default too, so a first-ever visit
 * renders correctly even before this effect runs).
 */
export default function BoothThemeProvider({ children }: { children: ReactNode }) {
  const [themeId, setThemeIdState] = useState<BoothThemeId>(DEFAULT_THEME);

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (isBoothThemeId(stored)) setThemeIdState(stored);
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", themeId);
  }, [themeId]);

  const setThemeId = useCallback((id: BoothThemeId) => {
    setThemeIdState(id);
    window.localStorage.setItem(STORAGE_KEY, id);
  }, []);

  return (
    <BoothThemeContext.Provider value={{ themeId, setThemeId }}>
      {children}
    </BoothThemeContext.Provider>
  );
}

export function useBoothTheme(): BoothThemeContextValue {
  return useContext(BoothThemeContext);
}
