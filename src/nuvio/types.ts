export type NuvioConfig = {
  supabaseUrl: string;
  anonKey: string;
};

export type NuvioSession = {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  userId: string;
  email: string;
};

export type NuvioProfile = {
  id: number;
  name: string;
};

export type LiveDataSource = {
  id: string;
  label: string;
  description: string;
  kind: "builtin" | "collection" | "catalog";
  allowedBlocks: Array<
    "hero" | "topNav" | "mediaRail" | "genreRail" | "collectionRail" | "spacer"
  >;
};

export type NuvioLibrarySnapshot = {
  profileId: number;
  profiles: NuvioProfile[];
  sources: LiveDataSource[];
  /** Pack mirroring this account’s Nuvio home rail order. */
  homePack: import("../types/viewPack").ViewPack;
  /** Movie catalogs pulled from the same home settings (type = movie). */
  moviesPack: import("../types/viewPack").ViewPack;
  /** Series catalogs pulled from the same home settings (type = series). */
  showsPack: import("../types/viewPack").ViewPack;
  /** Real posters/tiles keyed by dataSource id. */
  previewBoard: import("./previewBoard").PreviewBoard;
  /** Raw collection folders for expand-into-rails. */
  collections: import("./previewBoard").CollectionFolderPreview[];
  /** Catalog display names keyed by catalogId / type:catalogId. */
  catalogNames: Record<string, string>;
  /** Home catalog settings payload (items + genre targets) for Send to TV. */
  homeCatalogSettings: import("./homePack").SyncHomeCatalogPayload;
  /** Parsed genre chip → destination map. */
  genreTargets: Record<string, import("./genreTargets").GenreTarget>;
  /** Genre chips derived from available genre_* catalogs (collection fallback). */
  genreChips: import("./genreTargets").GenreChip[];
  /** Studio-authored pack for this profile (view_pack_blobs). Null = generate from catalogs. */
  authoredHome: import("../types/viewPack").ViewPack | null;
  authoredMovies: import("../types/viewPack").ViewPack | null;
  authoredShows: import("../types/viewPack").ViewPack | null;
  loadedAt: number;
};
