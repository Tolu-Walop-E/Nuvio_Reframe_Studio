import { restGet, rpc } from "./client";
import type { LiveDataSource, NuvioConfig, NuvioLibrarySnapshot, NuvioProfile, NuvioSession } from "./types";

type ProfileRow = {
  profile_index?: number;
  profile_id?: number;
  id?: number;
  name?: string;
};

type CollectionsRow = {
  profile_id: number;
  collections_json: unknown;
};

type AddonRow = {
  url?: string;
  name?: string;
  enabled?: boolean;
  sort_order?: number;
  profile_id?: number;
};

type ManifestCatalog = {
  id?: string;
  name?: string;
  type?: string;
};

type Manifest = {
  id?: string;
  name?: string;
  catalogs?: ManifestCatalog[];
};

const BUILTIN: LiveDataSource[] = [
  {
    id: "none",
    label: "None",
    description: "Decorative / unlabeled",
    kind: "builtin",
    allowedBlocks: ["topNav", "spacer", "hero", "mediaRail", "genreRail", "collectionRail"],
  },
  {
    id: "featured",
    label: "Featured",
    description: "Hero spotlight title",
    kind: "builtin",
    allowedBlocks: ["hero"],
  },
  {
    id: "continueWatching",
    label: "Continue watching",
    description: "In-progress playback rail",
    kind: "builtin",
    allowedBlocks: ["mediaRail"],
  },
  {
    id: "genres",
    label: "Genres",
    description: "Genre discovery targets",
    kind: "builtin",
    allowedBlocks: ["genreRail"],
  },
];

export async function loadNuvioLibrary(
  config: NuvioConfig,
  session: NuvioSession,
  profileId = 1,
): Promise<NuvioLibrarySnapshot> {
  const profiles = await loadProfiles(config, session);
  const activeProfileId = profiles.some((p) => p.id === profileId)
    ? profileId
    : profiles[0]?.id ?? 1;

  const [collections, addons] = await Promise.all([
    loadCollections(config, session, activeProfileId),
    loadAddons(config, session, activeProfileId, session.userId),
  ]);

  const catalogSources = await loadCatalogSources(addons);
  const sources: LiveDataSource[] = [
    ...BUILTIN,
    ...collections,
    ...catalogSources,
  ];

  return {
    profileId: activeProfileId,
    profiles,
    sources,
    loadedAt: Date.now(),
  };
}

async function loadProfiles(
  config: NuvioConfig,
  session: NuvioSession,
): Promise<NuvioProfile[]> {
  try {
    const rows = await rpc<ProfileRow[] | ProfileRow>(config, session, "sync_pull_profiles", {});
    const list = Array.isArray(rows) ? rows : rows ? [rows] : [];
    const profiles = list
      .map((row) => {
        const id = Number(row.profile_index ?? row.profile_id ?? row.id ?? 1);
        return {
          id,
          name: String(row.name ?? `Profile ${id}`),
        };
      })
      .filter((p) => p.id >= 1 && p.id <= 6);
    return profiles.length ? profiles : [{ id: 1, name: "Profile 1" }];
  } catch {
    return [{ id: 1, name: "Profile 1" }];
  }
}

async function loadCollections(
  config: NuvioConfig,
  session: NuvioSession,
  profileId: number,
): Promise<LiveDataSource[]> {
  const rows = await rpc<CollectionsRow[] | CollectionsRow>(
    config,
    session,
    "sync_pull_collections",
    { p_profile_id: profileId },
  );
  const row = Array.isArray(rows) ? rows[0] : rows;
  const blob = row?.collections_json;
  const collections = normalizeCollectionsJson(blob);
  return collections.map((c) => ({
    id: `collection:${c.id}`,
    label: c.title,
    description: `Collection · ${c.id}`,
    kind: "collection" as const,
    allowedBlocks: ["collectionRail", "mediaRail", "hero"] as LiveDataSource["allowedBlocks"],
  }));
}

function normalizeCollectionsJson(blob: unknown): Array<{ id: string; title: string }> {
  if (!blob) return [];
  const arr = typeof blob === "string" ? safeJson(blob) : blob;
  if (!Array.isArray(arr)) return [];
  return arr
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const obj = item as Record<string, unknown>;
      const id = String(obj.id ?? "").trim();
      const title = String(obj.title ?? obj.name ?? id).trim();
      if (!id) return null;
      return { id, title: title || id };
    })
    .filter((x): x is { id: string; title: string } => x != null);
}

async function loadAddons(
  config: NuvioConfig,
  session: NuvioSession,
  profileId: number,
  userId: string,
): Promise<AddonRow[]> {
  const query =
    `addons?user_id=eq.${encodeURIComponent(userId)}` +
    `&profile_id=eq.${profileId}` +
    `&order=sort_order.asc`;
  try {
    return await restGet<AddonRow[]>(config, session, query);
  } catch {
    // Fallback: try without profile filter if schema differs
    return restGet<AddonRow[]>(
      config,
      session,
      `addons?user_id=eq.${encodeURIComponent(userId)}&order=sort_order.asc`,
    );
  }
}

async function loadCatalogSources(addons: AddonRow[]): Promise<LiveDataSource[]> {
  const enabled = addons.filter((a) => a.enabled !== false && a.url);
  const results = await Promise.allSettled(
    enabled.map(async (addon) => {
      const base = normalizeAddonBase(String(addon.url));
      const manifest = await fetchManifest(base);
      const addonId = String(manifest.id || addon.name || base);
      const addonName = String(manifest.name || addon.name || addonId);
      const catalogs = Array.isArray(manifest.catalogs) ? manifest.catalogs : [];
      return catalogs
        .filter((c) => c?.id && c?.type)
        .map((c) => {
          const type = String(c.type);
          const catalogId = String(c.id);
          const catalogName = String(c.name || catalogId);
          return {
            id: `catalog:${addonId}:${type}:${catalogId}`,
            label: `${catalogName}`,
            description: `${addonName} · ${type}/${catalogId}`,
            kind: "catalog" as const,
            allowedBlocks: ["mediaRail", "hero"] as LiveDataSource["allowedBlocks"],
          };
        });
    }),
  );

  const sources: LiveDataSource[] = [];
  for (const result of results) {
    if (result.status === "fulfilled") sources.push(...result.value);
  }
  // De-dupe by id
  const seen = new Set<string>();
  return sources.filter((s) => {
    if (seen.has(s.id)) return false;
    seen.add(s.id);
    return true;
  });
}

async function fetchManifest(baseUrl: string): Promise<Manifest> {
  const url = baseUrl.endsWith("/manifest.json")
    ? baseUrl
    : `${baseUrl.replace(/\/$/, "")}/manifest.json`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Manifest ${res.status} for ${url}`);
  return (await res.json()) as Manifest;
}

function normalizeAddonBase(url: string): string {
  const trimmed = url.trim();
  if (trimmed.endsWith("/manifest.json")) {
    return trimmed.slice(0, -"/manifest.json".length);
  }
  return trimmed.replace(/\/$/, "");
}

function safeJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
