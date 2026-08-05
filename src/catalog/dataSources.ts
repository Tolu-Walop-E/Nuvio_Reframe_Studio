export type DataSourceId =
  | "none"
  | "featured"
  | "continueWatching"
  | "catalogPopularMovies"
  | "catalogPopularShows"
  | "genres"
  | "collections";

export type DataSourceDefinition = {
  id: DataSourceId;
  label: string;
  description: string;
  /** Which block types may bind this source */
  allowedBlocks: Array<"hero" | "topNav" | "mediaRail" | "genreRail" | "collectionRail" | "spacer">;
};

/** Known Nuvio data keys only — no arbitrary APIs from the website. */
export const DATA_SOURCES: DataSourceDefinition[] = [
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
    label: "Popular movies",
    description: "Catalog: movies / popular",
    allowedBlocks: ["mediaRail", "hero"],
  },
  {
    id: "catalogPopularShows",
    label: "Popular shows",
    description: "Catalog: series / popular",
    allowedBlocks: ["mediaRail", "hero"],
  },
  {
    id: "genres",
    label: "Genres",
    description: "Genre discovery targets",
    allowedBlocks: ["genreRail"],
  },
  {
    id: "collections",
    label: "Collections",
    description: "User collections rail",
    allowedBlocks: ["collectionRail"],
  },
];

export function sourcesForBlock(blockType: string): DataSourceDefinition[] {
  return DATA_SOURCES.filter((s) =>
    s.allowedBlocks.includes(blockType as DataSourceDefinition["allowedBlocks"][number]),
  );
}
