import type { ViewBlock, ViewPack } from "../types/viewPack";
import { VIEWPORT_WIDTH, withComputedCanvas } from "../types/viewPack";
import type { LiveDataSource } from "./types";

export type SyncCatalogItem = {
  addon_id?: string;
  type?: string;
  catalog_id?: string;
  enabled?: boolean;
  order?: number;
  custom_title?: string;
  is_collection?: boolean;
  collection_id?: string;
};

export type SyncHomeCatalogPayload = {
  hide_unreleased_content?: boolean;
  items?: SyncCatalogItem[];
  genre_targets?: Record<string, unknown>;
};

const NAV_H = 72;
const HERO_TOP = 108;
const HERO_H = 360;
const RAIL_H = 210;
/** Space for floating rail titles so rows never visually overlap. */
const RAIL_GAP = 52;
const PAD_X = 0;

/**
 * Rebuild a Studio pack to mirror the user's Nuvio home catalog order.
 * Preview and Send-to-TV target vanilla Nuvio Netflix home (PACK_RUNTIME_CONTRACT.md).
 */
export function buildPackFromNuvioHome(args: {
  email: string;
  profileId: number;
  items: SyncCatalogItem[];
  sources: LiveDataSource[];
  /** Real names keyed by catalogId and `type:catalogId` from addon manifests. */
  catalogNames?: Record<string, string>;
  hasGenreTargets?: boolean;
}): ViewPack {
  const { email, profileId, items, sources, catalogNames = {}, hasGenreTargets } = args;
  const sourceById = new Map(sources.map((s) => [s.id, s]));
  const enabled = [...items]
    .filter((item) => item.enabled !== false)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  const blocks: ViewBlock[] = [
    {
      id: "nav",
      type: "topNav",
      x: 0,
      y: 0,
      w: VIEWPORT_WIDTH,
      h: NAV_H,
      dataSource: "none",
      trailer: false,
      label: "Top nav",
    },
  ];

  const firstRail = enabled[0];
  const heroSource = firstRail
    ? dataSourceIdForItem(firstRail)
    : "featured";
  const heroLabel =
    titleForItem(firstRail, sourceById, catalogNames) ||
    sourceById.get(heroSource)?.label ||
    "Featured";

  blocks.push({
    id: "hero",
    type: "hero",
    x: 40,
    y: HERO_TOP,
    w: VIEWPORT_WIDTH - 80,
    h: HERO_H,
    dataSource: heroSource,
    trailer: true,
    label: heroLabel,
  });

  let y = HERO_TOP + HERO_H + RAIL_GAP;

  blocks.push({
    id: "cw",
    type: "mediaRail",
    x: PAD_X,
    y,
    w: VIEWPORT_WIDTH,
    h: RAIL_H,
    dataSource: "continueWatching",
    trailer: true,
    label: "Continue Watching",
    posterGrow: false,
    contentAlign: "start",
  });
  y += RAIL_H + RAIL_GAP;

  if (hasGenreTargets) {
    blocks.push({
      id: "genres",
      type: "genreRail",
      x: PAD_X,
      y,
      w: VIEWPORT_WIDTH,
      h: 100,
      dataSource: "genres",
      trailer: false,
      label: "Genres",
      contentAlign: "start",
    });
    y += 100 + RAIL_GAP;
  }

  enabled.forEach((item, index) => {
    const dataSource = dataSourceIdForItem(item);
    const label =
      titleForItem(item, sourceById, catalogNames) ||
      sourceById.get(dataSource)?.label ||
      friendlyCatalogLabel(item) ||
      dataSource;
    const isCollection = Boolean(item.is_collection) || dataSource.startsWith("collection:");
    blocks.push({
      id: `home-rail-${index}-${slug(dataSource)}`,
      type: isCollection ? "collectionRail" : "mediaRail",
      x: PAD_X,
      y,
      w: VIEWPORT_WIDTH,
      h: RAIL_H,
      dataSource,
      trailer: !isCollection,
      label,
      posterGrow: !isCollection && item.type !== "channel",
      contentAlign: "start",
    });
    y += RAIL_H + RAIL_GAP;
  });

  // If home settings were empty, fall back to every live catalog/collection.
  if (enabled.length === 0) {
    const fallback = sources.filter((s) => s.kind === "catalog" || s.kind === "collection");
    fallback.forEach((source, index) => {
      const isCollection = source.kind === "collection";
      blocks.push({
        id: `fallback-${index}-${slug(source.id)}`,
        type: isCollection ? "collectionRail" : "mediaRail",
        x: PAD_X,
        y,
        w: VIEWPORT_WIDTH,
        h: RAIL_H,
        dataSource: source.id,
        trailer: !isCollection,
        label: source.label,
        posterGrow: !isCollection,
        contentAlign: "start",
      });
      y += RAIL_H + RAIL_GAP;
    });
  }

  return withComputedCanvas({
    schemaVersion: 1,
    id: `nuvio-home-p${profileId}`,
    name: `My Nuvio home · ${email.split("@")[0] || "account"}`,
    description: "Synced from your Nuvio library order — edit blocks, then Publish link for TV.",
    canvas: { width: VIEWPORT_WIDTH, height: 1080 },
    blocks,
  });
}

function dataSourceIdForItem(item: SyncCatalogItem): string {
  if (item.is_collection || item.collection_id) {
    return `collection:${String(item.collection_id || item.catalog_id || "").trim()}`;
  }
  const addonId = String(item.addon_id ?? "").trim();
  const type = String(item.type ?? "").trim();
  const catalogId = String(item.catalog_id ?? "").trim();
  if (!addonId || !type || !catalogId) return "featured";
  return `catalog:${addonId}:${type}:${catalogId}`;
}

function titleForItem(
  item: SyncCatalogItem | undefined,
  sourceById: Map<string, LiveDataSource>,
  catalogNames: Record<string, string> = {},
): string {
  if (!item) return "";
  const custom = String(item.custom_title ?? "").trim();
  if (custom) return custom;

  const type = String(item.type ?? "").trim();
  const catalogId = String(item.catalog_id ?? "").trim();

  // Prefer real addon catalog names (BingeCat list titles live here).
  if (type && catalogId) {
    const fromManifest =
      catalogNames[`${type}:${catalogId}`] ||
      catalogNames[catalogId] ||
      catalogNames[catalogId.toLowerCase()];
    if (fromManifest && !isRawCatalogId(fromManifest, catalogId)) return fromManifest;
  }

  const id = dataSourceIdForItem(item);
  const direct = sourceById.get(id)?.label;
  if (direct && !isRawCatalogId(direct, catalogId)) return direct;

  if (type && catalogId) {
    const suffix = `:${type}:${catalogId}`;
    for (const [sourceId, source] of sourceById) {
      if (sourceId.endsWith(suffix) && source.label && !isRawCatalogId(source.label, catalogId)) {
        return source.label;
      }
    }
  }

  return friendlyCatalogLabel(item);
}

function isRawCatalogId(label: string, catalogId: string): boolean {
  const a = label.trim().toLowerCase();
  const b = catalogId.trim().toLowerCase();
  if (!a || !b) return false;
  if (a === b) return true;
  if (a.endsWith(b)) return true;
  // "BingeCat · List 37520" style placeholders
  if (/^(bingecat\s*[·•-]\s*)?(list\s*)?\d+$/i.test(a.replace(/^bingecat\s*[·•-]\s*/i, "").trim())) {
    return /^aicat_list_\d+$/i.test(catalogId);
  }
  return false;
}

/** Readable fallback when manifest name isn't available yet. */
export function friendlyCatalogLabel(item: SyncCatalogItem): string {
  const catalogId = String(item.catalog_id ?? "").trim();
  const addonId = String(item.addon_id ?? "").trim();
  if (!catalogId) return "";

  let name = catalogId
    .replace(/^aicat_/i, "")
    .replace(/^binge?cat_/i, "")
    .replace(/_/g, " ")
    .trim();

  name = name.replace(/\b\w/g, (c) => c.toUpperCase());

  if (/aicat|binge?cat/i.test(addonId) || /^aicat_/i.test(catalogId)) {
    return `BingeCat · ${name}`;
  }
  return name;
}

function slug(value: string): string {
  return value.replace(/[^a-zA-Z0-9]+/g, "-").slice(0, 40);
}
