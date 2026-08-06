import { slugify, withComputedCanvas, type ViewPack } from "../types/viewPack";

const STORAGE_KEY = "nuvio.reframe.studio.savedViews.v1";

export type SavedView = {
  id: string;
  name: string;
  pack: ViewPack;
  updatedAt: number;
  createdAt: number;
};

function readAll(): SavedView[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as SavedView[];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((v) => v && typeof v.id === "string" && v.pack)
      .map((v) => ({
        ...v,
        pack: withComputedCanvas(v.pack),
      }))
      .sort((a, b) => b.updatedAt - a.updatedAt);
  } catch {
    return [];
  }
}

function writeAll(views: SavedView[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(views));
}

export function listSavedViews(): SavedView[] {
  return readAll();
}

export function saveView(pack: ViewPack, name?: string): SavedView {
  const views = readAll();
  const title = (name ?? pack.name ?? "Untitled view").trim() || "Untitled view";
  const id = slugify(title);
  const now = Date.now();
  const existing = views.find((v) => v.id === id);
  const entry: SavedView = {
    id,
    name: title,
    pack: withComputedCanvas({
      ...pack,
      id,
      name: title,
      schemaVersion: 1,
    }),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  const next = [entry, ...views.filter((v) => v.id !== id)];
  writeAll(next);
  return entry;
}

export function loadSavedView(id: string): SavedView | null {
  return readAll().find((v) => v.id === id) ?? null;
}

export function deleteSavedView(id: string): void {
  writeAll(readAll().filter((v) => v.id !== id));
}

export function renameSavedView(id: string, name: string): SavedView | null {
  const title = name.trim();
  if (!title) return null;
  const views = readAll();
  const idx = views.findIndex((v) => v.id === id);
  if (idx < 0) return null;
  const updated: SavedView = {
    ...views[idx],
    name: title,
    pack: withComputedCanvas({
      ...views[idx].pack,
      name: title,
    }),
    updatedAt: Date.now(),
  };
  const next = [...views];
  next[idx] = updated;
  writeAll(next);
  return updated;
}
