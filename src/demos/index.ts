import type { ViewBlock, ViewPack } from "../types/viewPack";
import { CANVAS_HEIGHT, CANVAS_WIDTH } from "../types/viewPack";

export type DemoPack = {
  id: string;
  name: string;
  blurb: string;
  pack: ViewPack;
};

const netflixLike: ViewPack = {
  schemaVersion: 1,
  id: "demo-netflix-home",
  name: "Demo · Netflix home",
  canvas: { width: CANVAS_WIDTH, height: CANVAS_HEIGHT },
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
  ],
};

/** Denser Xperience-inspired home: nav, tall hero, genre strip, several discovery rails. */
const xperienceLike: ViewPack = {
  schemaVersion: 1,
  id: "demo-xperience-home",
  name: "Demo · Xperience home",
  canvas: { width: CANVAS_WIDTH, height: CANVAS_HEIGHT },
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
    },
    {
      id: "collections",
      type: "collectionRail",
      x: 0,
      y: 890,
      w: 1920,
      h: 170,
      dataSource: "collections",
      trailer: false,
      label: "Collections",
    },
  ],
};

const sparseHero: ViewPack = {
  schemaVersion: 1,
  id: "demo-hero-focus",
  name: "Demo · Hero focus",
  canvas: { width: CANVAS_WIDTH, height: CANVAS_HEIGHT },
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
};

export const DEMO_PACKS: DemoPack[] = [
  {
    id: netflixLike.id,
    name: netflixLike.name,
    blurb: "Classic Netflix-style hero + CW + movies.",
    pack: netflixLike,
  },
  {
    id: xperienceLike.id,
    name: xperienceLike.name,
    blurb: "Xperience-like density: full-bleed hero, genres, trending, collections.",
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
  return {
    schemaVersion: 1,
    id: String(obj.id ?? "imported"),
    name: String(obj.name ?? "Imported view"),
    canvas: {
      width: CANVAS_WIDTH,
      height: CANVAS_HEIGHT,
    },
    blocks: obj.blocks as ViewBlock[],
  };
}
