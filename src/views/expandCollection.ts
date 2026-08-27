import type { CollectionFolderPreview } from "../nuvio/previewBoard";
import {
  FOCUSED_METADATA_HEIGHT,
  MAX_LABELED_RAIL_HEIGHT,
  VIEWPORT_WIDTH,
  layoutBlocks,
  withComputedCanvas,
  type ViewBlock,
  type ViewPack,
} from "../types/viewPack";

const RAIL_H = 210;
const RAIL_GAP = 44;

/**
 * Height for newly expanded catalog rails so they match existing media rails
 * and pick up pack `catalogPosterScale` in Studio preview + TV row scales.
 */
function catalogRailHeightForExpand(pack: ViewPack): number {
  const peers = pack.blocks
    .filter(
      (b) =>
        b.type === "mediaRail" &&
        b.dataSource !== "continueWatching" &&
        !parseFolderDataSource(b.dataSource),
    )
    .map((b) => b.h)
    .filter((h) => h > 0)
    .sort((a, b) => a - b);
  if (peers.length > 0) {
    return peers[Math.floor(peers.length / 2)]!;
  }
  if (pack.showFocusedPosterInfo === true) {
    // title + solid poster band + ≥2-line footer (within labeled cap)
    return Math.min(MAX_LABELED_RAIL_HEIGHT, 32 + 220 + FOCUSED_METADATA_HEIGHT);
  }
  return RAIL_H;
}

export function folderDataSourceId(collectionId: string, folderId: string): string {
  return `collection:${collectionId}:folder:${folderId}`;
}

export function catalogDataSourceId(addonId: string, type: string, catalogId: string): string {
  return `catalog:${addonId}:${type}:${catalogId}`;
}

export function parseCatalogDataSource(
  dataSource: string,
): { addonId: string; type: string; catalogId: string } | null {
  if (!dataSource.startsWith("catalog:")) return null;
  const parts = dataSource.slice("catalog:".length).split(":", 3);
  if (parts.length < 3) return null;
  const addonId = parts[0].trim();
  const type = parts[1].trim();
  const catalogId = parts[2].trim();
  if (!addonId || !type || !catalogId) return null;
  return { addonId, type, catalogId };
}

/** Friendly Movies / TV Shows label from a Stremio catalog type. */
export function catalogTypeLabel(type: string): string {
  switch (type.trim().toLowerCase()) {
    case "movie":
    case "movies":
      return "Movies";
    case "series":
    case "tv":
    case "show":
    case "shows":
      return "TV Shows";
    case "channel":
    case "channels":
      return "Channels";
    default: {
      const trimmed = type.trim();
      if (!trimmed) return "";
      return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
    }
  }
}

export function dataSourceTypeLabel(dataSource: string): string {
  const parsed = parseCatalogDataSource(dataSource);
  return parsed ? catalogTypeLabel(parsed.type) : "";
}

function labelAlreadyIncludesType(label: string, typeLabel: string): boolean {
  const text = label.toLowerCase();
  if (typeLabel === "Movies") return /\bmovies?\b/.test(text);
  if (typeLabel === "TV Shows") return /\b(tv shows?|series|shows?)\b/.test(text);
  if (typeLabel === "Channels") return /\bchannels?\b/.test(text);
  return text.includes(typeLabel.toLowerCase());
}

/** Folder title plus Movies / TV Shows so expanded rails stay distinguishable. */
export function expandedCatalogRailLabel(
  folderTitle: string,
  source: { type: string; catalogId: string },
  catalogNames: Record<string, string> = {},
): string {
  const typeLabel = catalogTypeLabel(source.type);
  const named = (
    catalogNames[`${source.type}:${source.catalogId}`] ||
    catalogNames[source.catalogId] ||
    ""
  ).trim();
  const title = folderTitle.trim() || named || typeLabel || "Rail";
  const parts = [title];
  if (
    named &&
    named.toLowerCase() !== title.toLowerCase() &&
    named.toLowerCase() !== source.catalogId.toLowerCase() &&
    named.toLowerCase() !== typeLabel.toLowerCase()
  ) {
    parts.push(named);
  }
  if (typeLabel && !labelAlreadyIncludesType(parts.join(" · "), typeLabel)) {
    parts.push(typeLabel);
  }
  return parts.join(" · ");
}

/** Preview / toolbar title: keep the authored label, append Movies or TV Shows when missing. */
export function railTitleWithCatalogType(label: string | undefined, dataSource: string): string {
  const title = (label ?? "").trim();
  const typeLabel = dataSourceTypeLabel(dataSource);
  if (!typeLabel) return title;
  if (title && labelAlreadyIncludesType(title, typeLabel)) return title;
  if (!title) return typeLabel;
  return `${title} · ${typeLabel}`;
}

export function parseFolderDataSource(
  dataSource: string,
): { collectionId: string; folderId: string } | null {
  const m = /^collection:([^:]+):folder:(.+)$/.exec(dataSource);
  if (!m) return null;
  return { collectionId: m[1], folderId: m[2] };
}

/** `collection:id` hub (not an expanded folder rail). */
export function parseCollectionHubDataSource(dataSource: string): string | null {
  const ds = dataSource.trim();
  if (!ds.startsWith("collection:") || ds.includes(":folder:")) return null;
  const id = ds.slice("collection:".length).trim();
  return id || null;
}

/** When expanding, emit only movie catalogs, only series catalogs, or both. */
export type ExpandKeepOnly = "all" | "movie" | "series";

export function sourceMatchesKeep(type: string, keep: ExpandKeepOnly): boolean {
  if (keep === "all") return true;
  const normalized = type.trim().toLowerCase();
  if (keep === "movie") return normalized === "movie" || normalized === "movies";
  return (
    normalized === "series" ||
    normalized === "tv" ||
    normalized === "show" ||
    normalized === "shows"
  );
}

export function catalogKeepLabel(keep: ExpandKeepOnly): string {
  if (keep === "movie") return "Movies";
  if (keep === "series") return "TV Shows";
  return "Movies and TV Shows";
}

/** Drop selected catalog rails whose type is not Movies or TV Shows. */
export function keepOnlyCatalogTypeInPack(
  pack: ViewPack,
  blockIds: string[],
  keep: ExpandKeepOnly,
): ViewPack | null {
  if (keep === "all" || blockIds.length === 0) return null;
  const idSet = new Set(blockIds);
  const nextBlocks = pack.blocks.filter((block) => {
    if (!idSet.has(block.id)) return true;
    const parsed = parseCatalogDataSource(block.dataSource);
    if (!parsed) return true;
    return sourceMatchesKeep(parsed.type, keep);
  });
  if (nextBlocks.length === pack.blocks.length) return null;
  return withComputedCanvas({
    ...pack,
    blocks: layoutBlocks(nextBlocks, RAIL_GAP, pack),
  });
}

/**
 * Replace a collection rail with content rails for every folder inside it.
 *
 * Prefer real `catalog:…` sources from each folder so TV can load titles.
 * If a folder has multiple catalogs (e.g. movies + shows), each becomes its own rail.
 * Folders with no catalog sources fall back to `collection:…:folder:…` for preview.
 */
export function expandCollectionIntoContentRails(
  pack: ViewPack,
  collectionBlockId: string,
  collections: CollectionFolderPreview[],
  catalogNames: Record<string, string> = {},
  keep: ExpandKeepOnly = "all",
): ViewPack | null {
  const block = pack.blocks.find((b) => b.id === collectionBlockId);
  if (!block || block.type !== "collectionRail") return null;
  if (!block.dataSource.startsWith("collection:")) return null;
  if (parseFolderDataSource(block.dataSource)) return null;

  const collectionId = block.dataSource.slice("collection:".length);
  const collection = collections.find((c) => c.collectionId === collectionId);
  if (!collection?.folders.length) return null;

  const railH = catalogRailHeightForExpand(pack);
  const contentRails: ViewBlock[] = [];
  let railIndex = 0;

  for (const folder of collection.folders) {
    const folderTitle = folder.title || folder.id;
    const sources = (folder.catalogSources ?? []).filter((source) =>
      sourceMatchesKeep(source.type, keep),
    );

    if (sources.length === 0) {
      if (keep !== "all") continue;
      contentRails.push({
        id: `content-${collectionId.slice(0, 8)}-${folder.id.slice(0, 8)}-${railIndex}`,
        type: "mediaRail",
        x: 0,
        y: block.y + railIndex * (railH + RAIL_GAP),
        w: VIEWPORT_WIDTH,
        h: railH,
        dataSource: folderDataSourceId(collectionId, folder.id),
        trailer: true,
        label: folderTitle,
        posterGrow: true,
        contentAlign: block.contentAlign ?? "start",
      });
      railIndex += 1;
      continue;
    }

    for (const source of sources) {
      const dataSource = catalogDataSourceId(source.addonId, source.type, source.catalogId);
      const label = expandedCatalogRailLabel(folderTitle, source, catalogNames);

      contentRails.push({
        id: `content-${collectionId.slice(0, 8)}-${folder.id.slice(0, 8)}-${railIndex}`,
        type: "mediaRail",
        x: 0,
        y: block.y + railIndex * (railH + RAIL_GAP),
        w: VIEWPORT_WIDTH,
        h: railH,
        dataSource,
        trailer: true,
        label,
        posterGrow: true,
        contentAlign: block.contentAlign ?? "start",
      });
      railIndex += 1;
    }
  }

  if (!contentRails.length) return null;

  const without = pack.blocks.filter((b) => b.id !== collectionBlockId);
  return withComputedCanvas({
    ...pack,
    blocks: layoutBlocks([...without, ...contentRails], RAIL_GAP, pack),
  });
}

/**
 * Replace an expanded folder rail with one media rail per catalog source
 * inside that folder (e.g. Movies + Shows).
 */
export function expandFolderIntoCatalogRails(
  pack: ViewPack,
  folderBlockId: string,
  collections: CollectionFolderPreview[],
  catalogNames: Record<string, string> = {},
  keep: ExpandKeepOnly = "all",
): ViewPack | null {
  const block = pack.blocks.find((b) => b.id === folderBlockId);
  if (!block) return null;
  const parsed = parseFolderDataSource(block.dataSource);
  if (!parsed) return null;

  const collection = collections.find((c) => c.collectionId === parsed.collectionId);
  const folder = collection?.folders.find((f) => f.id === parsed.folderId);
  if (!folder?.catalogSources.length) return null;

  const folderTitle = folder.title || block.label || "Folder";
  const railH = catalogRailHeightForExpand(pack);
  const sources = folder.catalogSources.filter((source) => sourceMatchesKeep(source.type, keep));
  if (sources.length === 0) return null;
  const catalogRails: ViewBlock[] = sources.map((source, index) => {
    const dataSource = catalogDataSourceId(source.addonId, source.type, source.catalogId);
    return {
      id: `catalog-rail-${parsed.folderId.slice(0, 8)}-${index}-${slugId(source.catalogId)}`,
      type: "mediaRail" as const,
      x: 0,
      y: block.y + index * (railH + RAIL_GAP),
      w: VIEWPORT_WIDTH,
      h: railH,
      dataSource,
      trailer: true,
      label: expandedCatalogRailLabel(folderTitle, source, catalogNames),
      posterGrow: true,
      contentAlign: block.contentAlign ?? "start",
    };
  });

  const without = pack.blocks.filter((b) => b.id !== folderBlockId);
  return withComputedCanvas({
    ...pack,
    blocks: layoutBlocks([...without, ...catalogRails], RAIL_GAP, pack),
  });
}

/** Expand the collection hub with this id, regardless of Studio block id. */
export function expandCollectionHubById(
  pack: ViewPack,
  collectionId: string,
  collections: CollectionFolderPreview[],
  catalogNames: Record<string, string> = {},
  keep: ExpandKeepOnly = "all",
): ViewPack | null {
  const block = pack.blocks.find(
    (b) => b.type === "collectionRail" && parseCollectionHubDataSource(b.dataSource) === collectionId,
  );
  if (!block) return null;
  return expandCollectionIntoContentRails(pack, block.id, collections, catalogNames, keep);
}

/** Expand a `collection:id:folder:id` rail on another screen that still has that folder. */
export function expandFolderByIds(
  pack: ViewPack,
  collectionId: string,
  folderId: string,
  collections: CollectionFolderPreview[],
  catalogNames: Record<string, string> = {},
  keep: ExpandKeepOnly = "all",
): ViewPack | null {
  const ds = folderDataSourceId(collectionId, folderId);
  const block = pack.blocks.find((b) => b.dataSource === ds);
  if (!block) return null;
  return expandFolderIntoCatalogRails(pack, block.id, collections, catalogNames, keep);
}

function slugId(value: string): string {
  return value.replace(/[^a-zA-Z0-9]+/g, "-").slice(0, 28);
}
