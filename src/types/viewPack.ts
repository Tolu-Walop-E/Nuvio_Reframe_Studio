import type { BlockType } from "../catalog/blocks";
import type { DataSourceId } from "../catalog/dataSources";

/**
 * How a collection's folders open on the TV.
 * `reframe` renders them in the Netflix-style home layout instead of Nuvio's
 * default tabbed grid.
 */
export type CollectionOpenStyle = "reframe" | "grid" | "rows";

/** True when this block points at a collection (rail or expanded folder rail). */
export function isCollectionBlock(block: Pick<ViewBlock, "type" | "dataSource">): boolean {
  return block.type === "collectionRail" || block.dataSource.startsWith("collection:");
}

export type ViewBlock = {
  id: string;
  type: BlockType;
  x: number;
  y: number;
  w: number;
  h: number;
  dataSource: DataSourceId;
  /** Honored on vanilla Netflix: hero + catalog rail in-card trailer (also needs Layout trailers on). */
  trailer: boolean;
  label?: string;
  /** Horizontal placement bias for snap / center controls. */
  hAlign?: "start" | "center";
  /** Content row alignment inside rails. Preview only — not on TV yet. */
  contentAlign?: "start" | "center";
  /** Honored on vanilla Netflix catalog rails: focus expands to landscape width. Default true. */
  posterGrow?: boolean;
  /** Show title text under each poster. Default false. */
  showPosterLabels?: boolean;
  /**
   * Collection rails only: how folders opened from this rail render on TV.
   * Omitted = keep whatever the collection itself is set to in Nuvio.
   */
  collectionOpenStyle?: CollectionOpenStyle;
  /**
   * When true, this block keeps its vertical slot during unlock rotation.
   * Omitted = default lock for topNav / hero / continueWatching.
   */
  locked?: boolean;
};

export type ViewPack = {
  schemaVersion: 1;
  id: string;
  /** Display title for the pack (also used for slug id). */
  name: string;
  /** Short blurb shown in Studio share UI and on TV after import. */
  description?: string;
  canvas: { width: number; height: number };
  blocks: ViewBlock[];
  /**
   * Global: Netflix catalogue footer (title / facts / 3 desc lines)
   * under catalog & collection rails on vanilla Nuvio. Never applies to Continue Watching or genres.
   * When on, those rails are height-capped so 3 description lines always fit.
   * Packs drive NetflixHomeContent on vanilla Nuvio (contract v1) — not Modern chrome.
   */
  showFocusedPosterInfo?: boolean;
  /**
   * Global catalog/media poster size on Netflix home (1 = default).
   * Multiplies per-rail height scales. Honored on vanilla.
   */
  catalogPosterScale?: number;
  /**
   * Global collection hub landscape tile size on Netflix home (1 = default).
   * Honored on vanilla.
   */
  collectionLandscapeScale?: number;
  /**
   * Global rail heading text size on Netflix home (1 = default 26sp).
   * Honored on vanilla for collection and catalog row titles (e.g. Trending).
   */
  collectionTitleScale?: number;
  /**
   * Global: open every collection folder in this pack's Reframe / Netflix view
   * (hero + rails) instead of the old Nuvio tabbed grid. Per-rail
   * `collectionOpenStyle` still overrides for that collection when set.
   */
  collectionsOpenInReframe?: boolean;
  /** When true, unlocked rails permute on an interval (order-only). */
  rotateUnlocked?: boolean;
  /** Hours between reshuffles; minimum 12. */
  rotateIntervalHours?: number;
  /** Epoch ms of last shuffle — written by Studio preview / TV runtime. */
  lastShuffleAt?: number;
  /** Seed for deterministic unlock order until the next interval. */
  shuffleSeed?: string;
  /**
   * Nested Movies / TV Shows layouts. Only the Home document carries this.
   * Omitted = legacy home-only pack (TV Movies/Shows fall back to type filter).
   */
  screens?: {
    movies?: ViewPack;
    shows?: ViewPack;
  };
};

/** First TV viewport guide — Nuvio scrolls beyond this. */
export const VIEWPORT_WIDTH = 1920;
export const VIEWPORT_HEIGHT = 1080;

/** Pack global card scale range (matches TV clamp). */
export const MIN_PACK_CARD_SCALE = 0.7;
/** High enough that catalog posters can grow large while focused info stays readable. */
export const MAX_PACK_CARD_SCALE = 2;
export const DEFAULT_PACK_CARD_SCALE = 1;

export function normalizePackCardScale(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return DEFAULT_PACK_CARD_SCALE;
  return Math.min(MAX_PACK_CARD_SCALE, Math.max(MIN_PACK_CARD_SCALE, Math.round(n * 100) / 100));
}

/**
 * Netflix-style focused-info footer under a catalog rail (1080p px):
 * facts row + minimum 2 synopsis lines (TV matches this reserve).
 */
export const FOCUSED_METADATA_HEIGHT = 120;

/** Max poster art height when focused info is on — leaves room for ≥2 desc lines. */
export const MAX_LABELED_POSTER_HEIGHT = 300;

/** Max media/collection rail block height when focused info is enabled. */
export const MAX_LABELED_RAIL_HEIGHT =
  32 /* title padding */ + MAX_LABELED_POSTER_HEIGHT + FOCUSED_METADATA_HEIGHT;

/**
 * Height cap for a rail given the pack-level focused-info toggle.
 * Continue Watching / genre / hero stay uncapped by this rule.
 * When focused info is off, catalog posters may grow to a full TV page.
 */
export function maxRailHeightForBlock(
  block: Pick<ViewBlock, "type" | "dataSource">,
  pack: Pick<ViewPack, "showFocusedPosterInfo">,
): number | null {
  if (block.type !== "mediaRail" && block.type !== "collectionRail") return null;
  if (block.type === "mediaRail" && block.dataSource === "continueWatching") return null;
  if (pack.showFocusedPosterInfo === true) return MAX_LABELED_RAIL_HEIGHT;
  return null;
}

export function clampBlockHeight(
  block: ViewBlock,
  pack: Pick<ViewPack, "showFocusedPosterInfo">,
): ViewBlock {
  const maxH = maxRailHeightForBlock(block, pack);
  if (maxH == null || block.h <= maxH) return block;
  return { ...block, h: maxH };
}

export function clampBlocksHeight(
  blocks: ViewBlock[],
  pack: Pick<ViewPack, "showFocusedPosterInfo">,
): ViewBlock[] {
  return blocks.map((b) => clampBlockHeight(b, pack));
}

/** True when this block should show the Netflix-style focused footer in preview. */
export function blockShowsFocusedPosterInfo(
  block: ViewBlock,
  pack: Pick<ViewPack, "showFocusedPosterInfo">,
): boolean {
  if (pack.showFocusedPosterInfo !== true) return false;
  if (block.type === "genreRail" || block.type === "hero" || block.type === "topNav" || block.type === "spacer") {
    return false;
  }
  if (block.type === "mediaRail" && block.dataSource === "continueWatching") return false;
  return block.type === "mediaRail" || block.type === "collectionRail";
}

/**
 * Promote legacy per-rail `showPosterLabels` into the pack-level flag and clamp heights.
 */
export function withFocusedPosterInfoNorm(pack: ViewPack): ViewPack {
  const inherited =
    pack.showFocusedPosterInfo === true ||
    pack.blocks.some((b) => b.showPosterLabels === true);
  const next: ViewPack = {
    ...pack,
    showFocusedPosterInfo: inherited ? true : pack.showFocusedPosterInfo,
  };
  return {
    ...next,
    blocks: clampBlocksHeight(next.blocks, next),
  };
}

/** @deprecated Prefer VIEWPORT_* */
export const CANVAS_WIDTH = VIEWPORT_WIDTH;
export const CANVAS_HEIGHT = VIEWPORT_HEIGHT;

const GROW_PAD = 120;
const MIN_CANVAS_HEIGHT = VIEWPORT_HEIGHT;

export function contentBounds(blocks: ViewBlock[]): {
  right: number;
  bottom: number;
} {
  if (blocks.length === 0) {
    return { right: VIEWPORT_WIDTH, bottom: VIEWPORT_HEIGHT };
  }
  let right = 0;
  let bottom = 0;
  for (const block of blocks) {
    right = Math.max(right, block.x + block.w);
    bottom = Math.max(bottom, block.y + block.h);
  }
  return { right, bottom };
}

/** Canvas grows with rails placed below the first screen — width stays TV-locked at 1920. */
export function computeCanvasSize(blocks: ViewBlock[]): {
  width: number;
  height: number;
} {
  const { bottom } = contentBounds(blocks);
  return {
    width: VIEWPORT_WIDTH,
    height: Math.max(MIN_CANVAS_HEIGHT, Math.ceil(bottom + GROW_PAD)),
  };
}

export function withComputedCanvas(pack: ViewPack): ViewPack {
  return {
    ...pack,
    canvas: computeCanvasSize(pack.blocks),
  };
}

/** Keep block inside the 1920 TV frame (clip / clamp horizontal overflow). */
export function clampBlockToViewport(block: ViewBlock): ViewBlock {
  let x = Math.max(0, block.x);
  if (x >= VIEWPORT_WIDTH) x = 0;
  let w = Math.min(block.w, VIEWPORT_WIDTH - x);
  if (w < 1) {
    x = 0;
    w = VIEWPORT_WIDTH;
  }
  return { ...block, x: Math.round(x), w: Math.round(w) };
}

/**
 * Walk top→bottom and push overlapping blocks down so a consistent gap is kept.
 * Used after move/resize so scaled groups never stack on top of each other.
 */
export function restackVertically(blocks: ViewBlock[], gap = 44): ViewBlock[] {
  const next = blocks.map((b) => clampBlockToViewport({ ...b }));
  const sorted = [...next].sort((a, b) => a.y - b.y || a.x - b.x || a.id.localeCompare(b.id));

  for (let i = 1; i < sorted.length; i++) {
    const cur = sorted[i];
    let minY = cur.y;
    for (let j = 0; j < i; j++) {
      const prev = sorted[j];
      const overlapsX = cur.x < prev.x + prev.w && cur.x + cur.w > prev.x;
      if (!overlapsX) continue;
      minY = Math.max(minY, prev.y + prev.h + gap);
    }
    if (minY !== cur.y) {
      cur.y = Math.round(minY);
    }
  }

  const byId = new Map(sorted.map((b) => [b.id, b]));
  return next.map((b) => byId.get(b.id) ?? b);
}

/** Soft pack: max counted catalog/collection rails that may start in the first TV screen. */
export const MAX_COUNTED_RAILS_IN_VIEWPORT = 3;

export function isContinueWatchingRail(block: ViewBlock): boolean {
  return block.type === "mediaRail" && block.dataSource === "continueWatching";
}

/**
 * Rails that consume the first-screen budget.
 * Excludes hero, genre rail, Continue Watching, top nav, and spacers.
 */
export function countsTowardViewportRailBudget(block: ViewBlock): boolean {
  if (block.type === "collectionRail") return true;
  if (block.type === "mediaRail" && !isContinueWatchingRail(block)) return true;
  return false;
}

export function countedRailsStartingInViewport(
  blocks: ViewBlock[],
  viewportHeight = VIEWPORT_HEIGHT,
): ViewBlock[] {
  return blocks
    .filter(countsTowardViewportRailBudget)
    .filter((b) => b.y < viewportHeight)
    .sort((a, b) => a.y - b.y || a.x - b.x || a.id.localeCompare(b.id));
}

/**
 * Soft-pack constraint: at most `max` counted rails may start inside the first
 * TV viewport. Hero / genres / Continue Watching don't count. Extra counted
 * rails are pushed so they begin at/below the fold; then restacked. Packs can
 * still hold any number of rails overall — only the first screen is limited.
 */
export function enforceViewportRailBudget(
  blocks: ViewBlock[],
  max = MAX_COUNTED_RAILS_IN_VIEWPORT,
  gap = 44,
  viewportHeight = VIEWPORT_HEIGHT,
): ViewBlock[] {
  const next = blocks.map((b) => clampBlockToViewport({ ...b }));
  const inFirst = countedRailsStartingInViewport(next, viewportHeight);
  if (inFirst.length <= max) {
    return restackVertically(next, gap);
  }

  const byId = new Map(next.map((b) => [b.id, b]));
  for (const excess of inFirst.slice(max)) {
    const cur = byId.get(excess.id);
    if (!cur) continue;
    cur.y = Math.max(cur.y, viewportHeight);
  }

  return restackVertically(
    next.map((b) => byId.get(b.id) ?? b),
    gap,
  );
}

/** Restack + apply first-screen catalog rail budget. Prefer this after edit gestures. */
export function layoutBlocks(
  blocks: ViewBlock[],
  gap = 44,
  pack: Pick<ViewPack, "showFocusedPosterInfo"> = {},
): ViewBlock[] {
  return enforceViewportRailBudget(
    restackVertically(clampBlocksHeight(blocks, pack), gap),
    MAX_COUNTED_RAILS_IN_VIEWPORT,
    gap,
  );
}

export function createEmptyPack(name = "Untitled home"): ViewPack {
  const id = slugify(name);
  const blocks: ViewBlock[] = [
    {
      id: "topnav-1",
      type: "topNav",
      x: 0,
      y: 0,
      w: VIEWPORT_WIDTH,
      h: 72,
      dataSource: "none",
      trailer: false,
    },
    {
      id: "hero-1",
      type: "hero",
      x: 40,
      y: 108,
      w: VIEWPORT_WIDTH - 80,
      h: 360,
      dataSource: "featured",
      trailer: true,
    },
    {
      id: "rail-cw",
      type: "mediaRail",
      x: 0,
      y: 482,
      w: VIEWPORT_WIDTH,
      h: 280,
      dataSource: "continueWatching",
      trailer: true,
      label: "Continue Watching",
    },
  ];
  return withComputedCanvas({
    schemaVersion: 1,
    id,
    name,
    canvas: { width: VIEWPORT_WIDTH, height: VIEWPORT_HEIGHT },
    blocks,
  });
}

export function centerBlockX(block: Pick<ViewBlock, "w">, guideWidth = VIEWPORT_WIDTH): number {
  return Math.max(0, Math.round((guideWidth - block.w) / 2));
}

export function snapBlockPosition(
  x: number,
  y: number,
  w: number,
  h: number,
  opts?: {
    threshold?: number;
    guideWidth?: number;
    guideHeight?: number;
    /** Other blocks to snap above/below (no overlap). */
    others?: Array<{ id: string; x: number; y: number; w: number; h: number }>;
    excludeId?: string;
    gap?: number;
  },
): { x: number; y: number; snappedX: boolean; snappedY: boolean } {
  const threshold = opts?.threshold ?? 28;
  const guideWidth = opts?.guideWidth ?? VIEWPORT_WIDTH;
  const guideHeight = opts?.guideHeight ?? VIEWPORT_HEIGHT;
  const gap = opts?.gap ?? 44;
  const centerX = (guideWidth - w) / 2;
  const centerY = (guideHeight - h) / 2;
  let nextX = Math.max(0, x);
  let nextY = Math.max(0, y);
  let snappedX = false;
  let snappedY = false;

  if (Math.abs(nextX - centerX) <= threshold) {
    nextX = Math.round(centerX);
    snappedX = true;
  } else if (Math.abs(nextX) <= threshold) {
    nextX = 0;
    snappedX = true;
  }

  if (Math.abs(nextY - centerY) <= threshold) {
    nextY = Math.round(Math.max(0, centerY));
    snappedY = true;
  } else if (Math.abs(nextY) <= threshold) {
    nextY = 0;
    snappedY = true;
  }

  const others = (opts?.others ?? []).filter((b) => b.id !== opts?.excludeId);
  for (const other of others) {
    // Snap left edges / right edges for aligned columns.
    if (Math.abs(nextX - other.x) <= threshold) {
      nextX = other.x;
      snappedX = true;
    }

    const aboveY = other.y - h - gap;
    const belowY = other.y + other.h + gap;
    if (aboveY >= 0 && Math.abs(nextY - aboveY) <= threshold) {
      nextY = Math.round(aboveY);
      snappedY = true;
    } else if (Math.abs(nextY - belowY) <= threshold) {
      nextY = Math.round(Math.max(0, belowY));
      snappedY = true;
    }
  }

  return { x: Math.round(nextX), y: Math.round(nextY), snappedX, snappedY };
}

/** Push a block out of vertical overlap with others (prefers below when tied). */
export function resolveVerticalOverlap(
  moving: { id: string; x: number; y: number; w: number; h: number },
  others: Array<{ id: string; x: number; y: number; w: number; h: number }>,
  gap = 44,
): number {
  let y = moving.y;
  const sorted = [...others]
    .filter((b) => b.id !== moving.id)
    .sort((a, b) => a.y - b.y);

  for (let pass = 0; pass < sorted.length + 1; pass++) {
    let hit = false;
    for (const other of sorted) {
      const overlapsX =
        moving.x < other.x + other.w && moving.x + moving.w > other.x;
      if (!overlapsX) continue;
      const top = y;
      const bottom = y + moving.h;
      const oTop = other.y;
      const oBottom = other.y + other.h;
      const overlapsY = top < oBottom + gap && bottom + gap > oTop;
      if (!overlapsY) continue;
      hit = true;
      const mid = (top + bottom) / 2;
      const otherMid = (oTop + oBottom) / 2;
      y = mid >= otherMid ? oBottom + gap : Math.max(0, oTop - moving.h - gap);
    }
    if (!hit) break;
  }
  return Math.round(Math.max(0, y));
}

export function slugify(value: string): string {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 48) || "untitled-home"
  );
}
