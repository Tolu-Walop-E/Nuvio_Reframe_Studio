import type { CollectionFolderPreview } from "../nuvio/previewBoard";
import {
  VIEWPORT_WIDTH,
  restackVertically,
  withComputedCanvas,
  type ViewBlock,
  type ViewPack,
} from "../types/viewPack";

const RAIL_H = 210;
const RAIL_GAP = 44;

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
 * Replace a collection rail with one media rail per folder, each showing the
 * actual titles from that folder’s catalog sources (not folder cover tiles).
 */
export function expandCollectionIntoContentRails(
  pack: ViewPack,
  collectionBlockId: string,
  collections: CollectionFolderPreview[],
): ViewPack | null {
  const block = pack.blocks.find((b) => b.id === collectionBlockId);
  if (!block || block.type !== "collectionRail") return null;
  if (!block.dataSource.startsWith("collection:")) return null;
  if (parseFolderDataSource(block.dataSource)) return null;

  const collectionId = block.dataSource.slice("collection:".length);
  const collection = collections.find((c) => c.collectionId === collectionId);
  if (!collection?.folders.length) return null;

  const contentRails: ViewBlock[] = collection.folders.map((folder, index) => ({
    id: `content-${collectionId.slice(0, 8)}-${folder.id.slice(0, 8)}-${index}`,
    type: "mediaRail",
    x: 0,
    y: block.y + index * (RAIL_H + RAIL_GAP),
    w: VIEWPORT_WIDTH,
    h: RAIL_H,
    dataSource: folderDataSourceId(collectionId, folder.id),
    trailer: true,
    label: folder.title || folder.id,
    posterGrow: true,
    contentAlign: block.contentAlign ?? "start",
  }));

  const without = pack.blocks.filter((b) => b.id !== collectionBlockId);
  return withComputedCanvas({
    ...pack,
    blocks: restackVertically([...without, ...contentRails], RAIL_GAP),
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
  const catalogRails: ViewBlock[] = folder.catalogSources.map((source, index) => {
    const dataSource = catalogDataSourceId(source.addonId, source.type, source.catalogId);
    const named =
      catalogNames[`${source.type}:${source.catalogId}`] || catalogNames[source.catalogId];
    const typeNice = source.type.charAt(0).toUpperCase() + source.type.slice(1);
    return {
      id: `catalog-rail-${parsed.folderId.slice(0, 8)}-${index}-${slugId(source.catalogId)}`,
      type: "mediaRail" as const,
      x: 0,
      y: block.y + index * (RAIL_H + RAIL_GAP),
      w: VIEWPORT_WIDTH,
      h: RAIL_H,
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
    blocks: restackVertically([...without, ...catalogRails], RAIL_GAP),
  });
}

function slugId(value: string): string {
  return value.replace(/[^a-zA-Z0-9]+/g, "-").slice(0, 28);
}
