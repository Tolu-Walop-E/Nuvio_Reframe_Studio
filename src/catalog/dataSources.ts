import type { BlockType } from "./blocks";
import type { LiveDataSource } from "../nuvio/types";

/** Builtin + live Nuvio account sources (collection:… / catalog:…). */
export type DataSourceId = string;

export type DataSourceDefinition = {
  id: DataSourceId;
  label: string;
  description: string;
  allowedBlocks: BlockType[];
};

export const BUILTIN_DATA_SOURCES: DataSourceDefinition[] = [
  {
    id: "none",
    label: "None",
    description: "Decorative / unlabeled",
    allowedBlocks: ["topNav", "spacer", "hero", "mediaRail", "genreRail", "collectionRail"],
  },
  {
    id: "featured",
    label: "Featured",
    description: "Hero spotlight title",
    allowedBlocks: ["hero"],
  },
  {
    id: "continueWatching",
    label: "Continue watching",
    description: "In-progress playback rail",
    allowedBlocks: ["mediaRail"],
  },
  {
    id: "catalogPopularMovies",
    label: "Popular movies (demo)",
    description: "Demo placeholder until account catalogs load",
    allowedBlocks: ["mediaRail", "hero"],
  },
  {
    id: "catalogPopularShows",
    label: "Popular shows (demo)",
    description: "Demo placeholder until account catalogs load",
    allowedBlocks: ["mediaRail", "hero"],
  },
  {
    id: "genres",
    label: "Genres",
    description: "TV fills text pills from installed catalogs",
    allowedBlocks: ["genreRail"],
  },
  {
    id: "collections",
    label: "Collections (all)",
    description: "Generic collections rail",
    allowedBlocks: ["collectionRail"],
  },
];

export function mergeDataSources(live: LiveDataSource[] | null | undefined): DataSourceDefinition[] {
  if (!live?.length) return BUILTIN_DATA_SOURCES;
  const byId = new Map<string, DataSourceDefinition>();
  for (const s of BUILTIN_DATA_SOURCES) byId.set(s.id, s);
  for (const s of live) {
    byId.set(s.id, {
      id: s.id,
      label: s.label,
      description: s.description,
      allowedBlocks: s.allowedBlocks,
    });
  }
  return [...byId.values()];
}

export function sourcesForBlock(
  blockType: string,
  all: DataSourceDefinition[] = BUILTIN_DATA_SOURCES,
): DataSourceDefinition[] {
  return all.filter((s) => s.allowedBlocks.includes(blockType as BlockType));
}
