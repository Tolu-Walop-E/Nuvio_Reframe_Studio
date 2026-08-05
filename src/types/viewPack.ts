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
};

export type ViewPack = {
  schemaVersion: 1;
  id: string;
  name: string;
  canvas: { width: number; height: number };
  blocks: ViewBlock[];
};

/** First TV viewport guide — Nuvio scrolls beyond this. */
export const VIEWPORT_WIDTH = 1920;
export const VIEWPORT_HEIGHT = 1080;

/** @deprecated Prefer VIEWPORT_* */
export const CANVAS_WIDTH = VIEWPORT_WIDTH;
export const CANVAS_HEIGHT = VIEWPORT_HEIGHT;

const GROW_PAD = 120;
const MIN_CANVAS_WIDTH = VIEWPORT_WIDTH;
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

/** Canvas grows with rails/collections placed below or past the first screen. */
export function computeCanvasSize(blocks: ViewBlock[]): {
  width: number;
  height: number;
} {
  const { right, bottom } = contentBounds(blocks);
  return {
    width: Math.max(MIN_CANVAS_WIDTH, Math.ceil(right + GROW_PAD)),
    height: Math.max(MIN_CANVAS_HEIGHT, Math.ceil(bottom + GROW_PAD)),
  };
}

export function withComputedCanvas(pack: ViewPack): ViewPack {
  return {
    ...pack,
    canvas: computeCanvasSize(pack.blocks),
  };
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
