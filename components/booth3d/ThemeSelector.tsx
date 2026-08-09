"use client";

import { BOOTH_THEMES, useBoothTheme } from "./BoothThemeProvider";

/**
 * Theme-switcher row (docs/goal-ui.md's ThemeSelector) — three buttons, the
 * active one picked out with the themed border/shadow, the rest dimmed.
 * Purely cosmetic/global: flips `<html data-theme>` via useBoothTheme, which
 * every themed surface in the app already reacts to through CSS custom
 * properties, so no other state needs to know a selection happened here.
 */
export default function ThemeSelector({ className }: { className?: string }) {
  const { themeId, setThemeId } = useBoothTheme();

  return (
    <div className={["flex flex-wrap justify-center gap-3", className].filter(Boolean).join(" ")}>
      {BOOTH_THEMES.map((theme) => {
        const active = theme.id === themeId;
        return (
          <button
            key={theme.id}
            type="button"
            onClick={() => setThemeId(theme.id)}
            aria-pressed={active}
            className={[
              "px-5 py-2.5 text-xs font-bold uppercase tracking-wide transition-all duration-300 rounded-booth border-booth",
              "bg-panel text-ink font-sans",
              active ? "shadow-booth scale-105 border-structural-gray" : "opacity-60 border-structural-gray/50",
            ].join(" ")}
          >
            {theme.name}
          </button>
        );
      })}
    </div>
  );
}
