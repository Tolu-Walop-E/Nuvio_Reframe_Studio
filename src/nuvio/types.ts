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
  loadedAt: number;
};
