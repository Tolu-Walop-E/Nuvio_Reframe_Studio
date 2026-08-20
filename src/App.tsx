import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { AccountPanel } from "./account/AccountPanel";
import { BLOCK_CATALOG, blockDef, type BlockType } from "./catalog/blocks";
import { mergeDataSources, sourcesForBlock } from "./catalog/dataSources";
import { DEMO_PACKS, clonePack } from "./demos";
import { defaultConfig, loadSession, saveSession } from "./nuvio/config";
import { ensureFreshSession } from "./nuvio/client";
import { loadNuvioLibrary } from "./nuvio/library";
import type { NuvioLibrarySnapshot, NuvioSession } from "./nuvio/types";
import { MockBlockPreview } from "./preview/MockBlockPreview";
import {
  DEFAULT_PACK_CARD_SCALE,
  FOCUSED_METADATA_HEIGHT,
  MAX_COUNTED_RAILS_IN_VIEWPORT,
  MAX_LABELED_POSTER_HEIGHT,
  MAX_LABELED_RAIL_HEIGHT,
  MAX_PACK_CARD_SCALE,
  MIN_PACK_CARD_SCALE,
  VIEWPORT_HEIGHT,
  VIEWPORT_WIDTH,
  blockShowsFocusedPosterInfo,
  clampBlockHeight,
  computeCanvasSize,
  countedRailsStartingInViewport,
  countsTowardViewportRailBudget,
  createEmptyPack,
  isCollectionBlock,
  layoutBlocks,
  maxRailHeightForBlock,
  normalizePackCardScale,
  slugify,
  withComputedCanvas,
  withFocusedPosterInfoNorm,
  type ViewBlock,
  type ViewPack,
} from "./types/viewPack";
import { expandCollectionIntoContentRails, expandFolderIntoCatalogRails, parseFolderDataSource, parseCollectionHubDataSource, dataSourceTypeLabel } from "./views/expandCollection";
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
import { pushViewPackToAccount } from "./nuvio/pushViewPack";
import { pullViewPackFromAccount } from "./nuvio/pullViewPack";
import { pushHomeCatalogSettings } from "./nuvio/pushHomeCatalog";
import {
  STUDIO_SCREENS,
  attachScreenPacks,
  emptyScreenPackMap,
  parseScreenPacks,
  screenLabel,
  type ScreenPackMap,
  type StudioScreen,
} from "./nuvio/screenPacks";
import {
  homeCatalogPayloadWithGenreTargets,
  type GenreTarget,
} from "./nuvio/genreTargets";
import "./App.css";

type StudioMode = "arrange" | "preview";

type RowDrag = {
  kind: "reorder" | "height";
  blockId: string;
  pointerY: number;
  startY: number;
  startH: number;
};

const RAIL_GAP = 44;
const HEIGHT_STEP = 20;
const CANVAS_PAD_X = 56;

function uid(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}`;
}

function capturePointer(event: React.PointerEvent) {
  try {
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  } catch {
    /* synthetic or already-released pointer */
  }
}

/** Rows are a top-to-bottom stack: re-flow y from the given order. */
function stackRows(ordered: ViewBlock[], pack: ViewPack): ViewBlock[] {
  let y = 0;
  const flowed = ordered.map((block) => {
    const next = { ...block, y };
    y += block.h + RAIL_GAP;
    return next;
  });
  return layoutBlocks(flowed, RAIL_GAP, pack);
}

function orderRows(blocks: ViewBlock[]): ViewBlock[] {
  return [...blocks].sort((a, b) => a.y - b.y || a.x - b.x || a.id.localeCompare(b.id));
}

/** Pack-global card scales for Studio preview (TV applies the same multipliers). */
function visualCardScale(block: ViewBlock, pack: ViewPack): number {
  if (block.type === "collectionRail") {
    return normalizePackCardScale(pack.collectionLandscapeScale ?? DEFAULT_PACK_CARD_SCALE);
  }
  if (block.type === "mediaRail" && block.dataSource !== "continueWatching") {
    return normalizePackCardScale(pack.catalogPosterScale ?? DEFAULT_PACK_CARD_SCALE);
  }
  return DEFAULT_PACK_CARD_SCALE;
}

/** Preview-only row sizes: multiply stored heights by pack globals and re-stack. */
function displayRowsWithCardScales(blocks: ViewBlock[], pack: ViewPack): ViewBlock[] {
  let y = 0;
  return orderRows(blocks).map((block) => {
    const s = visualCardScale(block, pack);
    let h = block.h;
    if (s !== DEFAULT_PACK_CARD_SCALE) {
      if (blockShowsFocusedPosterInfo(block, pack)) {
        // Scale poster band only — keep title + ≥2-line footer reserve fixed so text
        // is not pushed off the preview viewport.
        const reserve = 32 + FOCUSED_METADATA_HEIGHT;
        const rawPoster = block.h - reserve;
        // Short rails (e.g. older expand defaults at 210px) still use a real poster
        // baseline so global catalogPosterScale matches peer catalog rails.
        const posterBase =
          rawPoster >= 140 ? rawPoster : Math.max(160, Math.round(block.h * 0.75));
        const scaledPoster = Math.min(
          Math.round(posterBase * s),
          Math.round(MAX_LABELED_POSTER_HEIGHT * Math.max(s, 1)),
        );
        h = scaledPoster + reserve;
      } else {
        h = Math.max(40, Math.round(block.h * s));
      }
    }
    const next = { ...block, y, h };
    y += h + RAIL_GAP;
    return next;
  });
}

function rowTitle(block: ViewBlock): string {
  return block.label?.trim() || blockDef(block.type).label;
}

export default function App() {
  const [pack, setPack] = useState<ViewPack>(() => clonePack(DEMO_PACKS[1].pack));
  const [selectedId, setSelectedId] = useState<string | null>("hero");
  const [mode, setMode] = useState<StudioMode>("arrange");
  const [zoom, setZoom] = useState<number | "fit">("fit");
  const [fitScale, setFitScale] = useState(0.42);
  const [session, setSession] = useState<NuvioSession | null>(() => loadSession());
  const [library, setLibrary] = useState<NuvioLibrarySnapshot | null>(null);
  const [genreTargets, setGenreTargets] = useState<Record<string, GenreTarget>>({});
  const [accountBusy, setAccountBusy] = useState(false);
  const [accountError, setAccountError] = useState<string | null>(null);
  const [savedViews, setSavedViews] = useState<SavedView[]>(() => listSavedViews());
  const [shareBusy, setShareBusy] = useState(false);
  const [shareMessage, setShareMessage] = useState<string | null>(null);
  const [shareError, setShareError] = useState(false);
  const [addAtIndex, setAddAtIndex] = useState<number | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState(0);
  const [toast, setToast] = useState<string | null>(null);

  const dragRef = useRef<RowDrag | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const shellRef = useRef<HTMLDivElement | null>(null);
  const packRef = useRef(pack);
  const historyRef = useRef<{ past: ViewPack[]; future: ViewPack[] }>({ past: [], future: [] });
  const [historyTick, setHistoryTick] = useState(0);
  const [studioScreen, setStudioScreen] = useState<StudioScreen>("home");
  const studioScreenRef = useRef<StudioScreen>("home");
  const screenPacksRef = useRef<ScreenPackMap>(emptyScreenPackMap(pack));

  packRef.current = pack;
  studioScreenRef.current = studioScreen;

  useEffect(() => {
    screenPacksRef.current[studioScreen] = pack;
  }, [pack, studioScreen]);

  const scale = zoom === "fit" ? fitScale : zoom;
  const rows = useMemo(() => orderRows(pack.blocks), [pack.blocks]);
  const displayRows = useMemo(
    () => displayRowsWithCardScales(pack.blocks, pack),
    [pack],
  );
  const selected = useMemo(
    () => pack.blocks.find((b) => b.id === selectedId) ?? null,
    [pack.blocks, selectedId],
  );
  const dataSources = useMemo(() => mergeDataSources(library?.sources), [library?.sources]);
  const canvasSize = useMemo(() => computeCanvasSize(displayRows), [displayRows]);
  const firstScreenRails = useMemo(
    () => countedRailsStartingInViewport(displayRows).length,
    [displayRows],
  );
  const belowFold = useMemo(
    () => displayRows.filter((b) => countsTowardViewportRailBudget(b) && b.y >= VIEWPORT_HEIGHT).length,
    [displayRows],
  );

  const beginScalePreview = useCallback(() => {
    historyRef.current.past.push(packRef.current);
    if (historyRef.current.past.length > 60) historyRef.current.past.shift();
    historyRef.current.future = [];
    setHistoryTick((t) => t + 1);
  }, []);

  const showToast = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast((cur) => (cur === message ? null : cur)), 2600);
  }, []);

  /** Every structural change goes through here so Ctrl+Z always works. */
  const commit = useCallback((next: ViewPack | ((prev: ViewPack) => ViewPack)) => {
    const prev = packRef.current;
    const resolved = typeof next === "function" ? next(prev) : next;
    if (resolved === prev) return;
    historyRef.current.past.push(prev);
    if (historyRef.current.past.length > 60) historyRef.current.past.shift();
    historyRef.current.future = [];
    setHistoryTick((t) => t + 1);
    setPack(resolved);
  }, []);

  /** Live drag updates: no history entry per pointermove. */
  const previewPack = useCallback((next: (prev: ViewPack) => ViewPack) => {
    setPack(next);
  }, []);

  const undo = useCallback(() => {
    const prev = historyRef.current.past.pop();
    if (!prev) return;
    historyRef.current.future.push(packRef.current);
    setHistoryTick((t) => t + 1);
    setPack(prev);
  }, []);

  const redo = useCallback(() => {
    const next = historyRef.current.future.pop();
    if (!next) return;
    historyRef.current.past.push(packRef.current);
    setHistoryTick((t) => t + 1);
    setPack(next);
  }, []);

  const canUndo = historyRef.current.past.length > 0;
  const canRedo = historyRef.current.future.length > 0;
  void historyTick;

  const replacePack = useCallback(
    (raw: ViewPack, opts?: { select?: "first" | "hero" | null }) => {
      const cloned = withFocusedPosterInfoNorm(raw);
      const next = withComputedCanvas({
        ...cloned,
        blocks: layoutBlocks(cloned.blocks, RAIL_GAP, cloned),
      });
      commit(next);
      const ordered = orderRows(next.blocks);
      const pick =
        opts?.select === null
          ? null
          : opts?.select === "hero"
            ? (ordered.find((b) => b.type === "hero")?.id ?? ordered[0]?.id ?? null)
            : (ordered[0]?.id ?? null);
      setSelectedId(pick);
    },
    [commit],
  );

  const applyLibraryScreens = useCallback(
    (
      snap: NuvioLibrarySnapshot,
      overlay?: { home?: ViewPack | null; movies?: ViewPack | null; shows?: ViewPack | null },
    ) => {
      const rotateUnlocked = packRef.current.rotateUnlocked;
      const rotateIntervalHours = packRef.current.rotateIntervalHours ?? MIN_ROTATE_INTERVAL_HOURS;
      const withRotate = (raw: ViewPack): ViewPack => ({
        ...clonePack(raw),
        rotateUnlocked,
        rotateIntervalHours,
        lastShuffleAt: undefined,
        shuffleSeed: undefined,
      });
      screenPacksRef.current = {
        home: withRotate(overlay?.home ?? snap.homePack),
        movies: withRotate(overlay?.movies ?? snap.moviesPack),
        shows: withRotate(overlay?.shows ?? snap.showsPack),
      };
      replacePack(clonePack(screenPacksRef.current[studioScreenRef.current]), { select: "hero" });
      setMode("arrange");
    },
    [replacePack],
  );

  const applyHomePack = useCallback(
    (snap: NuvioLibrarySnapshot) => {
      applyLibraryScreens(snap);
    },
    [applyLibraryScreens],
  );

  const selectStudioScreen = useCallback(
    (next: StudioScreen) => {
      if (next === studioScreenRef.current) return;
      screenPacksRef.current[studioScreenRef.current] = clonePack(packRef.current);
      studioScreenRef.current = next;
      setStudioScreen(next);
      replacePack(clonePack(screenPacksRef.current[next]), { select: "hero" });
    },
    [replacePack],
  );

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
        setGenreTargets(snap.genreTargets);
        applyHomePack(snap);
      } catch (e) {
        if (cancelled) return;
        const msg = e instanceof Error ? e.message : String(e);
        setAccountError(msg);
        if (/sign in again|session expired|jwt/i.test(msg)) {
          saveSession(null);
          setSession(null);
          setLibrary(null);
          setGenreTargets({});
        }
      } finally {
        if (!cancelled) setAccountBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.accessToken, applyHomePack]);

  /** Auto-fit the TV frame to the stage so nothing needs manual zooming. */
  useLayoutEffect(() => {
    const shell = shellRef.current;
    if (!shell) return;
    const measure = () => {
      const width = shell.clientWidth - CANVAS_PAD_X * 2;
      if (width > 0) setFitScale(Math.max(0.16, Math.min(1, width / VIEWPORT_WIDTH)));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(shell);
    return () => observer.disconnect();
  }, []);

  const updateBlock = useCallback(
    (id: string, patch: Partial<ViewBlock>, opts?: { live?: boolean }) => {
      const apply = (prev: ViewPack) => {
        const blocks = prev.blocks.map((b) =>
          b.id === id ? clampBlockHeight({ ...b, ...patch }, prev) : b,
        );
        return withComputedCanvas({ ...prev, blocks: layoutBlocks(blocks, RAIL_GAP, prev) });
      };
      if (opts?.live) previewPack(apply);
      else commit(apply);
    },
    [commit, previewPack],
  );

  const deleteRow = useCallback(
    (id: string) => {
      const ordered = orderRows(packRef.current.blocks);
      const index = ordered.findIndex((b) => b.id === id);
      const fallback = ordered[index + 1]?.id ?? ordered[index - 1]?.id ?? null;
      commit((prev) =>
        withComputedCanvas({
          ...prev,
          blocks: stackRows(
            orderRows(prev.blocks).filter((b) => b.id !== id),
            prev,
          ),
        }),
      );
      setSelectedId((cur) => (cur === id ? fallback : cur));
    },
    [commit],
  );

  const duplicateRow = useCallback(
    (id: string) => {
      const ordered = orderRows(packRef.current.blocks);
      const source = ordered.find((b) => b.id === id);
      if (!source) return;
      const copy: ViewBlock = { ...source, id: uid(source.type), label: `${rowTitle(source)} copy` };
      const index = ordered.findIndex((b) => b.id === id);
      const next = [...ordered.slice(0, index + 1), copy, ...ordered.slice(index + 1)];
      commit((prev) => withComputedCanvas({ ...prev, blocks: stackRows(next, prev) }));
      setSelectedId(copy.id);
    },
    [commit],
  );

  const moveRow = useCallback(
    (id: string, delta: number) => {
      const ordered = orderRows(packRef.current.blocks);
      const index = ordered.findIndex((b) => b.id === id);
      const target = index + delta;
      if (index < 0 || target < 0 || target >= ordered.length) return;
      const next = [...ordered];
      const [moved] = next.splice(index, 1);
      next.splice(target, 0, moved);
      commit((prev) => withComputedCanvas({ ...prev, blocks: stackRows(next, prev) }));
    },
    [commit],
  );

  const insertRow = useCallback(
    (type: BlockType, index: number) => {
      const def = blockDef(type);
      const options = sourcesForBlock(type, dataSources);
      const block: ViewBlock = {
        id: uid(type),
        type,
        x: 0,
        y: 0,
        w: VIEWPORT_WIDTH,
        h: def.defaultH,
        dataSource: options.find((s) => s.id !== "none")?.id ?? options[0]?.id ?? "none",
        trailer: type === "hero" || type === "mediaRail",
        label: def.label,
        hAlign: "start",
        contentAlign: "start",
        posterGrow: type === "mediaRail",
      };
      commit((prev) => {
        const ordered = orderRows(prev.blocks);
        const at = Math.max(0, Math.min(index, ordered.length));
        const next = [...ordered.slice(0, at), block, ...ordered.slice(at)];
        return withComputedCanvas({ ...prev, blocks: stackRows(next, prev) });
      });
      setSelectedId(block.id);
      setAddAtIndex(null);
      setMode("arrange");
    },
    [commit, dataSources],
  );

  const resizeRow = useCallback(
    (id: string, delta: number) => {
      const block = packRef.current.blocks.find((b) => b.id === id);
      if (!block) return;
      const def = blockDef(block.type);
      const maxH = maxRailHeightForBlock(block, packRef.current);
      let h = block.h + delta;
      h = Math.max(def.minH, h);
      if (maxH != null) h = Math.min(maxH, h);
      if (h === block.h) return;
      updateBlock(id, { h });
    },
    [updateBlock],
  );

  const startReorder = (block: ViewBlock, event: React.PointerEvent) => {
    if (mode !== "arrange" || event.button !== 0) return;
    event.stopPropagation();
    event.preventDefault();
    setSelectedId(block.id);
    historyRef.current.past.push(packRef.current);
    historyRef.current.future = [];
    setHistoryTick((t) => t + 1);
    dragRef.current = {
      kind: "reorder",
      blockId: block.id,
      pointerY: event.clientY,
      startY: block.y,
      startH: block.h,
    };
    setDraggingId(block.id);
    setDragOffset(0);
    capturePointer(event);
  };

  const startHeight = (block: ViewBlock, event: React.PointerEvent) => {
    if (mode !== "arrange" || event.button !== 0) return;
    event.stopPropagation();
    event.preventDefault();
    setSelectedId(block.id);
    historyRef.current.past.push(packRef.current);
    historyRef.current.future = [];
    setHistoryTick((t) => t + 1);
    dragRef.current = {
      kind: "height",
      blockId: block.id,
      pointerY: event.clientY,
      startY: block.y,
      startH: block.h,
    };
    capturePointer(event);
  };

  const onPointerMove = (event: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag) return;
    const dy = (event.clientY - drag.pointerY) / scale;

    if (drag.kind === "height") {
      const current = packRef.current.blocks.find((b) => b.id === drag.blockId);
      if (!current) return;
      const def = blockDef(current.type);
      const maxH = maxRailHeightForBlock(current, packRef.current);
      let h = Math.round(drag.startH + dy);
      h = Math.max(def.minH, h);
      if (maxH != null) h = Math.min(maxH, h);
      if (h === current.h) return;
      previewPack((prev) =>
        withComputedCanvas({
          ...prev,
          blocks: layoutBlocks(
            prev.blocks.map((b) => (b.id === drag.blockId ? { ...b, h } : b)),
            RAIL_GAP,
            prev,
          ),
        }),
      );
      return;
    }

    const ordered = orderRows(packRef.current.blocks);
    const index = ordered.findIndex((b) => b.id === drag.blockId);
    if (index < 0) return;
    const moving = ordered[index];
    const virtualCenter = drag.startY + dy + moving.h / 2;
    let target = 0;
    ordered.forEach((row, i) => {
      if (i === index) return;
      if (row.y + row.h / 2 < virtualCenter) target += 1;
    });
    setDragOffset(drag.startY + dy - moving.y);
    if (target === index) return;
    const next = [...ordered];
    const [lifted] = next.splice(index, 1);
    next.splice(target, 0, lifted);
    previewPack((prev) => withComputedCanvas({ ...prev, blocks: stackRows(next, prev) }));
  };

  const endDrag = () => {
    const drag = dragRef.current;
    dragRef.current = null;
    setDraggingId(null);
    setDragOffset(0);
    if (!drag) return;
    previewPack((prev) =>
      withComputedCanvas({ ...prev, blocks: stackRows(orderRows(prev.blocks), prev) }),
    );
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable);

      const mod = event.metaKey || event.ctrlKey;
      if (mod && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
        return;
      }
      if (mod && event.key.toLowerCase() === "y") {
        event.preventDefault();
        redo();
        return;
      }
      if (typing) return;
      if (!selectedId) return;

      if ((event.key === "Delete" || event.key === "Backspace") && !mod) {
        event.preventDefault();
        deleteRow(selectedId);
        return;
      }
      if (event.altKey && event.key === "ArrowUp") {
        event.preventDefault();
        moveRow(selectedId, -1);
        return;
      }
      if (event.altKey && event.key === "ArrowDown") {
        event.preventDefault();
        moveRow(selectedId, 1);
        return;
      }
      if (event.key === "ArrowUp" || event.key === "ArrowDown") {
        event.preventDefault();
        const ordered = orderRows(packRef.current.blocks);
        const index = ordered.findIndex((b) => b.id === selectedId);
        const next = ordered[index + (event.key === "ArrowDown" ? 1 : -1)];
        if (next) setSelectedId(next.id);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [deleteRow, moveRow, redo, selectedId, undo]);

  const clearAll = () => {
    if (!window.confirm("Remove every row from this layout?")) return;
    commit((prev) => withComputedCanvas({ ...prev, blocks: [] }));
    setSelectedId(null);
  };

  const loadDemo = (demoId: string) => {
    const demo = DEMO_PACKS.find((d) => d.id === demoId);
    if (!demo) return;
    replacePack(clonePack(demo.pack), { select: "hero" });
  };

  const importFile = async (file: File) => {
    try {
      const parsed = parseScreenPacks(JSON.parse(await file.text()));
      screenPacksRef.current[studioScreenRef.current] = clonePack(packRef.current);
      if (parsed.movies) screenPacksRef.current.movies = parsed.movies;
      if (parsed.shows) screenPacksRef.current.shows = parsed.shows;
      screenPacksRef.current.home = parsed.home;
      const screenPack =
        studioScreenRef.current === "movies"
          ? parsed.movies ?? parsed.home
          : studioScreenRef.current === "shows"
            ? parsed.shows ?? parsed.home
            : parsed.home;
      replacePack(clonePack(screenPack), { select: "hero" });
      showToast("Layout imported.");
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Failed to import pack");
    }
  };

  const exportPack = () => {
    const payload = withComputedCanvas({ ...pack, id: slugify(pack.name), schemaVersion: 1 });
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${payload.id}.view.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const sendToTv = async () => {
    setShareBusy(true);
    setShareMessage(null);
    setShareError(false);
    try {
      if (!session) {
        setShareError(true);
        setShareMessage("Sign in with your Nuvio account first, then press Send to TV.");
        return;
      }
      const config = defaultConfig();
      const fresh = await ensureFreshSession(config, session);
      if (fresh.accessToken !== session.accessToken) {
        setSession(fresh);
        saveSession(fresh);
      }
      const profileId = library?.profileId ?? 1;
      screenPacksRef.current[studioScreenRef.current] = clonePack(packRef.current);
      const payload = attachScreenPacks(
        screenPacksRef.current.home,
        screenPacksRef.current.movies,
        screenPacksRef.current.shows,
      );
      const pushed = await pushViewPackToAccount(config, fresh, payload, profileId);
      if (library?.homeCatalogSettings) {
        await pushHomeCatalogSettings(
          config,
          fresh,
          profileId,
          homeCatalogPayloadWithGenreTargets(library.homeCatalogSettings, genreTargets),
        );
      }
      setShareMessage(
        `Sent Home, Movies, and TV Shows to your TV (profile ${pushed.profileId}). ` +
          "On the SHIELD, accept the update when prompted — then switch tabs to see each layout.",
      );
      showToast(`Sent to TV · profile ${pushed.profileId}`);
    } catch (e) {
      setShareError(true);
      setShareMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setShareBusy(false);
    }
  };

  const loadFromTv = async () => {
    setShareBusy(true);
    setShareMessage(null);
    setShareError(false);
    try {
      if (!session) {
        setShareError(true);
        setShareMessage("Sign in with your Nuvio account first, then press Load from TV.");
        return;
      }
      const config = defaultConfig();
      const fresh = await ensureFreshSession(config, session);
      if (fresh.accessToken !== session.accessToken) {
        setSession(fresh);
        saveSession(fresh);
      }
      const profileId = library?.profileId ?? 1;
      const pulled = await pullViewPackFromAccount(config, fresh, profileId);
      if (!pulled) {
        setShareError(true);
        setShareMessage("No view pack on this account yet. Send to TV from Studio first.");
        return;
      }
      screenPacksRef.current = {
        home: clonePack(pulled.pack),
        movies: clonePack(pulled.movies ?? library?.moviesPack ?? pulled.pack),
        shows: clonePack(pulled.shows ?? library?.showsPack ?? pulled.pack),
      };
      replacePack(clonePack(screenPacksRef.current[studioScreenRef.current]), { select: "hero" });
      const loadedName = screenPacksRef.current[studioScreenRef.current].name;
      setShareMessage(
        `Loaded ${screenLabel(studioScreenRef.current)} from your TV account (profile ${pulled.profileId}).`,
      );
      showToast(`Loaded from TV · ${loadedName}`);
    } catch (e) {
      setShareError(true);
      setShareMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setShareBusy(false);
    }
  };

  const saveCurrentView = () => {
    const name = window.prompt("Name this layout", pack.name || "My view")?.trim() || pack.name;
    const saved = saveView(pack, name);
    setSavedViews(listSavedViews());
    setPack(saved.pack);
    showToast(`Saved “${saved.name}” in this browser.`);
  };

  const openSavedView = (id: string) => {
    const saved = loadSavedView(id);
    if (!saved) return;
    replacePack(clonePack(saved.pack), { select: "hero" });
  };

  const removeSavedView = (id: string) => {
    const saved = loadSavedView(id);
    if (!saved) return;
    if (!window.confirm(`Delete saved layout “${saved.name}”?`)) return;
    deleteSavedView(id);
    setSavedViews(listSavedViews());
  };

  const reshufflePreview = () => {
    if (!pack.rotateUnlocked) {
      showToast("Turn on “Randomize unlocked rails” first.");
      return;
    }
    const { pack: next } = applyUnlockedRotation(packRef.current, Date.now(), { force: true });
    commit(next);
  };

  const expandSelectedCollection = () => {
    if (!selected) return;
    if (!library?.collections?.length) {
      showToast("Sign in and reload your library so collection content is available.");
      return;
    }
    if (parseFolderDataSource(selected.dataSource)) {
      const next = expandFolderIntoCatalogRails(
        packRef.current,
        selected.id,
        library.collections,
        library.catalogNames ?? {},
      );
      if (!next) {
        showToast("No catalog sources found in this folder to expand.");
        return;
      }
      commit(next);
      setSelectedId(next.blocks.find((b) => b.dataSource.startsWith("catalog:"))?.id ?? null);
      return;
    }
    if (selected.type !== "collectionRail") return;
    if (!selected.dataSource.startsWith("collection:")) return;
    const next = expandCollectionIntoContentRails(
      packRef.current,
      selected.id,
      library.collections,
      library.catalogNames ?? {},
    );
    if (!next) {
      showToast("No folders with content found in this collection.");
      return;
    }
    commit(next);
    const firstContent =
      next.blocks.find((b) => b.dataSource.startsWith("catalog:")) ??
      next.blocks.find((b) => parseFolderDataSource(b.dataSource));
    setSelectedId(firstContent?.id ?? null);
    showToast("Expanded into folder content rails.");
  };

  const turnSelectedIntoTextPills = () => {
    if (!selected) return;
    const collectionId = parseCollectionHubDataSource(selected.dataSource);
    if (!collectionId) {
      showToast("Point this rail at a collection first.");
      return;
    }
    if (
      selected.type !== "collectionRail" &&
      selected.type !== "mediaRail" &&
      selected.type !== "genreRail"
    ) {
      return;
    }
    const pillH = blockDef("genreRail").defaultH;
    updateBlock(selected.id, {
      type: "genreRail",
      h: pillH,
      trailer: false,
      posterGrow: false,
      showPosterLabels: undefined,
    });
    showToast("This rail is now text pills from the collection’s folders.");
  };

  const turnSelectedIntoCollectionCards = () => {
    if (!selected) return;
    if (selected.type !== "genreRail") return;
    if (!parseCollectionHubDataSource(selected.dataSource)) return;
    const def = blockDef("collectionRail");
    updateBlock(selected.id, {
      type: "collectionRail",
      h: def.defaultH,
    });
    showToast("This rail is collection cards again.");
  };

  const arranging = mode === "arrange";
  const inverse = 1 / scale;
  const foldRowIndex = displayRows.findIndex((b) => b.y >= VIEWPORT_HEIGHT);
  const storedById = useMemo(() => {
    const map = new Map<string, ViewBlock>();
    for (const b of pack.blocks) map.set(b.id, b);
    return map;
  }, [pack.blocks]);

  return (
    <div className="studio">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">Nuvio</span>
          <span className="brand-sub">Reframe Studio · vanilla Netflix contract</span>
        </div>

        <label className="name-field">
          <span>Layout name</span>
          <input
            value={pack.name}
            placeholder="My home layout"
            onChange={(e) =>
              setPack((prev) => ({ ...prev, name: e.target.value, id: slugify(e.target.value) }))
            }
          />
        </label>

        <div className="mode-toggle" role="group" aria-label="Studio mode">
          <button
            type="button"
            className={arranging ? "active" : ""}
            onClick={() => setMode("arrange")}
          >
            Arrange
          </button>
          <button
            type="button"
            className={!arranging ? "active" : ""}
            onClick={() => {
              setMode("preview");
              setAddAtIndex(null);
            }}
          >
            Preview
          </button>
        </div>

        <div className="topbar-actions">
          <div className="icon-group">
            <button
              type="button"
              className="icon-btn"
              title="Undo (Ctrl+Z)"
              onClick={undo}
              disabled={!canUndo}
            >
              ↺
            </button>
            <button
              type="button"
              className="icon-btn"
              title="Redo (Ctrl+Shift+Z)"
              onClick={redo}
              disabled={!canRedo}
            >
              ↻
            </button>
          </div>
          <button type="button" className="btn ghost" onClick={saveCurrentView}>
            Save
          </button>
          <button type="button" className="btn ghost" onClick={exportPack}>
            Export
          </button>
          <button
            type="button"
            className="btn ghost"
            onClick={() => void loadFromTv()}
            disabled={shareBusy}
            title={session ? "Load the pack currently on your Nuvio account / TV" : "Sign in first"}
          >
            {shareBusy ? "Working…" : "Load from TV"}
          </button>
          <button
            type="button"
            className="btn primary"
            onClick={() => void sendToTv()}
            disabled={shareBusy}
            title={session ? "Push Home, Movies, and TV Shows to your signed-in Nuvio TV" : "Sign in first"}
          >
            {shareBusy ? "Sending…" : "Send to TV"}
          </button>
        </div>
      </header>

      {shareMessage && (
        <div className={`share-banner${shareError ? " share-error" : ""}`}>
          <div className="share-banner-main">
            <strong>{shareError ? "Sync failed" : "Account sync"}</strong>
            <span className={`share-msg${shareError ? " is-error" : ""}`}>{shareMessage}</span>
          </div>
          <div className="share-banner-actions">
            <button
              type="button"
              className="icon-btn"
              title="Dismiss"
              onClick={() => {
                setShareMessage(null);
                setShareError(false);
              }}
            >
              ×
            </button>
          </div>
        </div>
      )}

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
              setGenreTargets(snap?.genreTargets ?? {});
              if (snap) applyHomePack(snap);
            }}
            onBusy={setAccountBusy}
            onError={setAccountError}
          />

          <h2>Saved layouts</h2>
          <ul className="stack-list">
            {savedViews.length === 0 && <li className="hint quiet">Nothing saved in this browser yet.</li>}
            {savedViews.map((view) => (
              <li key={view.id} className="stack-row">
                <button type="button" className="stack-main" onClick={() => openSavedView(view.id)}>
                  <strong>{view.name}</strong>
                  <span>{new Date(view.updatedAt).toLocaleString()}</span>
                </button>
                <button
                  type="button"
                  className="icon-btn subtle"
                  title="Delete saved layout"
                  onClick={() => removeSavedView(view.id)}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>

          <h2>Start from</h2>
          <ul className="stack-list">
            {DEMO_PACKS.map((demo) => (
              <li key={demo.id}>
                <button type="button" className="stack-main" onClick={() => loadDemo(demo.id)}>
                  <strong>{demo.name.replace(/^Demo · /, "")}</strong>
                  <span>{demo.blurb}</span>
                </button>
              </li>
            ))}
            <li>
              <button
                type="button"
                className="stack-main"
                onClick={() => replacePack(createEmptyPack("Blank home"), { select: "hero" })}
              >
                <strong>Blank home</strong>
                <span>Nav, hero, and Continue Watching only</span>
              </button>
            </li>
          </ul>

          <div className="rail-section">
            <button
              type="button"
              className="btn ghost full"
              onClick={() => fileInputRef.current?.click()}
            >
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
          </div>

          <div className="rail-footer">
            <a href="https://github.com/Tolu-Walop-E/Nuvio_Reframe" target="_blank" rel="noreferrer">
              Nuvio TV repo
            </a>
            <span>
              Authors vanilla Nuvio Netflix Home, Movies, and TV Shows. Switch the tab above the canvas, drag to reorder, then Send to TV.
            </span>
          </div>
        </aside>

        <main className="stage">
          <div className="stage-bar">
            <div className="screen-tabs" role="tablist" aria-label="Netflix screen">
              {STUDIO_SCREENS.map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  role="tab"
                  aria-selected={studioScreen === entry.id}
                  className={`chip${studioScreen === entry.id ? " active" : ""}`}
                  onClick={() => selectStudioScreen(entry.id)}
                >
                  {entry.label}
                </button>
              ))}
            </div>
            <span
              className="row-count"
              title={`Preview of vanilla Nuvio Netflix ${screenLabel(studioScreen)} (pack runtime contract v1)`}
            >
              {rows.length} row{rows.length === 1 ? "" : "s"} · Netflix {screenLabel(studioScreen)} · contract v1
            </span>
            <span
              className={`budget-pill${firstScreenRails > MAX_COUNTED_RAILS_IN_VIEWPORT ? " over" : ""}`}
              title="Hero, genres, and Continue Watching don't count toward the first screen."
            >
              {firstScreenRails}/{MAX_COUNTED_RAILS_IN_VIEWPORT} rails on first screen
              {belowFold > 0 ? ` · ${belowFold} below the fold` : ""}
            </span>
            <div className="zoom-group">
              <button
                type="button"
                className={`chip${zoom === "fit" ? " active" : ""}`}
                onClick={() => setZoom("fit")}
              >
                Fit
              </button>
              <button
                type="button"
                className={`chip${zoom === 0.5 ? " active" : ""}`}
                onClick={() => setZoom(0.5)}
              >
                50%
              </button>
              <button
                type="button"
                className={`chip${zoom === 0.75 ? " active" : ""}`}
                onClick={() => setZoom(0.75)}
              >
                75%
              </button>
            </div>
          </div>

          <div
            ref={shellRef}
            className={`canvas-shell${arranging ? " arranging" : ""}`}
            onPointerMove={onPointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            onClick={() => setAddAtIndex(null)}
          >
            <div
              className="canvas-sizer"
              style={{ width: VIEWPORT_WIDTH * scale, height: canvasSize.height * scale }}
            >
            <div
              className="canvas"
              style={{
                width: canvasSize.width,
                height: canvasSize.height,
                transform: `scale(${scale})`,
                ["--inv" as string]: inverse,
              }}
            >
              <div className="fold-line" style={{ top: VIEWPORT_HEIGHT }}>
                <span className="fold-label">First TV screen ends here — rows below need scrolling</span>
              </div>

              {displayRows.length === 0 && (
                <div className="canvas-empty">
                  <p>No rows yet.</p>
                  <button type="button" className="btn primary" onClick={() => setAddAtIndex(0)}>
                    Add your first row
                  </button>
                </div>
              )}

              {displayRows.map((block, index) => {
                const stored = storedById.get(block.id) ?? block;
                const isSelected = selectedId === block.id;
                const isDragging = draggingId === block.id;
                const sources = sourcesForBlock(stored.type, dataSources);
                const sourceTypeLabel = dataSourceTypeLabel(stored.dataSource);
                return (
                  <div
                    key={block.id}
                    className={[
                      "row",
                      `row-${block.type}`,
                      isSelected ? "selected" : "",
                      isDragging ? "dragging" : "",
                      arranging ? "editable" : "",
                      index === displayRows.length - 1 ? "last" : "",
                      index === foldRowIndex ? "first-below-fold" : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    style={{
                      left: block.x,
                      top: block.y,
                      width: block.w,
                      height: block.h,
                      transform: isDragging ? `translateY(${dragOffset}px)` : undefined,
                    }}
                    onPointerDown={(e) => {
                      if (arranging) startReorder(stored, e);
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedId(block.id);
                      setAddAtIndex(null);
                    }}
                  >
                    <MockBlockPreview
                      block={block}
                      preview={!arranging}
                      board={library?.previewBoard}
                      pack={pack}
                      collections={library?.collections}
                    />

                    {arranging && (
                      <>
                        <div
                          className="row-toolbar"
                          onPointerDown={(e) => e.stopPropagation()}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <span
                            className="grip"
                            title="Drag to reorder"
                            onPointerDown={(e) => startReorder(stored, e)}
                          >
                            ⠿ {index + 1}
                          </span>

                          <input
                            className="row-name"
                            value={stored.label ?? ""}
                            placeholder={blockDef(stored.type).label}
                            onChange={(e) => updateBlock(stored.id, { label: e.target.value })}
                          />

                          {sources.length > 1 && (
                            <select
                              className="row-source"
                              value={stored.dataSource}
                              onChange={(e) =>
                                updateBlock(stored.id, {
                                  dataSource: e.target.value as ViewBlock["dataSource"],
                                })
                              }
                            >
                              {sources.map((s) => {
                                const typeLabel = dataSourceTypeLabel(s.id);
                                const option =
                                  typeLabel && !s.label.toLowerCase().includes(typeLabel.toLowerCase())
                                    ? `${s.label} · ${typeLabel}`
                                    : s.label;
                                return (
                                  <option key={s.id} value={s.id}>
                                    {option}
                                  </option>
                                );
                              })}
                            </select>
                          )}

                          {sourceTypeLabel ? (
                            <span
                              className="row-flag"
                              title="Catalog type from this rail's source"
                            >
                              {sourceTypeLabel}
                            </span>
                          ) : null}

                          {stored.collectionOpenStyle === "reframe" && (
                            <span className="row-flag" title="Opens in Reframe view on the TV">
                              Reframe open
                            </span>
                          )}

                          <span className="tool-sep" />

                          <button
                            type="button"
                            className="icon-btn"
                            title="Move up (Alt+↑)"
                            disabled={index === 0}
                            onClick={() => moveRow(stored.id, -1)}
                          >
                            ↑
                          </button>
                          <button
                            type="button"
                            className="icon-btn"
                            title="Move down (Alt+↓)"
                            disabled={index === displayRows.length - 1}
                            onClick={() => moveRow(stored.id, 1)}
                          >
                            ↓
                          </button>
                          <button
                            type="button"
                            className="icon-btn"
                            title="Shorter"
                            onClick={() => resizeRow(stored.id, -HEIGHT_STEP)}
                          >
                            −
                          </button>
                          <button
                            type="button"
                            className="icon-btn"
                            title="Taller"
                            onClick={() => resizeRow(stored.id, HEIGHT_STEP)}
                          >
                            +
                          </button>
                          <button
                            type="button"
                            className="icon-btn"
                            title="Duplicate row"
                            onClick={() => duplicateRow(stored.id)}
                          >
                            ⧉
                          </button>
                          <button
                            type="button"
                            className="icon-btn danger"
                            title="Delete row (Del)"
                            onClick={() => deleteRow(stored.id)}
                          >
                            ×
                          </button>
                        </div>

                        <div
                          className="row-height-handle"
                          title="Drag to change row height (base size; pack scale multiplies preview)"
                          onPointerDown={(e) => startHeight(stored, e)}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <span>
                            {stored.h}px
                            {block.h !== stored.h ? ` → ${block.h}px` : ""}
                          </span>
                        </div>

                        <div
                          className={`row-insert${addAtIndex === index + 1 ? " open" : ""}`}
                          style={{ top: block.h + RAIL_GAP / 2 }}
                          onPointerDown={(e) => e.stopPropagation()}
                        >
                          <button
                            type="button"
                            className="insert-btn"
                            onClick={(e) => {
                              e.stopPropagation();
                              setAddAtIndex(addAtIndex === index + 1 ? null : index + 1);
                            }}
                          >
                            + Add row
                          </button>
                          {addAtIndex === index + 1 && (
                            <div className="insert-menu" onClick={(e) => e.stopPropagation()}>
                              {BLOCK_CATALOG.map((def) => (
                                <button
                                  key={def.type}
                                  type="button"
                                  onClick={() => insertRow(def.type, index + 1)}
                                >
                                  <strong>{def.label}</strong>
                                  <span>{def.description}</span>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
            </div>
          </div>
        </main>

        <aside className="inspector">
          <div className="inspector-section contract-banner">
            <h3>Vanilla TV contract</h3>
            <p className="hint">
              Preview approximates Netflix home. Only{" "}
              <span className="badge honored">Honored</span> fields change vanilla Nuvio after
              import.{" "}
              <span className="badge preview-only">Preview only</span> stays in Studio.
            </p>
          </div>

          {!selected ? (
            <>
              <h2>Row settings</h2>
              <p className="hint">Pick a row on the canvas to edit its behaviour.</p>
            </>
          ) : (
            <>
              <h2>{rowTitle(selected)}</h2>
              <p className="hint">{blockDef(selected.type).description}</p>
              <div className="inspector-form">
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
                    onChange={(e) => updateBlock(selected.id, { locked: e.target.checked })}
                  />
                  Keep this row in place when rails rotate
                  <span className="badge honored">Honored</span>
                </label>

                {(selected.type === "hero" || selected.type === "mediaRail") &&
                  selected.dataSource !== "continueWatching" && (
                  <label className="checkbox">
                    <input
                      type="checkbox"
                      checked={selected.trailer}
                      onChange={(e) => updateBlock(selected.id, { trailer: e.target.checked })}
                    />
                    Play trailer when focused
                    <span className="badge honored">Honored</span>
                  </label>
                )}

                {(selected.type === "mediaRail" ||
                  selected.type === "genreRail" ||
                  selected.type === "collectionRail") && (
                  <>
                    <label className="preview-only-control">
                      Content alignment
                      <span className="badge preview-only">Preview only</span>
                      <select
                        value={selected.contentAlign ?? "start"}
                        onChange={(e) =>
                          updateBlock(selected.id, {
                            contentAlign: e.target.value as ViewBlock["contentAlign"],
                          })
                        }
                      >
                        <option value="start">Left</option>
                        <option value="center">Centered</option>
                      </select>
                    </label>
                    {selected.type === "mediaRail" && selected.dataSource !== "continueWatching" && (
                      <label className="checkbox">
                        <input
                          type="checkbox"
                          checked={selected.posterGrow !== false}
                          onChange={(e) => updateBlock(selected.id, { posterGrow: e.target.checked })}
                        />
                        Posters grow when focused
                        <span className="badge honored">Honored</span>
                      </label>
                    )}
                  </>
                )}

                {selected.type === "genreRail" && (
                  <div className="genre-targets">
                    <div className="genre-targets-head">
                      <span>Text pills</span>
                      <span className="badge honored">Honored</span>
                    </div>
                    {parseCollectionHubDataSource(selected.dataSource) ? (
                      <p className="hint">
                        Pills are this collection’s folder titles. TV wraps each pill to the text
                        width — we don’t pre-fill Action / Comedy / etc.
                      </p>
                    ) : (
                      <p className="hint">
                        Point this rail at a collection to use that collection’s folders as pills, or
                        leave Genres so the TV fills from installed catalogs. Use{" "}
                        <strong>Turn into text pills</strong> on a collection rail to convert it in
                        place.
                      </p>
                    )}
                  </div>
                )}

                {isCollectionBlock(selected) && (
                  <div className="sub-setting">
                    <label className="checkbox">
                      <input
                        type="checkbox"
                        checked={
                          selected.collectionOpenStyle === "reframe" ||
                          (selected.collectionOpenStyle == null &&
                            pack.collectionsOpenInReframe === true)
                        }
                        onChange={(e) =>
                          updateBlock(selected.id, {
                            // Explicit per-rail override; clear when matching the global default.
                            collectionOpenStyle: e.target.checked
                              ? pack.collectionsOpenInReframe
                                ? undefined
                                : "reframe"
                              : pack.collectionsOpenInReframe
                                ? "grid"
                                : undefined,
                          })
                        }
                      />
                      Open this collection in Reframe view
                      <span className="badge honored">Honored</span>
                    </label>
                    <p className="hint">
                      {pack.collectionsOpenInReframe
                        ? "Global “Open collections in this Reframe view” is on. Uncheck to force the old grid for this collection only."
                        : "Folders opened from this rail use Netflix-style home presentation (hero + rails) instead of the default collection grid. Or turn on the Whole layout flag for every collection."}
                    </p>
                  </div>
                )}

                {(selected.type === "collectionRail" ||
                  parseFolderDataSource(selected.dataSource)) && (
                  <>
                    <button
                      type="button"
                      className="btn ghost full"
                      onClick={expandSelectedCollection}
                    >
                      {parseFolderDataSource(selected.dataSource)
                        ? "Expand folder into catalog rails"
                        : "Expand into folder content rails"}
                    </button>
                    {!parseFolderDataSource(selected.dataSource) &&
                      selected.type === "collectionRail" && (
                        <p className="hint">
                          Splits this collection into one title rail per folder catalog, labeled
                          Movies or TV Shows from that catalog&apos;s type.
                        </p>
                      )}
                  </>
                )}

                {parseCollectionHubDataSource(selected.dataSource) &&
                  (selected.type === "collectionRail" || selected.type === "mediaRail") && (
                    <>
                      <button
                        type="button"
                        className="btn ghost full"
                        onClick={turnSelectedIntoTextPills}
                      >
                        Turn into text pills
                      </button>
                      <p className="hint">
                        Shrinks this rail into wrap-width text pills named after each folder. TV
                        opens the folder when a pill is selected.
                      </p>
                    </>
                  )}

                {selected.type === "genreRail" &&
                  parseCollectionHubDataSource(selected.dataSource) && (
                    <button
                      type="button"
                      className="btn ghost full"
                      onClick={turnSelectedIntoCollectionCards}
                    >
                      Turn back into collection cards
                    </button>
                  )}

                {selected.w !== VIEWPORT_WIDTH || selected.x !== 0 ? (
                  <button
                    type="button"
                    className="btn ghost full"
                    onClick={() => updateBlock(selected.id, { x: 0, w: VIEWPORT_WIDTH })}
                  >
                    Stretch to full TV width
                  </button>
                ) : null}

                <div className="geometry">
                  <span>
                    height {selected.h}px{" "}
                    {(selected.type === "mediaRail" || selected.type === "collectionRail") &&
                    selected.dataSource !== "continueWatching" ? (
                      <span className="badge honored" title="Maps to Netflix rail scale on TV">
                        → scale
                      </span>
                    ) : (
                      <span className="badge preview-only">Preview layout</span>
                    )}
                  </span>
                  <span>
                    {selected.w} × {selected.h}
                  </span>
                </div>
                <p className="hint quiet">
                  Canvas x/y/w are preview layout only. Row order (Y) and data source are honored on
                  TV.
                </p>
              </div>
            </>
          )}

          <div className="inspector-section">
            <h3>Whole layout</h3>
            <div className="inspector-form">
              <label>
                Description
                <input
                  value={pack.description ?? ""}
                  placeholder="Short blurb shown on the TV after import"
                  onChange={(e) => setPack((prev) => ({ ...prev, description: e.target.value }))}
                />
              </label>

              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={pack.showFocusedPosterInfo === true}
                  onChange={(e) => {
                    const on = e.target.checked;
                    commit((prev) => {
                      const next = { ...prev, showFocusedPosterInfo: on };
                      return withComputedCanvas({
                        ...next,
                        blocks: layoutBlocks(next.blocks, RAIL_GAP, next),
                      });
                    });
                  }}
                />
                Show Netflix catalogue footer under focused posters
                <span className="badge honored">Honored</span>
              </label>
              <p className="hint">
                Maps to vanilla Nuvio&apos;s Netflix home metadata strip (not Modern&apos;s footer).
                Catalog and collection rails only. Caps those rows at {MAX_LABELED_RAIL_HEIGHT}px so
                posters can grow large while facts and at least two description lines still fit.
              </p>

              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={pack.collectionsOpenInReframe === true}
                  onChange={(e) =>
                    commit((prev) => ({
                      ...prev,
                      collectionsOpenInReframe: e.target.checked ? true : undefined,
                    }))
                  }
                />
                Open collections in this Reframe view
                <span className="badge honored">Honored</span>
              </label>
              <p className="hint">
                Folders opened from any collection use Netflix-style home presentation (hero +
                rails) instead of the old Nuvio tabbed grid. Per-rail &quot;Open this collection in
                Reframe view&quot; still overrides one collection when set.
              </p>

              <label>
                Catalog poster size
                <span className="badge honored">Honored</span>
                <input
                  type="range"
                  min={MIN_PACK_CARD_SCALE}
                  max={MAX_PACK_CARD_SCALE}
                  step={0.05}
                  value={normalizePackCardScale(
                    pack.catalogPosterScale ?? DEFAULT_PACK_CARD_SCALE,
                  )}
                  onPointerDown={beginScalePreview}
                  onChange={(e) =>
                    previewPack((prev) => ({
                      ...prev,
                      catalogPosterScale: normalizePackCardScale(Number(e.target.value)),
                    }))
                  }
                />
                <span className="hint quiet">
                  {Math.round(
                    normalizePackCardScale(pack.catalogPosterScale ?? DEFAULT_PACK_CARD_SCALE) *
                      100,
                  )}
                  % · media / catalog title rails · live preview
                  {pack.showFocusedPosterInfo
                    ? " · max keeps ≥2 detail lines under posters"
                    : ""}
                </span>
              </label>

              <label>
                Collection landscape size
                <span className="badge honored">Honored</span>
                <input
                  type="range"
                  min={MIN_PACK_CARD_SCALE}
                  max={MAX_PACK_CARD_SCALE}
                  step={0.05}
                  value={normalizePackCardScale(
                    pack.collectionLandscapeScale ?? DEFAULT_PACK_CARD_SCALE,
                  )}
                  onPointerDown={beginScalePreview}
                  onChange={(e) =>
                    previewPack((prev) => ({
                      ...prev,
                      collectionLandscapeScale: normalizePackCardScale(Number(e.target.value)),
                    }))
                  }
                />
                <span className="hint quiet">
                  {Math.round(
                    normalizePackCardScale(
                      pack.collectionLandscapeScale ?? DEFAULT_PACK_CARD_SCALE,
                    ) * 100,
                  )}
                  % · collection hub tiles (Streaming, Studios, …) · live preview
                </span>
              </label>

              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={pack.rotateUnlocked === true}
                  onChange={(e) =>
                    commit((prev) => ({
                      ...prev,
                      rotateUnlocked: e.target.checked,
                      rotateIntervalHours: normalizeRotateIntervalHours(
                        prev.rotateIntervalHours ?? MIN_ROTATE_INTERVAL_HOURS,
                      ),
                    }))
                  }
                />
                Shuffle unlocked rows on the TV
                <span className="badge honored">Honored</span>
              </label>
              {pack.rotateUnlocked && (
                <>
                  <label>
                    Shuffle every (hours)
                    <input
                      type="number"
                      min={MIN_ROTATE_INTERVAL_HOURS}
                      step={1}
                      value={normalizeRotateIntervalHours(
                        pack.rotateIntervalHours ?? MIN_ROTATE_INTERVAL_HOURS,
                      )}
                      onChange={(e) =>
                        setPack((prev) => ({
                          ...prev,
                          rotateIntervalHours: normalizeRotateIntervalHours(Number(e.target.value)),
                        }))
                      }
                    />
                  </label>
                  <button type="button" className="btn ghost full" onClick={reshufflePreview}>
                    Preview a shuffle
                  </button>
                </>
              )}

              <button type="button" className="btn ghost full danger-text" onClick={clearAll}>
                Remove all rows
              </button>
            </div>
          </div>
        </aside>
      </div>

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
