import type { BlockType } from "../catalog/blocks";
import type { DataSourceId } from "../catalog/dataSources";

export type ViewBlock = {
  id: string;
  type: BlockType;
  x: number;
  y: number;
  w: number;
  h: number;
  dataSource: DataSourceId;
  trailer: boolean;
  label?: string;
  /** Horizontal placement bias for snap / center controls. */
  hAlign?: "start" | "center";
  /** Content row alignment inside rails. */
  contentAlign?: "start" | "center";
  /** Vertical/portrait poster focus-grow (media rails). Default true. */
  posterGrow?: boolean;
  /**
   * When true, this block keeps its vertical slot during unlock rotation.
   * Omitted = default lock for topNav / hero / continueWatching.
   */
  locked?: boolean;
};

export type ViewPack = {
  schemaVersion: 1;
  id: string;
  name: string;
  canvas: { width: number; height: number };
  blocks: ViewBlock[];
  /** When true, unlocked rails permute on an interval (order-only). */
  rotateUnlocked?: boolean;
  /** Hours between reshuffles; minimum 12. */
  rotateIntervalHours?: number;
  /** Epoch ms of last shuffle — written by Studio preview / TV runtime. */
  lastShuffleAt?: number;
  /** Seed for deterministic unlock order until the next interval. */
  shuffleSeed?: string;
};

/** First TV viewport guide — Nuvio scrolls beyond this. */
export const VIEWPORT_WIDTH = 1920;
export const VIEWPORT_HEIGHT = 1080;

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
      x: 0,
      y: 72,
      w: VIEWPORT_WIDTH,
      h: 520,
      dataSource: "featured",
      trailer: true,
    },
    {
      id: "rail-cw",
      type: "mediaRail",
      x: 0,
      y: 620,
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
