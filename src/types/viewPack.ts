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

export const CANVAS_WIDTH = 1920;
export const CANVAS_HEIGHT = 1080;

export function createEmptyPack(name = "Untitled home"): ViewPack {
  const id = slugify(name);
  return {
    schemaVersion: 1,
    id,
    name,
    canvas: { width: CANVAS_WIDTH, height: CANVAS_HEIGHT },
    blocks: [
      {
        id: "topnav-1",
        type: "topNav",
        x: 0,
        y: 0,
        w: CANVAS_WIDTH,
        h: 72,
        dataSource: "none",
        trailer: false,
      },
      {
        id: "hero-1",
        type: "hero",
        x: 0,
        y: 72,
        w: CANVAS_WIDTH,
        h: 520,
        dataSource: "featured",
        trailer: true,
      },
      {
        id: "rail-cw",
        type: "mediaRail",
        x: 0,
        y: 620,
        w: CANVAS_WIDTH,
        h: 280,
        dataSource: "continueWatching",
        trailer: true,
        label: "Continue Watching",
      },
    ],
  };
}

export function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48) || "untitled-home";
}
