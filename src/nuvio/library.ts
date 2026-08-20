import { restGet, rpc } from "./client";
import {
  bingeCatNuvioBaseFromAddonId,
  canonicalizeAddonBase,
  catalogPageUrl,
  fetchAddonJson,
  manifestUrl,
} from "./addonFetch";
import {
  buildPackFromNuvioHome,
  friendlyCatalogLabel,
  type SyncCatalogItem,
  type SyncHomeCatalogPayload,
} from "./homePack";
import {
  buildPreviewBoard,
  type CollectionFolderPreview,
} from "./previewBoard";
import type { LiveDataSource, NuvioConfig, NuvioLibrarySnapshot, NuvioProfile, NuvioSession } from "./types";
import { genreChipsFromCatalogs, parseGenreTargets } from "./genreTargets";

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

type HomeSettingsRow = {
  profile_id?: number;
  platform?: string;
  settings_json?: SyncHomeCatalogPayload | string;
  updated_at?: string;
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
    description: "TV fills text pills from installed catalogs",
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

  const [collectionData, addons, homeSettings] = await Promise.all([
    loadCollections(config, session, activeProfileId),
    loadAddons(config, session, activeProfileId, session.userId),
    loadHomeCatalogSettings(config, session, activeProfileId),
  ]);

  const { sources: catalogSources, catalogUrlBySourceId, addonBaseById, catalogNames } =
    await loadCatalogSources(addons);

  const homeItems = homeSettings.items ?? [];

  // Ensure BingeCat Nuvio manifests are loaded even when addons-table URL is missing
  // or was mangled (query-string ?bcv=…). Home rows carry com.aicat.<uuid>.nuvio.
  await ensureBingeCatManifests(homeItems, addonBaseById, catalogUrlBySourceId, catalogNames, catalogSources);

  const syntheticHomeSources = resolveHomeCatalogUrls(
    homeItems,
    catalogUrlBySourceId,
    addonBaseById,
    catalogNames,
  );

  // Prefer manifest labels; fill gaps with home-row synthetics (BingeCat lists etc.).
  const sourceById = new Map<string, LiveDataSource>();
  for (const s of [...BUILTIN, ...collectionData.sources, ...catalogSources, ...syntheticHomeSources]) {
    if (!sourceById.has(s.id)) sourceById.set(s.id, s);
  }
  const sources = [...sourceById.values()];

  const genreTargets = parseGenreTargets(
    (homeSettings.genre_targets ?? {}) as Record<string, unknown>,
  );
  const genreChips = genreChipsFromCatalogs(
    [...BUILTIN, ...collectionData.sources, ...catalogSources, ...syntheticHomeSources],
    collectionData.folders,
    catalogNames,
  );

  const packArgs = {
    email: session.email,
    profileId: activeProfileId,
    items: homeItems,
    sources,
    catalogNames,
    hasGenreTargets:
      Object.keys(genreTargets).length > 0 ||
      genreChips.length > 0 ||
      collectionData.folders.some((c) => (c.title || "").toLowerCase() === "genres"),
  };
  const homePack = buildPackFromNuvioHome({ ...packArgs, screen: "home" });
  const moviesPack = buildPackFromNuvioHome({ ...packArgs, screen: "movies" });
  const showsPack = buildPackFromNuvioHome({ ...packArgs, screen: "shows" });

  // Register catalog URLs referenced by collection folders (Xperience, etc.).
  for (const collection of collectionData.folders) {
    for (const folder of collection.folders) {
      for (const src of folder.catalogSources) {
        const sourceId = `catalog:${src.addonId}:${src.type}:${src.catalogId}`;
        if (catalogUrlBySourceId[sourceId]) continue;
        const base = resolveAddonBase(src.addonId, addonBaseById);
        if (base) {
          catalogUrlBySourceId[sourceId] = catalogPageUrl(base, src.type, src.catalogId);
        }
      }
    }
  }

  const neededSourceIds = [
    ...homePack.blocks,
    ...moviesPack.blocks,
    ...showsPack.blocks,
  ].map((b) => b.dataSource);
  const previewBoard = await buildPreviewBoard({
    sources,
    neededSourceIds,
    catalogUrlBySourceId,
    addonBaseById,
    collections: collectionData.folders,
  });

  return {
    profileId: activeProfileId,
    profiles,
    sources,
    homePack,
    moviesPack,
    showsPack,
    previewBoard,
    collections: collectionData.folders,
    catalogNames,
    homeCatalogSettings: homeSettings,
    genreTargets,
    genreChips,
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
): Promise<{ sources: LiveDataSource[]; folders: CollectionFolderPreview[] }> {
  const rows = await rpc<CollectionsRow[] | CollectionsRow>(
    config,
    session,
    "sync_pull_collections",
    { p_profile_id: profileId },
  );
  const row = Array.isArray(rows) ? rows[0] : rows;
  const blob = row?.collections_json;
  const collections = normalizeCollectionsJson(blob);
  const sources = collections.map((c) => ({
    id: `collection:${c.id}`,
    label: c.title,
    description: `Collection · ${c.id}`,
    kind: "collection" as const,
    allowedBlocks: ["collectionRail", "mediaRail", "hero", "genreRail"] as LiveDataSource["allowedBlocks"],
  }));
  for (const c of collections) {
    for (const folder of c.folders) {
      sources.push({
        id: `collection:${c.id}:folder:${folder.id}`,
        label: folder.title,
        description: `Folder · ${c.title}`,
        kind: "collection",
        allowedBlocks: ["collectionRail", "mediaRail", "hero"],
      });
    }
  }
  const folders: CollectionFolderPreview[] = collections.map((c) => ({
    collectionId: c.id,
    title: c.title,
    folders: c.folders,
  }));
  return { sources, folders };
}

function normalizeCollectionsJson(
  blob: unknown,
): Array<{
  id: string;
  title: string;
  folders: CollectionFolderPreview["folders"];
}> {
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
      const foldersRaw = Array.isArray(obj.folders) ? obj.folders : [];
      const folders = foldersRaw
        .map((f) => {
          if (!f || typeof f !== "object") return null;
          const folder = f as Record<string, unknown>;
          const folderId = String(folder.id ?? "").trim();
          if (!folderId) return null;
          return {
            id: folderId,
            title: String(folder.title ?? folderId).trim() || folderId,
            coverImageUrl: optionalUrl(folder.coverImageUrl),
            heroBackdropUrl: optionalUrl(folder.heroBackdropUrl),
            titleLogoUrl: optionalUrl(folder.titleLogoUrl),
            tileShape: folder.tileShape ? String(folder.tileShape) : undefined,
            catalogSources: parseFolderCatalogSources(folder),
          };
        })
        .filter((x): x is NonNullable<typeof x> => x != null);
      return { id, title: title || id, folders };
    })
    .filter((x): x is NonNullable<typeof x> => x != null);
}

function parseFolderCatalogSources(
  folder: Record<string, unknown>,
): CollectionFolderPreview["folders"][number]["catalogSources"] {
  const raw =
    (Array.isArray(folder.catalogSources) && folder.catalogSources) ||
    (Array.isArray(folder.sources) && folder.sources) ||
    [];
  const out: CollectionFolderPreview["folders"][number]["catalogSources"] = [];
  const seen = new Set<string>();
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const obj = entry as Record<string, unknown>;
    const addonId = String(obj.addonId ?? obj.addon_id ?? "").trim();
    const type = String(obj.type ?? "").trim();
    const catalogId = String(obj.catalogId ?? obj.catalog_id ?? "").trim();
    if (!addonId || !type || !catalogId) continue;
    const key = `${addonId}:${type}:${catalogId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const genreRaw = obj.genre;
    const genre =
      typeof genreRaw === "string" && genreRaw.trim() && genreRaw.trim().toLowerCase() !== "none"
        ? genreRaw.trim()
        : undefined;
    out.push({ addonId, type, catalogId, genre });
  }
  return out;
}

function optionalUrl(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
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
    return restGet<AddonRow[]>(
      config,
      session,
      `addons?user_id=eq.${encodeURIComponent(userId)}&order=sort_order.asc`,
    );
  }
}

async function loadCatalogSources(addons: AddonRow[]): Promise<{
  sources: LiveDataSource[];
  catalogUrlBySourceId: Record<string, string>;
  addonBaseById: Record<string, string>;
  catalogNames: Record<string, string>;
}> {
  const enabled = addons.filter((a) => a.enabled !== false && a.url);
  const catalogUrlBySourceId: Record<string, string> = {};
  const addonBaseById: Record<string, string> = {};
  const catalogNames: Record<string, string> = {};
  const results = await Promise.allSettled(
    enabled.map(async (addon) => {
      const base = canonicalizeAddonBase(String(addon.url));
      registerAddonBase(addonBaseById, base, String(addon.name || ""), base);

      let manifest: Manifest;
      try {
        manifest = await fetchAddonJson<Manifest>(manifestUrl(base));
      } catch {
        return [] as LiveDataSource[];
      }

      return ingestManifest(manifest, base, String(addon.name || ""), {
        catalogUrlBySourceId,
        addonBaseById,
        catalogNames,
      });
    }),
  );

  const sources: LiveDataSource[] = [];
  for (const result of results) {
    if (result.status === "fulfilled") sources.push(...result.value);
  }
  const seen = new Set<string>();
  return {
    sources: sources.filter((s) => {
      if (seen.has(s.id)) return false;
      seen.add(s.id);
      return true;
    }),
    catalogUrlBySourceId,
    addonBaseById,
    catalogNames,
  };
}

function ingestManifest(
  manifest: Manifest,
  base: string,
  addonNameHint: string,
  maps: {
    catalogUrlBySourceId: Record<string, string>;
    addonBaseById: Record<string, string>;
    catalogNames: Record<string, string>;
  },
): LiveDataSource[] {
  const addonId = String(manifest.id || addonNameHint || base);
  const addonName = String(manifest.name || addonNameHint || addonId);
  registerAddonBase(maps.addonBaseById, addonId, addonName, base);

  const catalogs = Array.isArray(manifest.catalogs) ? manifest.catalogs : [];
  return catalogs
    .filter((c) => c?.id && c?.type)
    .map((c) => {
      const type = String(c.type);
      const catalogId = String(c.id);
      const catalogName = String(c.name || catalogId).trim() || catalogId;
      const sourceId = `catalog:${addonId}:${type}:${catalogId}`;
      maps.catalogUrlBySourceId[sourceId] = catalogPageUrl(base, type, catalogId);
      if (catalogName && catalogName !== catalogId) {
        maps.catalogNames[catalogId] = catalogName;
        maps.catalogNames[catalogId.toLowerCase()] = catalogName;
        maps.catalogNames[`${type}:${catalogId}`] = catalogName;
      }
      return {
        id: sourceId,
        label: catalogName,
        description: `${addonName} · ${type}/${catalogId}`,
        kind: "catalog" as const,
        allowedBlocks: ["mediaRail", "hero"] as LiveDataSource["allowedBlocks"],
      };
    });
}

/** Pull BingeCat Nuvio manifests for any home addon_id we can rebuild. */
async function ensureBingeCatManifests(
  items: SyncCatalogItem[],
  addonBaseById: Record<string, string>,
  catalogUrlBySourceId: Record<string, string>,
  catalogNames: Record<string, string>,
  catalogSources: LiveDataSource[],
) {
  const ids = new Set(
    items
      .map((i) => String(i.addon_id ?? "").trim())
      .filter((id) => /^com\.aicat\./i.test(id)),
  );

  await Promise.all(
    [...ids].map(async (addonId) => {
      if (addonBaseById[addonId] || addonBaseById[addonId.toLowerCase()]) {
        // Still refresh names if we have base but empty name map for these lists.
        const hasAnyName = items.some((i) => {
          if (String(i.addon_id ?? "").trim() !== addonId) return false;
          const catalogId = String(i.catalog_id ?? "").trim();
          const type = String(i.type ?? "").trim();
          return Boolean(catalogNames[catalogId] || catalogNames[`${type}:${catalogId}`]);
        });
        if (hasAnyName) return;
      }

      const base =
        resolveAddonBase(addonId, addonBaseById) || bingeCatNuvioBaseFromAddonId(addonId);
      if (!base) return;

      try {
        const manifest = await fetchAddonJson<Manifest>(manifestUrl(base));
        const sources = ingestManifest(manifest, canonicalizeAddonBase(base), "", {
          catalogUrlBySourceId,
          addonBaseById,
          catalogNames,
        });
        for (const s of sources) {
          if (!catalogSources.some((x) => x.id === s.id)) catalogSources.push(s);
        }
      } catch {
        // Keep friendly fallbacks if BingeCat is unreachable.
      }
    }),
  );
}

function registerAddonBase(
  map: Record<string, string>,
  addonId: string,
  addonName: string,
  base: string,
) {
  const id = addonId.trim();
  if (id) map[id] = base;
  if (addonName.trim()) map[addonName.trim()] = base;
  // Help match BingeCat Nuvio ids like com.aicat.<uuid>.nuvio
  const lower = id.toLowerCase();
  if (lower && !map[lower]) map[lower] = base;
}

/** Resolve addon base URL for a home-catalog addon_id (incl. BingeCat variants). */
function resolveAddonBase(
  addonId: string,
  addonBaseById: Record<string, string>,
): string | undefined {
  if (!addonId) return undefined;
  const exact = addonBaseById[addonId] || addonBaseById[addonId.toLowerCase()];
  if (exact) return exact;

  const keys = Object.keys(addonBaseById);
  const lower = addonId.toLowerCase();

  const includes = keys.find(
    (k) =>
      k.toLowerCase() === lower ||
      lower.includes(k.toLowerCase()) ||
      k.toLowerCase().includes(lower),
  );
  if (includes) return addonBaseById[includes];

  if (/aicat|binge?cat/i.test(addonId)) {
    const binge = keys.find((k) => /aicat|binge?cat/i.test(k));
    if (binge) return addonBaseById[binge];
    const byHost = Object.values(addonBaseById).find((base) =>
      /aicat|binge?cat/i.test(base),
    );
    if (byHost) return byHost;
  }

  return bingeCatNuvioBaseFromAddonId(addonId);
}

/**
 * Ensure every home catalog row has a fetchable /catalog/... URL, even when that
 * list isn't present in the addon's manifest (BingeCat dynamic / synced lists).
 */
function resolveHomeCatalogUrls(
  items: SyncCatalogItem[],
  catalogUrlBySourceId: Record<string, string>,
  addonBaseById: Record<string, string>,
  catalogNames: Record<string, string>,
): LiveDataSource[] {
  const synthetic: LiveDataSource[] = [];
  for (const item of items) {
    if (item.is_collection || item.collection_id) continue;
    if (item.enabled === false) continue;
    const type = String(item.type ?? "").trim();
    const catalogId = String(item.catalog_id ?? "").trim();
    const addonId = String(item.addon_id ?? "").trim();
    if (!type || !catalogId || !addonId) continue;

    const sourceId = `catalog:${addonId}:${type}:${catalogId}`;
    if (!catalogUrlBySourceId[sourceId]) {
      const suffix = `:${type}:${catalogId}`;
      const match = Object.entries(catalogUrlBySourceId).find(([id]) => id.endsWith(suffix));
      if (match) {
        catalogUrlBySourceId[sourceId] = match[1];
      } else {
        const base = resolveAddonBase(addonId, addonBaseById);
        if (base) {
          catalogUrlBySourceId[sourceId] = catalogPageUrl(base, type, catalogId);
        }
      }
    }

    const realName =
      String(item.custom_title ?? "").trim() ||
      catalogNames[`${type}:${catalogId}`] ||
      catalogNames[catalogId] ||
      catalogNames[catalogId.toLowerCase()] ||
      friendlyCatalogLabel(item) ||
      catalogId;

    synthetic.push({
      id: sourceId,
      label: realName,
      description: `${addonId} · ${type}/${catalogId}`,
      kind: "catalog",
      allowedBlocks: ["mediaRail", "hero"],
    });
  }
  return synthetic;
}

function safeJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/** Match TV: prefer home_catalog_shared, else newest non-empty tv/mobile. */
async function loadHomeCatalogSettings(
  config: NuvioConfig,
  session: NuvioSession,
  profileId: number,
): Promise<SyncHomeCatalogPayload> {
  const platforms = ["home_catalog_shared", "tv", "mobile"] as const;
  const rows = await Promise.all(
    platforms.map(async (platform) => {
      try {
        const result = await rpc<HomeSettingsRow[] | HomeSettingsRow | null>(
          config,
          session,
          "sync_pull_home_catalog_settings",
          { p_profile_id: profileId, p_platform: platform },
        );
        const row = Array.isArray(result) ? result[0] : result;
        if (!row) return null;
        const payload = parseHomeSettingsJson(row.settings_json);
        return {
          platform,
          payload,
          updatedAt: String(row.updated_at ?? ""),
        };
      } catch {
        return null;
      }
    }),
  );

  const found = rows.filter((r): r is NonNullable<typeof r> => r != null);
  const shared = found.find((r) => r.platform === "home_catalog_shared");
  const legacy = found.filter((r) => r.platform !== "home_catalog_shared");

  const selected =
    shared && (shared.payload.items?.length ?? 0) > 0
      ? shared
      : legacy
          .filter((r) => (r.payload.items?.length ?? 0) > 0)
          .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0] ??
        shared ??
        legacy.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];

  return selected?.payload ?? { items: [], genre_targets: {} };
}

function parseHomeSettingsJson(
  raw: SyncHomeCatalogPayload | string | undefined,
): SyncHomeCatalogPayload {
  if (!raw) return { items: [], genre_targets: {} };
  const obj = typeof raw === "string" ? (safeJson(raw) as SyncHomeCatalogPayload | null) : raw;
  if (!obj || typeof obj !== "object") return { items: [], genre_targets: {} };
  const items = Array.isArray(obj.items) ? (obj.items as SyncCatalogItem[]) : [];
  const genre_targets =
    obj.genre_targets && typeof obj.genre_targets === "object" ? obj.genre_targets : {};
  return {
    hide_unreleased_content: Boolean(obj.hide_unreleased_content),
    items,
    genre_targets,
  };
}
