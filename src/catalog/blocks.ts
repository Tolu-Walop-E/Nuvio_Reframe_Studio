export type BlockType = "hero" | "topNav" | "mediaRail" | "genreRail" | "collectionRail" | "spacer";

export type BlockDefinition = {
  type: BlockType;
  label: string;
  description: string;
  defaultW: number;
  defaultH: number;
  minW: number;
  minH: number;
};

/** Matches native Nuvio Netflix-home building blocks. Studio cannot invent new types. */
export const BLOCK_CATALOG: BlockDefinition[] = [
  {
    type: "topNav",
    label: "Top nav",
    description: "Home / Movies / Shows / Collections + settings",
    defaultW: 1920,
    defaultH: 72,
    minW: 640,
    minH: 56,
  },
  {
    type: "hero",
    label: "Hero",
    description: "Featured title with optional trailer",
    defaultW: 1920,
    defaultH: 520,
    minW: 800,
    minH: 280,
  },
  {
    type: "mediaRail",
    label: "Media rail",
    description: "Horizontal poster row",
    defaultW: 1920,
    defaultH: 280,
    minW: 640,
    minH: 180,
  },
  {
    type: "genreRail",
    label: "Genre rail",
    description: "Genre chips / targets",
    defaultW: 1920,
    defaultH: 160,
    minW: 640,
    minH: 120,
  },
  {
    type: "collectionRail",
    label: "Collection rail",
    description: "User / imported collections",
    defaultW: 1920,
    defaultH: 260,
    minW: 640,
    minH: 160,
  },
  {
    type: "spacer",
    label: "Spacer",
    description: "Vertical breathing room",
    defaultW: 1920,
    defaultH: 40,
    minW: 200,
    minH: 16,
  },
];

export function blockDef(type: BlockType): BlockDefinition {
  const found = BLOCK_CATALOG.find((b) => b.type === type);
  if (!found) throw new Error(`Unknown block type: ${type}`);
  return found;
}
