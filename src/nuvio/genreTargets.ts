import type { CollectionFolderPreview } from "./previewBoard";
import type { LiveDataSource } from "./types";
import type { SyncCatalogItem, SyncHomeCatalogPayload } from "./homePack";

export type GenreTargetKind = "catalog" | "collection_folder";

export type GenreTarget = {
  kind: GenreTargetKind;
  addon_id?: string;
  type?: string;
  catalog_id?: string;
  collection_id?: string;
  folder_id?: string;
};

export type GenreChip = {
  key: string;
  label: string;
};

export type GenreDestinationOption = {
  value: string;
  label: string;
  group: "catalog" | "folder";
  target: GenreTarget;
};

/** Encode a target as a select value. */
export function encodeGenreTarget(target: GenreTarget | null | undefined): string {
  if (!target) return "";
  if (target.kind === "catalog") {
    return `catalog|${target.addon_id ?? ""}|${target.type ?? ""}|${target.catalog_id ?? ""}`;
  }
  return `folder|${target.collection_id ?? ""}|${target.folder_id ?? ""}`;
}

export function decodeGenreTarget(value: string): GenreTarget | null {
  if (!value) return null;
  const parts = value.split("|");
  if (parts[0] === "catalog" && parts.length >= 4) {
    return {
      kind: "catalog",
      addon_id: parts[1],
      type: parts[2],
      catalog_id: parts.slice(3).join("|"),
    };
  }
  if (parts[0] === "folder" && parts.length >= 3) {
    return {
      kind: "collection_folder",
      collection_id: parts[1],
      folder_id: parts.slice(2).join("|"),
    };
  }
  return null;
}

export function parseGenreTargets(raw: Record<string, unknown> | undefined): Record<string, GenreTarget> {
  const out: Record<string, GenreTarget> = {};
  if (!raw) return out;
  for (const [key, value] of Object.entries(raw)) {
    if (!key || !value || typeof value !== "object") continue;
    const obj = value as Record<string, unknown>;
    const kind = String(obj.kind ?? "");
    if (kind === "catalog") {
      const addon_id = String(obj.addon_id ?? "").trim();
      const type = String(obj.type ?? "").trim();
      const catalog_id = String(obj.catalog_id ?? "").trim();
      if (!addon_id || !type || !catalog_id) continue;
      out[key] = { kind: "catalog", addon_id, type, catalog_id };
    } else if (kind === "collection_folder") {
      const collection_id = String(obj.collection_id ?? "").trim();
      const folder_id = String(obj.folder_id ?? "").trim();
      if (!collection_id || !folder_id) continue;
      out[key] = { kind: "collection_folder", collection_id, folder_id };
    }
  }
  return out;
}

const SPECIAL_GENRE_LABELS: Record<string, string> = {
  scifi: "Sci-Fi",
  sci_fi: "Sci-Fi",
  kdrama: "K-Drama",
  romcom: "Romantic Comedy",
  romantic_comedy: "Romantic Comedy",
  film_noir: "Film-Noir",
  science_fiction: "Sci-Fi",
};

function humanizeGenreToken(token: string): string {
  const key = token.trim().toLowerCase().replace(/-/g, "_");
  if (SPECIAL_GENRE_LABELS[key]) return SPECIAL_GENRE_LABELS[key]!;
  return key
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

/** Parse dedicated `genre_*_movies` / `genre_*_series` catalog ids (matches TV). */
export function parseDedicatedGenreLabel(catalogId: string, catalogName: string): string | null {
  const id = catalogId.trim().toLowerCase();
  if (!id.startsWith("genre_")) return null;
  const pair = /^genre_([a-z0-9]+)_(movies|movie|series|shows|show|tv)$/.exec(id);
  if (pair) return humanizeGenreToken(pair[1]!);
  let cleaned = catalogName.trim();
  if (cleaned) {
    cleaned = cleaned
      .replace(/\s*(movies|movie|series|shows|tv)\s*$/i, "")
      .replace(/^(latest|popular|top\s*rated|best|trending|most\s*popular)\s+/i, "")
      .trim();
    if (cleaned) return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  }
  return null;
}

/**
 * Genre chips derived from available catalogs (dedicated genre_* ids),
 * with Genres/Anime collection fallback — same idea as the TV Netflix strip.
 * Studio uses HOME keys (`genre|action`); TV adds `|movie` / `|series` per tab.
 */
export function genreChipsFromCatalogs(
  sources: LiveDataSource[],
  collections: CollectionFolderPreview[],
  catalogNames: Record<string, string> = {},
): GenreChip[] {
  const chips = new Map<string, GenreChip>();
  for (const source of sources) {
    if (source.kind !== "catalog") continue;
    const parts = source.id.replace(/^catalog:/, "").split(":");
    if (parts.length < 3) continue;
    const type = (parts[1] || "").toLowerCase();
    if (type !== "movie" && type !== "series") continue;
    const catalogId = parts.slice(2).join(":");
    const name =
      catalogNames[`${type}:${catalogId}`] || catalogNames[catalogId] || source.label || catalogId;
    const label = parseDedicatedGenreLabel(catalogId, name);
    if (!label) continue;
    const key = `genre|${label.toLowerCase()}`;
    if (!chips.has(key)) chips.set(key, { key, label });
  }
  if (chips.size > 0) {
    // Keep Anime as a convenience chip when that collection exists.
    if (collections.some((c) => (c.title || "").trim().toLowerCase() === "anime")) {
      chips.set("genre|anime", { key: "genre|anime", label: "Anime" });
    }
    return [...chips.values()].sort((a, b) => a.label.localeCompare(b.label));
  }
  return genreChipsFromCollections(collections);
}

/** Fallback: chips from Genres / Anime collections. */
export function genreChipsFromCollections(collections: CollectionFolderPreview[]): GenreChip[] {
  const chips = new Map<string, GenreChip>();
  for (const collection of collections) {
    const title = (collection.title || "").trim();
    const isGenres = title.toLowerCase() === "genres";
    const isAnime = title.toLowerCase() === "anime";
    if (!isGenres && !isAnime) continue;
    if (isAnime) {
      chips.set("genre|anime", { key: "genre|anime", label: "Anime" });
      continue;
    }
    for (const folder of collection.folders) {
      const label = folder.title.trim();
      if (!label) continue;
      const key = `genre|${label.toLowerCase()}`;
      if (!chips.has(key)) chips.set(key, { key, label });
    }
  }
  return [...chips.values()].sort((a, b) => a.label.localeCompare(b.label));
}

export function genreDestinationOptions(
  sources: LiveDataSource[],
  collections: CollectionFolderPreview[],
  catalogNames: Record<string, string>,
): GenreDestinationOption[] {
  const options: GenreDestinationOption[] = [];
  for (const source of sources) {
    if (source.kind !== "catalog") continue;
    const parts = source.id.replace(/^catalog:/, "").split(":");
    if (parts.length < 3) continue;
    const [addonId, type, ...rest] = parts;
    const catalogId = rest.join(":");
    const name =
      catalogNames[`${type}:${catalogId}`] ||
      catalogNames[catalogId] ||
      source.label;
    options.push({
      value: encodeGenreTarget({
        kind: "catalog",
        addon_id: addonId,
        type,
        catalog_id: catalogId,
      }),
      label: name,
      group: "catalog",
      target: { kind: "catalog", addon_id: addonId, type, catalog_id: catalogId },
    });
  }
  for (const collection of collections) {
    const collectionTitle = collection.title?.trim() || collection.collectionId;
    for (const folder of collection.folders) {
      options.push({
        value: encodeGenreTarget({
          kind: "collection_folder",
          collection_id: collection.collectionId,
          folder_id: folder.id,
        }),
        label: folder.title.trim() || folder.id,
        group: "folder",
        target: {
          kind: "collection_folder",
          collection_id: collection.collectionId,
          folder_id: folder.id,
        },
      });
      // Prefer readable subtitle via label prefix for folders
      const last = options[options.length - 1];
      last.label = `${folder.title.trim() || folder.id} · ${collectionTitle}`;
    }
  }
  return options.sort((a, b) => a.label.localeCompare(b.label));
}

export function describeGenreTarget(
  target: GenreTarget | undefined,
  options: GenreDestinationOption[],
): string {
  if (!target) return "Automatic (catalog-derived for this genre)";
  const encoded = encodeGenreTarget(target);
  return options.find((o) => o.value === encoded)?.label ?? "Custom destination";
}

export function homeCatalogPayloadWithGenreTargets(
  base: SyncHomeCatalogPayload,
  genreTargets: Record<string, GenreTarget>,
): SyncHomeCatalogPayload {
  const genre_targets: Record<string, unknown> = {};
  for (const [key, target] of Object.entries(genreTargets)) {
    if (target.kind === "catalog") {
      genre_targets[key] = {
        kind: "catalog",
        addon_id: target.addon_id,
        type: target.type,
        catalog_id: target.catalog_id,
      };
    } else {
      genre_targets[key] = {
        kind: "collection_folder",
        collection_id: target.collection_id,
        folder_id: target.folder_id,
      };
    }
  }
  return {
    hide_unreleased_content: Boolean(base.hide_unreleased_content),
    items: (base.items ?? []) as SyncCatalogItem[],
    genre_targets,
  };
}
