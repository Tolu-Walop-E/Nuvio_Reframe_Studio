import type { ViewBlock, ViewPack } from "../types/viewPack";
import { VIEWPORT_HEIGHT, VIEWPORT_WIDTH, withComputedCanvas } from "../types/viewPack";

export type DemoPack = {
  id: string;
  name: string;
  blurb: string;
  pack: ViewPack;
};

const netflixLike: ViewPack = withComputedCanvas({
  schemaVersion: 1,
  id: "demo-netflix-home",
  name: "Demo · Netflix home",
  canvas: { width: VIEWPORT_WIDTH, height: VIEWPORT_HEIGHT },
  blocks: [
    {
      id: "nav",
      type: "topNav",
      x: 0,
      y: 0,
      w: 1920,
      h: 72,
      dataSource: "none",
      trailer: false,
      label: "Top nav",
    },
    {
      id: "hero",
      type: "hero",
      x: 40,
      y: 96,
      w: 1840,
      h: 420,
      dataSource: "featured",
      trailer: true,
      label: "Featured",
    },
    {
      id: "cw",
      type: "mediaRail",
      x: 0,
      y: 560,
      w: 1920,
      h: 220,
      dataSource: "continueWatching",
      trailer: true,
      label: "Continue Watching",
    },
    {
      id: "movies",
      type: "mediaRail",
      x: 0,
      y: 800,
      w: 1920,
      h: 240,
      dataSource: "catalogPopularMovies",
      trailer: false,
      label: "Popular Movies",
    },
    {
      id: "collections-low",
      type: "collectionRail",
      x: 0,
      y: 1120,
      w: 1920,
      h: 200,
      dataSource: "collections",
      trailer: false,
      label: "Collections",
    },
  ],
});

const xperienceLike: ViewPack = withComputedCanvas({
  schemaVersion: 1,
  id: "demo-xperience-home",
  name: "Demo · Xperience home",
  canvas: { width: VIEWPORT_WIDTH, height: VIEWPORT_HEIGHT },
  blocks: [
    {
      id: "nav",
      type: "topNav",
      x: 0,
      y: 0,
      w: 1920,
      h: 72,
      dataSource: "none",
      trailer: false,
      label: "Top nav",
    },
    {
      id: "hero",
      type: "hero",
      x: 0,
      y: 72,
      w: 1920,
      h: 480,
      dataSource: "featured",
      trailer: true,
      label: "For You",
    },
    {
      id: "genres",
      type: "genreRail",
      x: 0,
      y: 570,
      w: 1920,
      h: 100,
      dataSource: "genres",
      trailer: false,
      label: "Genres",
    },
    {
      id: "trending",
      type: "mediaRail",
      x: 0,
      y: 690,
      w: 1920,
      h: 180,
      dataSource: "catalogPopularShows",
      trailer: true,
      label: "Trending",
      posterGrow: true,
      contentAlign: "start",
    },
    {
      id: "collections",
      type: "collectionRail",
      x: 0,
      y: 900,
      w: 1920,
      h: 180,
      dataSource: "collections",
      trailer: false,
      label: "Collections",
      contentAlign: "center",
    },
    {
      id: "more-movies",
      type: "mediaRail",
      x: 0,
      y: 1120,
      w: 1920,
      h: 220,
      dataSource: "catalogPopularMovies",
      trailer: false,
      label: "More movies",
      posterGrow: false,
      contentAlign: "start",
    },
    {
      id: "more-shows",
      type: "mediaRail",
      x: 0,
      y: 1380,
      w: 1920,
      h: 220,
      dataSource: "catalogPopularShows",
      trailer: false,
      label: "More shows",
    },
  ],
});

const sparseHero: ViewPack = withComputedCanvas({
  schemaVersion: 1,
  id: "demo-hero-focus",
  name: "Demo · Hero focus",
  canvas: { width: VIEWPORT_WIDTH, height: VIEWPORT_HEIGHT },
  blocks: [
    {
      id: "nav",
      type: "topNav",
      x: 0,
      y: 0,
      w: 1920,
      h: 72,
      dataSource: "none",
      trailer: false,
      label: "Top nav",
    },
    {
      id: "hero",
      type: "hero",
      x: 48,
      y: 120,
      w: 1824,
      h: 640,
      dataSource: "featured",
      trailer: true,
      label: "Spotlight",
    },
    {
      id: "rail",
      type: "mediaRail",
      x: 0,
      y: 800,
      w: 1920,
      h: 240,
      dataSource: "continueWatching",
      trailer: true,
      label: "Because you watched",
    },
  ],
});

export const DEMO_PACKS: DemoPack[] = [
  {
    id: netflixLike.id,
    name: netflixLike.name,
    blurb: "Vanilla Netflix home contract — hero, rails, collections below the fold.",
    pack: netflixLike,
  },
  {
    id: xperienceLike.id,
    name: xperienceLike.name,
    blurb: "Xperience-like density that scrolls past 1080.",
    pack: xperienceLike,
  },
  {
    id: sparseHero.id,
    name: sparseHero.name,
    blurb: "Big hero with one supporting rail.",
    pack: sparseHero,
  },
];

export function clonePack(pack: ViewPack): ViewPack {
  return JSON.parse(JSON.stringify(pack)) as ViewPack;
}

export function parseViewPack(raw: unknown): ViewPack {
  if (!raw || typeof raw !== "object") throw new Error("Invalid pack JSON");
  const obj = raw as Partial<ViewPack>;
  if (obj.schemaVersion !== 1) throw new Error("Unsupported schemaVersion");
  if (!Array.isArray(obj.blocks)) throw new Error("Pack missing blocks[]");
  const rotateIntervalHours =
    typeof obj.rotateIntervalHours === "number" && Number.isFinite(obj.rotateIntervalHours)
      ? Math.max(12, Math.round(obj.rotateIntervalHours))
      : undefined;
  return withComputedCanvas({
    schemaVersion: 1,
    id: String(obj.id ?? "imported"),
    name: String(obj.name ?? "Imported view"),
    description:
      typeof obj.description === "string" && obj.description.trim()
        ? obj.description.trim()
        : undefined,
    canvas: {
      width: VIEWPORT_WIDTH,
      height: VIEWPORT_HEIGHT,
    },
    blocks: obj.blocks as ViewBlock[],
    showFocusedPosterInfo:
      obj.showFocusedPosterInfo === true ||
      (obj.blocks as ViewBlock[]).some((b) => b.showPosterLabels === true),
    catalogPosterScale:
      typeof obj.catalogPosterScale === "number"
        ? Math.min(2, Math.max(0.7, Math.round(obj.catalogPosterScale * 100) / 100))
        : undefined,
    collectionLandscapeScale:
      typeof obj.collectionLandscapeScale === "number"
        ? Math.min(2, Math.max(0.7, Math.round(obj.collectionLandscapeScale * 100) / 100))
        : undefined,
    collectionTitleScale:
      typeof obj.collectionTitleScale === "number"
        ? Math.min(2, Math.max(0.7, Math.round(obj.collectionTitleScale * 100) / 100))
        : undefined,
    collectionsOpenInReframe: obj.collectionsOpenInReframe === true,
    rotateUnlocked: obj.rotateUnlocked === true,
    rotateIntervalHours,
    lastShuffleAt:
      typeof obj.lastShuffleAt === "number" && Number.isFinite(obj.lastShuffleAt)
        ? obj.lastShuffleAt
        : undefined,
    shuffleSeed:
      typeof obj.shuffleSeed === "string" && obj.shuffleSeed.trim()
        ? obj.shuffleSeed.trim()
        : undefined,
  });
}
