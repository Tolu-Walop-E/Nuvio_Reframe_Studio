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

export function parseFolderDataSource(
  dataSource: string,
): { collectionId: string; folderId: string } | null {
  const m = /^collection:([^:]+):folder:(.+)$/.exec(dataSource);
  if (!m) return null;
  return { collectionId: m[1], folderId: m[2] };
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
    const sources = folder.catalogSources ?? [];

    if (sources.length === 0) {
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
      const named =
        catalogNames[`${source.type}:${source.catalogId}`] || catalogNames[source.catalogId];
      const typeNice = source.type.charAt(0).toUpperCase() + source.type.slice(1);
      const label =
        sources.length === 1
          ? folderTitle
          : named
            ? `${folderTitle} · ${named}`
            : `${folderTitle} · ${typeNice}`;

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
  const catalogRails: ViewBlock[] = folder.catalogSources.map((source, index) => {
    const dataSource = catalogDataSourceId(source.addonId, source.type, source.catalogId);
    const named =
      catalogNames[`${source.type}:${source.catalogId}`] || catalogNames[source.catalogId];
    const typeNice = source.type.charAt(0).toUpperCase() + source.type.slice(1);
    return {
      id: `catalog-rail-${parsed.folderId.slice(0, 8)}-${index}-${slugId(source.catalogId)}`,
      type: "mediaRail" as const,
      x: 0,
      y: block.y + index * (railH + RAIL_GAP),
      w: VIEWPORT_WIDTH,
      h: railH,
      dataSource,
      trailer: true,
      label: named ? `${folderTitle} · ${named}` : `${folderTitle} · ${typeNice}`,
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

function slugId(value: string): string {
  return value.replace(/[^a-zA-Z0-9]+/g, "-").slice(0, 28);
}
