import { clonePack, parseViewPack } from "../demos";
import type { ViewPack } from "../types/viewPack";

export type StudioScreen = "home" | "movies" | "shows";

export const STUDIO_SCREENS: Array<{ id: StudioScreen; label: string }> = [
  { id: "home", label: "Home" },
  { id: "movies", label: "Movies" },
  { id: "shows", label: "TV Shows" },
];

export type ScreenPackMap = {
  home: ViewPack;
  movies: ViewPack;
  shows: ViewPack;
};

export function screenLabel(screen: StudioScreen): string {
  return STUDIO_SCREENS.find((entry) => entry.id === screen)?.label ?? screen;
}

/** Drop nested `screens` so a Movies/Shows pack cannot recurse. */
export function stripScreenPacks(pack: ViewPack): ViewPack {
  const { screens: _ignored, ...rest } = pack;
  return rest;
}

/**
 * Nest Movies / TV Shows packs under the Home document.
 * Legacy TVs ignore `screens`; new TVs apply them on those tabs.
 */
export function attachScreenPacks(
  home: ViewPack,
  movies: ViewPack | null | undefined,
  shows: ViewPack | null | undefined,
): ViewPack {
  const next: ViewPack = stripScreenPacks(home);
  const screens: NonNullable<ViewPack["screens"]> = {};
  if (movies) screens.movies = stripScreenPacks(movies);
  if (shows) screens.shows = stripScreenPacks(shows);
  if (screens.movies || screens.shows) {
    next.screens = screens;
  }
  return next;
}

export function parseNestedScreenPack(raw: unknown): ViewPack | null {
  if (!raw || typeof raw !== "object") return null;
  try {
    return stripScreenPacks(parseViewPack(raw));
  } catch {
    return null;
  }
}

export function parseScreenPacks(raw: unknown): {
  home: ViewPack;
  movies: ViewPack | null;
  shows: ViewPack | null;
} {
  const home = stripScreenPacks(parseViewPack(raw));
  const obj = raw as { screens?: { movies?: unknown; shows?: unknown } };
  return {
    home,
    movies: parseNestedScreenPack(obj.screens?.movies),
    shows: parseNestedScreenPack(obj.screens?.shows),
  };
}

export function emptyScreenPackMap(fallback: ViewPack): ScreenPackMap {
  const base = clonePack(stripScreenPacks(fallback));
  return {
    home: base,
    movies: clonePack(base),
    shows: clonePack(base),
  };
}
