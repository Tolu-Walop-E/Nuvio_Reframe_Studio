import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AccountPanel } from "./account/AccountPanel";
import { BLOCK_CATALOG, blockDef, type BlockType } from "./catalog/blocks";
import { mergeDataSources, sourcesForBlock } from "./catalog/dataSources";
import { DEMO_PACKS, clonePack, parseViewPack } from "./demos";
import { defaultConfig, loadSession, saveSession } from "./nuvio/config";
import { ensureFreshSession } from "./nuvio/client";
import { loadNuvioLibrary } from "./nuvio/library";
import type { NuvioLibrarySnapshot, NuvioSession } from "./nuvio/types";
import { MockBlockPreview } from "./preview/MockBlockPreview";
import {
  VIEWPORT_HEIGHT,
  VIEWPORT_WIDTH,
  centerBlockX,
  computeCanvasSize,
  createEmptyPack,
  resolveVerticalOverlap,
  restackVertically,
  slugify,
  snapBlockPosition,
  withComputedCanvas,
  type ViewBlock,
  type ViewPack,
} from "./types/viewPack";
import { expandCollectionIntoContentRails, expandFolderIntoCatalogRails, parseFolderDataSource } from "./views/expandCollection";
import {
  deleteSavedView,
  listSavedViews,
  loadSavedView,
  saveView,
  type SavedView,
} from "./views/savedViews";
import {
  MIN_ROTATE_INTERVAL_HOURS,
  applyUnlockedRotation,
  normalizeRotateIntervalHours,
} from "./views/shuffleUnlocked";
import "./App.css";

type DragMode = "move" | "resize" | "pan";
type StudioMode = "edit" | "preview";
type ResizeCorner = "nw" | "ne" | "sw" | "se";

type DragState = {
  mode: DragMode;
  blockId: string;
  startX: number;
  startY: number;
  orig: ViewBlock;
  /** Snapshot of every selected block when a multi-move/resize starts. */
  origGroup?: ViewBlock[];
  corner?: ResizeCorner;
  /** Middle-mouse pan scroll snapshot. */
  panScrollLeft?: number;
  panScrollTop?: number;
};

const RAIL_GAP = 44;

function uid(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}`;
}

export default function App() {
  const [pack, setPack] = useState<ViewPack>(() => clonePack(DEMO_PACKS[1].pack));
  const [selectedIds, setSelectedIds] = useState<string[]>(["hero"]);
  const [scale, setScale] = useState(0.42);
  const [mode, setMode] = useState<StudioMode>("preview");
  const [snapGuides, setSnapGuides] = useState<{ x: boolean; y: boolean }>({
    x: false,
    y: false,
  });
  const [session, setSession] = useState<NuvioSession | null>(() => loadSession());
  const [library, setLibrary] = useState<NuvioLibrarySnapshot | null>(null);
  const [accountBusy, setAccountBusy] = useState(false);
  const [accountError, setAccountError] = useState<string | null>(null);
  const [isPanning, setIsPanning] = useState(false);
  const [savedViews, setSavedViews] = useState<SavedView[]>(() => listSavedViews());
  const dragRef = useRef<DragState | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const shellRef = useRef<HTMLDivElement | null>(null);
  const lastClickedIdRef = useRef<string | null>("hero");

  const dataSources = useMemo(
    () => mergeDataSources(library?.sources),
    [library?.sources],
  );

  const selectedId = selectedIds[selectedIds.length - 1] ?? null;
  const multiSelect = selectedIds.length > 1;

  const applyHomePack = useCallback((snap: NuvioLibrarySnapshot) => {
    setPack((prev) =>
      withComputedCanvas({
        ...clonePack(snap.homePack),
        rotateUnlocked: prev.rotateUnlocked,
        rotateIntervalHours: prev.rotateIntervalHours ?? MIN_ROTATE_INTERVAL_HOURS,
        // Fresh home layout — clear shuffle memory so next rotate is due.
        lastShuffleAt: undefined,
        shuffleSeed: undefined,
      }),
    );
    const nextBlocks = snap.homePack.blocks;
    const pick = nextBlocks.find((b) => b.type === "hero")?.id ?? nextBlocks[0]?.id ?? null;
    setSelectedIds(pick ? [pick] : []);
    lastClickedIdRef.current = pick;
    setMode("preview");
  }, []);

  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    (async () => {
      setAccountBusy(true);
      setAccountError(null);
      try {
        const fresh = await ensureFreshSession(defaultConfig(), session);
        if (cancelled) return;
        if (fresh.accessToken !== session.accessToken) {
          saveSession(fresh);
          setSession(fresh);
        }
        const snap = await loadNuvioLibrary(defaultConfig(), fresh, 1);
        if (cancelled) return;
        setLibrary(snap);
        applyHomePack(snap);
      } catch (e) {
        if (cancelled) return;
        const msg = e instanceof Error ? e.message : String(e);
        setAccountError(msg);
        if (/sign in again|session expired|jwt/i.test(msg)) {
          saveSession(null);
          setSession(null);
          setLibrary(null);
        }
      } finally {
        if (!cancelled) setAccountBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // Intentionally only when access token identity changes / first mount with session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.accessToken, applyHomePack]);

  const selected = useMemo(
    () => pack.blocks.find((b) => b.id === selectedId) ?? null,
    [pack.blocks, selectedId],
  );

  const selectedBlocks = useMemo(
    () => pack.blocks.filter((b) => selectedIds.includes(b.id)),
    [pack.blocks, selectedIds],
  );

  const canvasSize = useMemo(() => computeCanvasSize(pack.blocks), [pack.blocks]);

  const selectOnly = useCallback((id: string | null) => {
    setSelectedIds(id ? [id] : []);
    lastClickedIdRef.current = id;
  }, []);

  const updateBlock = useCallback((id: string, patch: Partial<ViewBlock>) => {
    setPack((prev) =>
      withComputedCanvas({
        ...prev,
        blocks: prev.blocks.map((b) => (b.id === id ? { ...b, ...patch } : b)),
      }),
    );
  }, []);

  const updateBlocks = useCallback((ids: string[], patch: Partial<ViewBlock>) => {
    const idSet = new Set(ids);
    setPack((prev) =>
      withComputedCanvas({
        ...prev,
        blocks: prev.blocks.map((b) => (idSet.has(b.id) ? { ...b, ...patch } : b)),
      }),
    );
  }, []);

  const deleteBlocks = useCallback((ids: string[]) => {
    if (!ids.length) return;
    const idSet = new Set(ids);
    setPack((prev) =>
      withComputedCanvas({
        ...prev,
        blocks: prev.blocks.filter((b) => !idSet.has(b.id)),
      }),
    );
    setSelectedIds((cur) => cur.filter((id) => !idSet.has(id)));
  }, []);

  const deleteBlock = useCallback(
    (id: string) => {
      deleteBlocks([id]);
    },
    [deleteBlocks],
  );

  const clearAll = () => {
    if (!window.confirm("Delete every block on this canvas?")) return;
    setPack((prev) => withComputedCanvas({ ...prev, blocks: [] }));
    selectOnly(null);
  };

  const loadDemo = (demoId: string) => {
    const demo = DEMO_PACKS.find((d) => d.id === demoId);
    if (!demo) return;
    const next = withComputedCanvas(clonePack(demo.pack));
    setPack(next);
    selectOnly(next.blocks[0]?.id ?? null);
    setMode("preview");
  };

  const importFile = async (file: File) => {
    try {
      const text = await file.text();
      const next = withComputedCanvas(parseViewPack(JSON.parse(text)));
      setPack(next);
      selectOnly(next.blocks[0]?.id ?? null);
      setMode("preview");
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Failed to import pack");
    }
  };

  const selectBlock = useCallback(
    (blockId: string, event: { metaKey: boolean; ctrlKey: boolean; shiftKey: boolean }) => {
      const ordered = [...pack.blocks].sort((a, b) => a.y - b.y || a.x - b.x);
      const ids = ordered.map((b) => b.id);

      if (event.shiftKey && lastClickedIdRef.current) {
        const a = ids.indexOf(lastClickedIdRef.current);
        const b = ids.indexOf(blockId);
        if (a >= 0 && b >= 0) {
          const [lo, hi] = a < b ? [a, b] : [b, a];
          setSelectedIds(ids.slice(lo, hi + 1));
          return;
        }
      }

      if (event.metaKey || event.ctrlKey) {
        setSelectedIds((cur) => {
          if (cur.includes(blockId)) {
            const next = cur.filter((id) => id !== blockId);
            lastClickedIdRef.current = next[next.length - 1] ?? null;
            return next;
          }
          lastClickedIdRef.current = blockId;
          return [...cur, blockId];
        });
        return;
      }

      selectOnly(blockId);
    },
    [pack.blocks, selectOnly],
  );

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Delete" && event.key !== "Backspace") return;
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT")) {
        return;
      }
      if (!selectedIds.length) return;
      event.preventDefault();
      deleteBlocks(selectedIds);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [deleteBlocks, selectedIds]);

  const addBlock = (type: BlockType) => {
    const def = blockDef(type);
    const y = pack.blocks.reduce((max, b) => Math.max(max, b.y + b.h), 0) + 12;
    const block: ViewBlock = {
      id: uid(type),
      type,
      x: 0,
      y: Math.max(0, y),
      w: def.defaultW,
      h: def.defaultH,
      dataSource: sourcesForBlock(type, dataSources)[0]?.id ?? "none",
      trailer: type === "hero" || type === "mediaRail",
      label: def.label,
      hAlign: "start",
      contentAlign: "start",
      posterGrow: type === "mediaRail",
    };
    setPack((prev) => withComputedCanvas({ ...prev, blocks: [...prev.blocks, block] }));
    selectOnly(block.id);
    setMode("edit");
  };

  const centerSelected = () => {
    if (!selectedBlocks.length) return;
    setPack((prev) =>
      withComputedCanvas({
        ...prev,
        blocks: prev.blocks.map((b) =>
          selectedIds.includes(b.id)
            ? { ...b, x: centerBlockX(b, VIEWPORT_WIDTH), hAlign: "center" as const }
            : b,
        ),
      }),
    );
  };

  const onPointerMove = (event: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag) return;

    if (drag.mode === "pan") {
      const shell = shellRef.current;
      if (!shell) return;
      const dx = event.clientX - drag.startX;
      const dy = event.clientY - drag.startY;
      shell.scrollLeft = (drag.panScrollLeft ?? 0) - dx;
      shell.scrollTop = (drag.panScrollTop ?? 0) - dy;
      return;
    }

    if (mode !== "edit") return;
    const dx = (event.clientX - drag.startX) / scale;
    const dy = (event.clientY - drag.startY) / scale;
    const def = blockDef(drag.orig.type);

    if (drag.mode === "move") {
      const group = drag.origGroup?.length ? drag.origGroup : [drag.orig];
      const movingIds = new Set(group.map((b) => b.id));
      const primary = group.find((b) => b.id === drag.blockId) ?? drag.orig;
      const snapped = snapBlockPosition(primary.x + dx, primary.y + dy, primary.w, primary.h, {
        others: pack.blocks.filter((b) => !movingIds.has(b.id)),
        excludeId: drag.blockId,
        gap: RAIL_GAP,
      });
      const appliedDx = snapped.x - primary.x;
      const appliedDy = snapped.y - primary.y;
      setSnapGuides({ x: snapped.snappedX, y: snapped.snappedY });
      setPack((prev) =>
        withComputedCanvas({
          ...prev,
          blocks: prev.blocks.map((b) => {
            const origin = group.find((g) => g.id === b.id);
            if (!origin) return b;
            const x = Math.max(0, Math.min(VIEWPORT_WIDTH - origin.w, Math.round(origin.x + appliedDx)));
            return {
              ...b,
              x,
              y: Math.max(0, Math.round(origin.y + appliedDy)),
              w: Math.min(origin.w, VIEWPORT_WIDTH - x),
              hAlign:
                b.id === drag.blockId &&
                snapped.snappedX &&
                snapped.x === centerBlockX(primary)
                  ? ("center" as const)
                  : b.hAlign,
            };
          }),
        }),
      );
      return;
    }

    setSnapGuides({ x: false, y: false });
    const corner = drag.corner ?? "se";
    const group = drag.origGroup?.length ? drag.origGroup : [drag.orig];
    const primaryNext = resizeFromCorner(drag.orig, corner, dx, dy, def.minW, def.minH);
    let dw = primaryNext.w - drag.orig.w;
    let dh = primaryNext.h - drag.orig.h;

    // Keep every selected block at/above its min size with the same delta.
    for (const origin of group) {
      const mins = blockDef(origin.type);
      if (origin.w + dw < mins.minW) dw = mins.minW - origin.w;
      if (origin.h + dh < mins.minH) dh = mins.minH - origin.h;
      // Never grow past the locked 1920 TV width.
      const maxW = VIEWPORT_WIDTH - Math.max(0, origin.x);
      if (origin.w + dw > maxW) dw = maxW - origin.w;
    }

    setPack((prev) =>
      withComputedCanvas({
        ...prev,
        blocks: restackVertically(
          prev.blocks.map((b) => {
            const origin = group.find((g) => g.id === b.id);
            if (!origin) return b;
            return { ...b, ...applyResizeDelta(origin, corner, dw, dh) };
          }),
          RAIL_GAP,
        ),
      }),
    );
  };

  const endDrag = () => {
    const drag = dragRef.current;
    const wasPan = drag?.mode === "pan";
    dragRef.current = null;
    setSnapGuides({ x: false, y: false });
    if (wasPan) {
      setIsPanning(false);
      return;
    }
    if (!drag) return;

    setPack((prev) => {
      let blocks = restackVertically(prev.blocks, RAIL_GAP);
      if (drag.mode === "move") {
        const movingIds = new Set(
          (drag.origGroup?.length ? drag.origGroup : [drag.orig]).map((b) => b.id),
        );
        const movers = blocks.filter((b) => movingIds.has(b.id)).sort((a, b) => a.y - b.y);
        for (const moving of movers) {
          const y = resolveVerticalOverlap(
            moving,
            blocks.filter((b) => b.id !== moving.id),
            RAIL_GAP,
          );
          if (y !== moving.y) {
            blocks = blocks.map((b) => (b.id === moving.id ? { ...b, y } : b));
          }
        }
        blocks = restackVertically(blocks, RAIL_GAP);
      }
      return withComputedCanvas({ ...prev, blocks });
    });
  };

  const startPan = (event: React.PointerEvent) => {
    if (event.button !== 1) return;
    event.preventDefault();
    event.stopPropagation();
    const shell = shellRef.current;
    if (!shell) return;
    setIsPanning(true);
    dragRef.current = {
      mode: "pan",
      blockId: "",
      startX: event.clientX,
      startY: event.clientY,
      orig: pack.blocks[0] ?? {
        id: "",
        type: "spacer",
        x: 0,
        y: 0,
        w: 0,
        h: 0,
        dataSource: "none",
        trailer: false,
      },
      panScrollLeft: shell.scrollLeft,
      panScrollTop: shell.scrollTop,
    };
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  };

  const startMove = (block: ViewBlock, event: React.PointerEvent) => {
    if (mode !== "edit") return;
    event.stopPropagation();
    event.preventDefault();

    // Compute selection before async setState so the drag group matches the click.
    let groupIds: string[];
    const ordered = [...pack.blocks].sort((a, b) => a.y - b.y || a.x - b.x);
    const orderedIds = ordered.map((b) => b.id);

    if (event.shiftKey && lastClickedIdRef.current) {
      const a = orderedIds.indexOf(lastClickedIdRef.current);
      const b = orderedIds.indexOf(block.id);
      if (a >= 0 && b >= 0) {
        const [lo, hi] = a < b ? [a, b] : [b, a];
        groupIds = orderedIds.slice(lo, hi + 1);
      } else {
        groupIds = [block.id];
      }
    } else if (event.metaKey || event.ctrlKey) {
      groupIds = selectedIds.includes(block.id)
        ? selectedIds.filter((id) => id !== block.id)
        : [...selectedIds, block.id];
      if (!groupIds.length) groupIds = [block.id];
    } else if (selectedIds.includes(block.id) && selectedIds.length > 1) {
      // Drag the whole multi-selection.
      groupIds = selectedIds;
    } else {
      groupIds = [block.id];
    }

    selectBlock(block.id, event);

    const origGroup = pack.blocks.filter((b) => groupIds.includes(b.id)).map((b) => ({ ...b }));
    dragRef.current = {
      mode: "move",
      blockId: block.id,
      startX: event.clientX,
      startY: event.clientY,
      orig: { ...block },
      origGroup: origGroup.length ? origGroup : [{ ...block }],
    };
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  };

  const startResize = (corner: ResizeCorner, block: ViewBlock, event: React.PointerEvent) => {
    if (mode !== "edit") return;
    event.stopPropagation();
    event.preventDefault();

    // Keep the multi-selection; resize applies the same size delta to every selected row.
    const groupIds =
      selectedIds.includes(block.id) && selectedIds.length > 1 ? selectedIds : [block.id];
    if (!selectedIds.includes(block.id)) {
      selectOnly(block.id);
    } else {
      // Ensure primary is the resized block without dropping others.
      setSelectedIds((cur) => {
        const rest = cur.filter((id) => id !== block.id);
        return [...rest, block.id];
      });
      lastClickedIdRef.current = block.id;
    }

    const origGroup = pack.blocks.filter((b) => groupIds.includes(b.id)).map((b) => ({ ...b }));
    dragRef.current = {
      mode: "resize",
      blockId: block.id,
      startX: event.clientX,
      startY: event.clientY,
      orig: { ...block },
      origGroup: origGroup.length ? origGroup : [{ ...block }],
      corner,
    };
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  };

  const exportPack = () => {
    const payload = withComputedCanvas({
      ...pack,
      id: slugify(pack.name),
      schemaVersion: 1,
    });
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${payload.id}.view.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const saveCurrentView = () => {
    const name =
      window.prompt("Name this view", pack.name || "My view")?.trim() || pack.name;
    const saved = saveView(pack, name);
    setSavedViews(listSavedViews());
    setPack(saved.pack);
    window.alert(`Saved “${saved.name}” in this browser.`);
  };

  const openSavedView = (id: string) => {
    const saved = loadSavedView(id);
    if (!saved) return;
    const next = withComputedCanvas(clonePack(saved.pack));
    setPack(next);
    selectOnly(next.blocks[0]?.id ?? null);
    setMode("preview");
  };

  const removeSavedView = (id: string) => {
    const saved = loadSavedView(id);
    if (!saved) return;
    if (!window.confirm(`Delete saved view “${saved.name}”?`)) return;
    deleteSavedView(id);
    setSavedViews(listSavedViews());
  };

  const reshufflePreview = () => {
    if (!pack.rotateUnlocked) {
      window.alert("Turn on “Randomize unlocked rails” first.");
      return;
    }
    const { pack: next } = applyUnlockedRotation(pack, Date.now(), { force: true });
    setPack(next);
  };

  const expandSelectedCollection = () => {
    if (!selected) return;
    if (!library?.collections?.length) {
      window.alert("Sign in and reload your library so collection content is available.");
      return;
    }

    // Step 2: expanded folder → one rail per catalog source
    if (parseFolderDataSource(selected.dataSource)) {
      const next = expandFolderIntoCatalogRails(
        pack,
        selected.id,
        library.collections,
        library.catalogNames ?? {},
      );
      if (!next) {
        window.alert("No catalog sources found in this folder to expand.");
        return;
      }
      setPack(next);
      selectOnly(next.blocks.find((b) => b.dataSource.startsWith("catalog:"))?.id ?? null);
      setMode("edit");
      return;
    }

    // Step 1: collection covers → one rail per folder (title posters)
    if (selected.type !== "collectionRail") return;
    if (!selected.dataSource.startsWith("collection:")) return;

    const next = expandCollectionIntoContentRails(pack, selected.id, library.collections);
    if (!next) {
      window.alert("No folders with content found in this collection.");
      return;
    }
    setPack(next);
    const first = next.blocks.find((b) => parseFolderDataSource(b.dataSource));
    selectOnly(first?.id ?? null);
    setMode("edit");
  };

  return (
    <div className="studio">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">Nuvio</span>
          <span className="brand-sub">Reframe Studio</span>
        </div>
        <label className="name-field">
          View name
          <input
            value={pack.name}
            onChange={(e) =>
              setPack((prev) => ({
                ...prev,
                name: e.target.value,
                id: slugify(e.target.value),
              }))
            }
          />
        </label>
        <div className="mode-toggle" role="group" aria-label="Studio mode">
          <button
            type="button"
            className={mode === "edit" ? "active" : ""}
            onClick={() => setMode("edit")}
          >
            Edit
          </button>
          <button
            type="button"
            className={mode === "preview" ? "active" : ""}
            onClick={() => setMode("preview")}
          >
            Preview
          </button>
        </div>
        <div className="topbar-actions">
          <label className="zoom">
            Zoom
            <input
              type="range"
              min={0.25}
              max={0.75}
              step={0.05}
              value={scale}
              onChange={(e) => setScale(Number(e.target.value))}
            />
          </label>
          <button
            type="button"
            className="btn ghost"
            onClick={() => selectedIds.length && deleteBlocks(selectedIds)}
            disabled={!selectedIds.length}
          >
            Delete{selectedIds.length > 1 ? ` (${selectedIds.length})` : ""}
          </button>
          <button type="button" className="btn ghost" onClick={saveCurrentView}>
            Save view
          </button>
          <button type="button" className="btn primary" onClick={exportPack}>
            Export view.json
          </button>
        </div>
      </header>

      <div className="workspace">
        <aside className="rail">
          <AccountPanel
            session={session}
            library={library}
            busy={accountBusy}
            error={accountError}
            onSession={setSession}
            onLibrary={(snap) => {
              setLibrary(snap);
              if (snap) applyHomePack(snap);
            }}
            onBusy={setAccountBusy}
            onError={setAccountError}
          />

          <h2>Saved views</h2>
          <p className="hint">Stored in this browser. Save the canvas, then reload anytime.</p>
          <ul className="demo-list saved-views-list">
            {savedViews.length === 0 && (
              <li>
                <span className="hint">No saved views yet.</span>
              </li>
            )}
            {savedViews.map((view) => (
              <li key={view.id}>
                <button type="button" onClick={() => openSavedView(view.id)}>
                  <strong>{view.name}</strong>
                  <span>{new Date(view.updatedAt).toLocaleString()}</span>
                </button>
                <button
                  type="button"
                  className="btn ghost danger-text saved-view-delete"
                  onClick={() => removeSavedView(view.id)}
                >
                  Delete
                </button>
              </li>
            ))}
          </ul>

          <h2>Demos</h2>
          <p className="hint">
            After sign-in the canvas mirrors your Nuvio home rail order. Demos below are starters
            only.
          </p>
          <ul className="demo-list">
            {DEMO_PACKS.map((demo) => (
              <li key={demo.id}>
                <button type="button" onClick={() => loadDemo(demo.id)}>
                  <strong>{demo.name.replace(/^Demo · /, "")}</strong>
                  <span>{demo.blurb}</span>
                </button>
              </li>
            ))}
          </ul>

          <div className="rail-section">
            <button type="button" className="btn ghost full" onClick={() => fileInputRef.current?.click()}>
              Import view.json
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/json,.json"
              hidden
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void importFile(file);
                e.target.value = "";
              }}
            />
            <button
              type="button"
              className="btn ghost full"
              onClick={() => {
                setPack(createEmptyPack("Blank home"));
                selectOnly(null);
                setMode("edit");
              }}
            >
              New blank
            </button>
          </div>

          <h2>Blocks</h2>
          <p className="hint">
            Add a Nuvio TV building block. Ctrl/Cmd+click toggles multi-select; Shift+click selects a
            range.
          </p>
          <ul className="block-list">
            {BLOCK_CATALOG.map((b) => (
              <li key={b.type}>
                <button type="button" onClick={() => addBlock(b.type)}>
                  <strong>{b.label}</strong>
                  <span>{b.description}</span>
                </button>
              </li>
            ))}
          </ul>
          <div className="rail-footer">
            <a href="https://github.com/Tolu-Walop-E/Nuvio_Reframe" target="_blank" rel="noreferrer">
              Nuvio TV repo
            </a>
            <span>
              Multi-select: Ctrl/Cmd+click · Shift+click range · middle-mouse pans · Del deletes
              selected.
            </span>
          </div>
        </aside>

        <main className="stage">
          <div
            ref={shellRef}
            className={`canvas-shell mode-${mode}${isPanning ? " panning" : ""}`}
            onPointerDown={startPan}
            onPointerMove={onPointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            onAuxClick={(e) => {
              // Prevent middle-click autoscroll chrome / default.
              if (e.button === 1) e.preventDefault();
            }}
            onClick={() => selectOnly(null)}
          >
            <div
              className={`canvas${mode === "preview" ? " previewing" : ""}`}
              style={{
                width: canvasSize.width,
                height: canvasSize.height,
                transform: `scale(${scale})`,
              }}
            >
              <div
                className="viewport-frame"
                style={{ width: VIEWPORT_WIDTH, height: VIEWPORT_HEIGHT }}
              >
                <span className="viewport-label">TV first screen · 1920×1080</span>
                {snapGuides.x && <div className="snap-guide vertical" />}
                {snapGuides.y && <div className="snap-guide horizontal" />}
              </div>
              {pack.blocks.map((block) => {
                const isSelected = selectedIds.includes(block.id);
                const isPrimary = selectedId === block.id;
                return (
                <div
                  key={block.id}
                  className={`block block-${block.type}${isSelected ? " selected" : ""}${isPrimary && multiSelect ? " primary" : ""}${mode === "preview" ? " preview" : ""}`}
                  style={{
                    left: block.x,
                    top: block.y,
                    width: block.w,
                    height: block.h,
                  }}
                  onPointerDown={(e) => {
                    if (mode === "edit") startMove(block, e);
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    // Edit mode selects on pointerDown; preview mode still allows select.
                    if (mode === "preview") selectBlock(block.id, e);
                  }}
                >
                  <MockBlockPreview
                    block={block}
                    preview={mode === "preview"}
                    board={library?.previewBoard}
                  />
                  {mode === "edit" && (
                    <button
                      type="button"
                      className="block-delete"
                      aria-label={`Delete ${block.label || block.type}`}
                      title="Delete"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (selectedIds.includes(block.id) && selectedIds.length > 1) {
                          deleteBlocks(selectedIds);
                        } else {
                          deleteBlock(block.id);
                        }
                      }}
                      onPointerDown={(e) => e.stopPropagation()}
                    >
                      ×
                    </button>
                  )}
                  {mode === "edit" && isPrimary && (
                    <div className="resize-corners">
                      {(["nw", "ne", "sw", "se"] as ResizeCorner[]).map((corner) => (
                        <button
                          key={corner}
                          type="button"
                          className={`resize-corner corner-${corner}`}
                          aria-label={`Resize ${corner.toUpperCase()}`}
                          title="Drag corner to resize"
                          onPointerDown={(e) => startResize(corner, block, e)}
                        />
                      ))}
                    </div>
                  )}
                </div>
              );
              })}
            </div>
          </div>
          <p className="stage-caption">
            {mode === "preview" ? "Preview" : "Edit"} · canvas{" "}
            {canvasSize.width}×{canvasSize.height}
            {canvasSize.height > VIEWPORT_HEIGHT ? " · scrolls vertically" : ""}{" "}
            · {(scale * 100).toFixed(0)}%
            {selectedIds.length
              ? multiSelect
                ? ` · ${selectedIds.length} selected`
                : ` · selected ${selectedId}`
              : ""}
            {" · middle-drag pans"}
          </p>
        </main>

        <aside className="inspector">
          <h2>Inspector</h2>
          {!selected ? (
            <p className="hint">
              Select a block to bind data, toggle trailer, or delete it. Ctrl/Cmd+click selects
              multiple rails.
            </p>
          ) : multiSelect ? (
            <div className="inspector-form">
              <p className="hint">{selectedIds.length} blocks selected</p>
              <p className="hint">
                Drag a resize handle on the primary (bright outline) to scale all selected rows by
                the same amount.
              </p>
              <ul className="selection-list">
                {selectedBlocks.map((b) => (
                  <li key={b.id}>
                    <button type="button" className="btn ghost full" onClick={() => selectOnly(b.id)}>
                      {b.label || blockDef(b.type).label}
                      {b.locked ? " · locked" : ""}
                    </button>
                  </li>
                ))}
              </ul>
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={selectedBlocks.every((b) => b.locked === true)}
                  onChange={(e) =>
                    updateBlocks(
                      selectedIds,
                      e.target.checked ? { locked: true } : { locked: false },
                    )
                  }
                />
                Lock selected rows (keep slot when rotating)
              </label>
              <label>
                Content align (all rails)
                <select
                  defaultValue=""
                  onChange={(e) => {
                    const value = e.target.value as ViewBlock["contentAlign"];
                    if (!value) return;
                    updateBlocks(
                      selectedBlocks
                        .filter(
                          (b) =>
                            b.type === "mediaRail" ||
                            b.type === "genreRail" ||
                            b.type === "collectionRail",
                        )
                        .map((b) => b.id),
                      { contentAlign: value },
                    );
                    e.target.value = "";
                  }}
                >
                  <option value="" disabled>
                    Apply to selection…
                  </option>
                  <option value="start">Start (left)</option>
                  <option value="center">Center</option>
                </select>
              </label>
              <button type="button" className="btn ghost full" onClick={centerSelected}>
                Snap all centered on TV screen
              </button>
              <button
                type="button"
                className="btn danger full"
                onClick={() => deleteBlocks(selectedIds)}
              >
                Delete {selectedIds.length} blocks
              </button>
            </div>
          ) : (
            <div className="inspector-form">
              <label>
                Type
                <input value={blockDef(selected.type).label} readOnly />
              </label>
              <label>
                Label
                <input
                  value={selected.label ?? ""}
                  onChange={(e) => updateBlock(selected.id, { label: e.target.value })}
                />
              </label>
              <label>
                Data source
                <select
                  value={selected.dataSource}
                  onChange={(e) =>
                    updateBlock(selected.id, {
                      dataSource: e.target.value as ViewBlock["dataSource"],
                    })
                  }
                >
                  {sourcesForBlock(selected.type, dataSources).map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.id.startsWith("collection:")
                        ? `📁 ${s.label}`
                        : s.id.startsWith("catalog:")
                          ? `🎬 ${s.label}`
                          : s.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={
                    selected.locked === true ||
                    (selected.locked !== false &&
                      (selected.type === "topNav" ||
                        selected.type === "hero" ||
                        selected.dataSource === "continueWatching"))
                  }
                  onChange={(e) =>
                    updateBlock(selected.id, {
                      locked: e.target.checked,
                    })
                  }
                />
                Lock row (fixed slot when unlocked rails rotate)
              </label>
              {(selected.type === "hero" || selected.type === "mediaRail") && (
                <label className="checkbox">
                  <input
                    type="checkbox"
                    checked={selected.trailer}
                    onChange={(e) => updateBlock(selected.id, { trailer: e.target.checked })}
                  />
                  Use existing TrailerPlayer when focused
                </label>
              )}
              {(selected.type === "mediaRail" ||
                selected.type === "genreRail" ||
                selected.type === "collectionRail") && (
                <>
                  <label>
                    Content align
                    <select
                      value={selected.contentAlign ?? "start"}
                      onChange={(e) =>
                        updateBlock(selected.id, {
                          contentAlign: e.target.value as ViewBlock["contentAlign"],
                        })
                      }
                    >
                      <option value="start">Start (left)</option>
                      <option value="center">Center</option>
                    </select>
                  </label>
                  {selected.type === "mediaRail" &&
                    selected.dataSource !== "continueWatching" && (
                      <label className="checkbox">
                        <input
                          type="checkbox"
                          checked={selected.posterGrow !== false}
                          onChange={(e) =>
                            updateBlock(selected.id, { posterGrow: e.target.checked })
                          }
                        />
                        Vertical posters grow when focused
                      </label>
                    )}
                </>
              )}
              <button type="button" className="btn ghost full" onClick={centerSelected}>
                Snap center on TV screen
              </button>
              {selected.type === "collectionRail" &&
                !parseFolderDataSource(selected.dataSource) && (
                  <button
                    type="button"
                    className="btn primary full"
                    onClick={expandSelectedCollection}
                  >
                    Expand into content rails
                  </button>
                )}
              {parseFolderDataSource(selected.dataSource) && (
                <button
                  type="button"
                  className="btn primary full"
                  onClick={expandSelectedCollection}
                >
                  Expand folder into catalog rails
                </button>
              )}
              {selected.type === "mediaRail" &&
                parseFolderDataSource(selected.dataSource) && (
                  <p className="hint">
                    Folder content rail — expand again to split into Movies / Shows / etc.
                  </p>
                )}
              <div className="geometry">
                <span>
                  x {selected.x} · y {selected.y}
                </span>
                <span>
                  {selected.w} × {selected.h}
                </span>
              </div>
              <button type="button" className="btn danger full" onClick={() => deleteBlock(selected.id)}>
                Delete block
              </button>
            </div>
          )}
          <div className="inspector-form pack-rotate">
            <h3>Unlock rotation</h3>
            <p className="hint">
              Order-only shuffle for unlocked rails. Locked rows keep their vertical slots. TV
              rotates at most once per interval (≥{MIN_ROTATE_INTERVAL_HOURS}h).
            </p>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={pack.rotateUnlocked === true}
                onChange={(e) =>
                  setPack((prev) => ({
                    ...prev,
                    rotateUnlocked: e.target.checked,
                    rotateIntervalHours: normalizeRotateIntervalHours(
                      prev.rotateIntervalHours ?? MIN_ROTATE_INTERVAL_HOURS,
                    ),
                  }))
                }
              />
              Randomize unlocked rails
            </label>
            <label>
              Interval (hours)
              <input
                type="number"
                min={MIN_ROTATE_INTERVAL_HOURS}
                step={1}
                disabled={!pack.rotateUnlocked}
                value={normalizeRotateIntervalHours(
                  pack.rotateIntervalHours ?? MIN_ROTATE_INTERVAL_HOURS,
                )}
                onChange={(e) => {
                  const hours = normalizeRotateIntervalHours(Number(e.target.value));
                  setPack((prev) => ({
                    ...prev,
                    rotateIntervalHours: hours,
                  }));
                }}
              />
            </label>
            <button
              type="button"
              className="btn primary full"
              disabled={!pack.rotateUnlocked}
              onClick={reshufflePreview}
            >
              Reshuffle preview
            </button>
          </div>
          <button type="button" className="btn ghost full danger-text" onClick={clearAll}>
            Clear canvas
          </button>
        </aside>
      </div>
    </div>
  );
}

function resizeFromCorner(
  orig: ViewBlock,
  corner: ResizeCorner,
  dx: number,
  dy: number,
  minW: number,
  minH: number,
): Pick<ViewBlock, "x" | "y" | "w" | "h"> {
  const right = orig.x + orig.w;
  const bottom = orig.y + orig.h;

  let left = orig.x;
  let top = orig.y;
  let nextRight = right;
  let nextBottom = bottom;

  if (corner.includes("w")) left = orig.x + dx;
  if (corner.includes("e")) nextRight = right + dx;
  if (corner.includes("n")) top = orig.y + dy;
  if (corner.includes("s")) nextBottom = bottom + dy;

  if (nextRight - left < minW) {
    if (corner.includes("w")) left = nextRight - minW;
    else nextRight = left + minW;
  }
  if (nextBottom - top < minH) {
    if (corner.includes("n")) top = nextBottom - minH;
    else nextBottom = top + minH;
  }

  // Origin stays on-canvas; right/bottom may grow past the first TV screen.
  left = Math.max(0, left);
  top = Math.max(0, top);
  if (nextRight < left + minW) nextRight = left + minW;
  if (nextBottom < top + minH) nextBottom = top + minH;

  return {
    x: Math.round(left),
    y: Math.round(top),
    w: Math.round(nextRight - left),
    h: Math.round(nextBottom - top),
  };
}

/** Apply the same width/height delta (and west/north origin shift) to a block. */
function applyResizeDelta(
  orig: ViewBlock,
  corner: ResizeCorner,
  dw: number,
  dh: number,
): Pick<ViewBlock, "x" | "y" | "w" | "h"> {
  let x = orig.x;
  let y = orig.y;
  const w = Math.max(1, orig.w + dw);
  const h = Math.max(1, orig.h + dh);
  if (corner.includes("w")) x = Math.max(0, orig.x - dw);
  if (corner.includes("n")) y = Math.max(0, orig.y - dh);
  return {
    x: Math.round(x),
    y: Math.round(y),
    w: Math.round(w),
    h: Math.round(h),
  };
}
