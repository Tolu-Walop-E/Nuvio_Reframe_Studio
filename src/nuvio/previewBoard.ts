import { catalogPageUrl, fetchAddonJson, metaUrl } from "./addonFetch";
import type { LiveDataSource } from "./types";

export type PreviewItem = {
  id: string;
  title: string;
  description?: string;
  poster?: string;
  backdrop?: string;
  logo?: string;
  progress?: number;
  landscape?: boolean;
};

/** dataSource id → preview posters/tiles */
export type PreviewBoard = Record<string, PreviewItem[]>;

type CatalogMeta = {
  id?: string;
  type?: string;
  name?: string;
  description?: string;
  poster?: string;
  background?: string;
  logo?: string;
  landscapePoster?: string;
  posterShape?: string;
  _rawPosterUrl?: string;
};

type CatalogResponse = { metas?: CatalogMeta[] };

type MetaResponse = { meta?: CatalogMeta };

export type FolderCatalogSource = {
  addonId: string;
  type: string;
  catalogId: string;
  genre?: string;
};

export type CollectionFolderPreview = {
  collectionId: string;
  /** Display name of the parent collection (e.g. Genres, Anime). */
  title?: string;
  folders: Array<{
    id: string;
    title: string;
    coverImageUrl?: string;
    heroBackdropUrl?: string;
    titleLogoUrl?: string;
    tileShape?: string;
    /** Live catalogs that fill this folder with titles (movies/shows). */
    catalogSources: FolderCatalogSource[];
  }>;
};

const CINEMETA = "https://v3-cinemeta.strem.io";
const MAX_PER_RAIL = 12;
const CONCURRENCY = 6;

export async function buildPreviewBoard(args: {
  sources: LiveDataSource[];
  neededSourceIds: string[];
  catalogUrlBySourceId: Record<string, string>;
  addonBaseById: Record<string, string>;
  collections: CollectionFolderPreview[];
}): Promise<PreviewBoard> {
  const {
    sources,
    neededSourceIds,
    catalogUrlBySourceId,
    addonBaseById,
    collections,
  } = args;
  const board: PreviewBoard = {};
  const needed = new Set(neededSourceIds.filter(Boolean));

  needed.add("continueWatching");
  needed.add("featured");

  for (const source of sources) {
    if (source.kind === "collection" || source.kind === "catalog") {
      if (needed.has(source.id) || needed.size < 2) needed.add(source.id);
    }
  }

  const collectionById = new Map(collections.map((c) => [c.collectionId, c]));
  const jobs: Array<() => Promise<void>> = [];

  for (const sourceId of needed) {
    if (sourceId.startsWith("collection:")) {
      const folderRef = parseFolderSourceId(sourceId);
      if (folderRef) {
        // Expanded folder rail → load real title posters from that folder’s catalogs.
        const collection = collectionById.get(folderRef.collectionId);
        const folder = collection?.folders.find((f) => f.id === folderRef.folderId);
        if (!folder) continue;
        jobs.push(async () => {
          board[sourceId] = await loadFolderTitlePosters(
            [folder],
            catalogUrlBySourceId,
            addonBaseById,
          );
        });
        continue;
      }

      // Collapsed collection rail → show the collection’s folder tiles (covers).
      const collectionId = sourceId.slice("collection:".length);
      if (collectionId.includes(":folder:")) continue;
      const collection = collectionById.get(collectionId);
      if (!collection) continue;
      board[sourceId] = collection.folders
        .slice(0, MAX_PER_RAIL)
        .map((folder) => ({
          id: folder.id,
          title: folder.title,
          poster: folder.coverImageUrl || folder.heroBackdropUrl,
          backdrop: folder.heroBackdropUrl || folder.coverImageUrl,
          logo: folder.titleLogoUrl,
          landscape:
            !folder.tileShape || /landscape|wide/i.test(folder.tileShape),
        }))
        .filter((item) => item.poster);
      continue;
    }

    if (sourceId.startsWith("catalog:")) {
      const url = resolveCatalogFetchUrl(sourceId, catalogUrlBySourceId, addonBaseById);
      if (!url) continue;
      const fetchUrl = url;
      jobs.push(async () => {
        board[sourceId] = await fetchCatalogTitles(fetchUrl, sourceId);
      });
    }
  }

  await runPool(jobs, CONCURRENCY);

  if (!board.featured?.length) {
    for (const id of neededSourceIds) {
      const items = board[id];
      if (items?.length) {
        board.featured = items.slice(0, 6);
        break;
      }
    }
  }

  if (!board.continueWatching?.length) {
    const donor =
      Object.values(board).find((items) => items.some((i) => i.poster && !i.landscape)) ??
      Object.values(board).find((items) => items.some((i) => i.poster)) ??
      [];
    board.continueWatching = donor.slice(0, 8).map((item, i) => ({
      ...item,
      id: `cw-${item.id}`,
      landscape: true,
      progress: 25 + ((i * 19) % 60),
      poster: item.backdrop || item.poster,
    }));
  }

  // Fallback cover tiles for folder data-sources that failed to load metas.
  for (const collection of collections) {
    for (const folder of collection.folders) {
      const folderSourceId = `collection:${collection.collectionId}:folder:${folder.id}`;
      if (board[folderSourceId]?.length) continue;
      if (!folder.coverImageUrl && !folder.heroBackdropUrl) continue;
      board[folderSourceId] = [
        {
          id: folder.id,
          title: folder.title,
          poster: folder.coverImageUrl || folder.heroBackdropUrl,
          backdrop: folder.heroBackdropUrl || folder.coverImageUrl,
          logo: folder.titleLogoUrl,
          landscape: true,
        },
      ];
    }
  }

  return board;
}

async function loadFolderTitlePosters(
  folders: CollectionFolderPreview["folders"],
  catalogUrlBySourceId: Record<string, string>,
  addonBaseById: Record<string, string>,
): Promise<PreviewItem[]> {
  const seen = new Set<string>();
  const out: PreviewItem[] = [];

  for (const folder of folders) {
    for (const source of folder.catalogSources) {
      if (out.length >= MAX_PER_RAIL) break;
      const sourceId = `catalog:${source.addonId}:${source.type}:${source.catalogId}`;
      const url = resolveCatalogFetchUrl(sourceId, catalogUrlBySourceId, addonBaseById);
      if (!url) continue;
      try {
        const items = await fetchCatalogTitles(url, sourceId);
        for (const item of items) {
          if (seen.has(item.id)) continue;
          seen.add(item.id);
          out.push({ ...item, landscape: false });
          if (out.length >= MAX_PER_RAIL) break;
        }
      } catch {
        /* try next source */
      }
    }
    if (out.length >= MAX_PER_RAIL) break;
  }

  // If no living catalog content, fall back to folder cover tiles.
  if (!out.length) {
    return folders
      .slice(0, MAX_PER_RAIL)
      .map((folder) => ({
        id: folder.id,
        title: folder.title,
        poster: folder.coverImageUrl || folder.heroBackdropUrl,
        backdrop: folder.heroBackdropUrl || folder.coverImageUrl,
        logo: folder.titleLogoUrl,
        landscape: true,
      }))
      .filter((item) => item.poster);
  }

  return out;
}

async function fetchCatalogTitles(fetchUrl: string, sourceId: string): Promise<PreviewItem[]> {
  try {
    const data = await fetchAddonJson<CatalogResponse>(fetchUrl);
    let items = (data.metas ?? [])
      .slice(0, MAX_PER_RAIL)
      .map((m) => metaToItem(m, fetchUrl))
      .filter((m) => m.poster || m.backdrop || m.id);

    const missing = items.filter((i) => !i.poster && !i.backdrop && /^tt\d+/i.test(i.id));
    if (missing.length) {
      const hydrated = await hydrateCinemetaPosters(
        missing.map((i) => ({
          id: i.id.replace(/:.*/, ""),
          type: guessTypeFromSourceId(sourceId),
          title: i.title,
        })),
      );
      const byId = new Map(hydrated.map((h) => [h.id.replace(/:.*/, ""), h]));
      items = items.map((item) => {
        if (item.poster || item.backdrop) return item;
        const hit = byId.get(item.id.replace(/:.*/, ""));
        if (!hit) return item;
        return {
          ...item,
          poster: hit.poster || hit.backdrop,
          backdrop: hit.backdrop || hit.poster,
          logo: item.logo || hit.logo,
        };
      });
    }

    return items.filter((m) => m.poster || m.backdrop);
  } catch {
    return [];
  }
}

function resolveCatalogFetchUrl(
  sourceId: string,
  catalogUrlBySourceId: Record<string, string>,
  addonBaseById: Record<string, string>,
): string | undefined {
  let url = catalogUrlBySourceId[sourceId];
  if (url) return url;

  const parts = sourceId.split(":");
  if (parts.length < 4) return undefined;
  const catalogId = parts[parts.length - 1];
  const type = parts[parts.length - 2];
  const addonId = parts.slice(1, -2).join(":");
  const suffix = `:${type}:${catalogId}`;
  const match = Object.entries(catalogUrlBySourceId).find(([id]) => id.endsWith(suffix));
  if (match) return match[1];

  const base =
    addonBaseById[addonId] ||
    addonBaseById[addonId.toLowerCase()] ||
    Object.entries(addonBaseById).find(([k]) => k.toLowerCase() === addonId.toLowerCase())?.[1];
  if (!base) return undefined;
  return catalogPageUrl(base, type, catalogId);
}

export function metaToItem(meta: CatalogMeta, catalogFetchUrl?: string): PreviewItem {
  let poster =
    meta.poster || meta._rawPosterUrl || meta.landscapePoster || meta.background;
  let backdrop = meta.background || meta.landscapePoster || meta.poster;
  poster = absolutizeUrl(poster, catalogFetchUrl);
  backdrop = absolutizeUrl(backdrop, catalogFetchUrl);
  return {
    id: String(meta.id || meta.name || Math.random()),
    title: String(meta.name || "Untitled"),
    description: meta.description?.trim() || undefined,
    poster,
    backdrop,
    logo: absolutizeUrl(meta.logo, catalogFetchUrl),
    landscape: meta.posterShape === "landscape" || meta.posterShape === "wide",
  };
}

function absolutizeUrl(
  value: string | undefined,
  catalogFetchUrl?: string,
): string | undefined {
  if (!value) return undefined;
  if (/^https?:\/\//i.test(value) || value.startsWith("data:")) return value;
  if (!catalogFetchUrl) return value;
  try {
    return new URL(value, catalogFetchUrl).toString();
  } catch {
    return value;
  }
}

function guessTypeFromSourceId(sourceId: string): string {
  const parts = sourceId.split(":");
  return parts.length >= 3 ? parts[parts.length - 2] : "movie";
}

export async function hydrateCinemetaPosters(
  items: Array<{ id: string; type: string; title?: string; progress?: number }>,
): Promise<PreviewItem[]> {
  const out: PreviewItem[] = [];
  await runPool(
    items.slice(0, MAX_PER_RAIL).map((item) => async () => {
      try {
        const url = metaUrl(CINEMETA, item.type || "movie", item.id);
        const data = await fetchAddonJson<MetaResponse>(url);
        if (data.meta) {
          out.push({
            ...metaToItem(data.meta),
            progress: item.progress,
            landscape: true,
          });
        }
      } catch {
        /* skip */
      }
    }),
    CONCURRENCY,
  );
  return out;
}

async function runPool(jobs: Array<() => Promise<void>>, limit: number) {
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, jobs.length) }, async () => {
    while (i < jobs.length) {
      const job = jobs[i++];
      await job();
    }
  });
  await Promise.all(workers);
}

function parseFolderSourceId(
  sourceId: string,
): { collectionId: string; folderId: string } | null {
  const m = /^collection:([^:]+):folder:(.+)$/.exec(sourceId);
  if (!m) return null;
  return { collectionId: m[1], folderId: m[2] };
}
