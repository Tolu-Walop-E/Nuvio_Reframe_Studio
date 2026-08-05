import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BLOCK_CATALOG, blockDef, type BlockType } from "./catalog/blocks";
import { sourcesForBlock } from "./catalog/dataSources";
import { DEMO_PACKS, clonePack, parseViewPack } from "./demos";
import { MockBlockPreview } from "./preview/MockBlockPreview";
import {
  VIEWPORT_HEIGHT,
  VIEWPORT_WIDTH,
  centerBlockX,
  computeCanvasSize,
  createEmptyPack,
  slugify,
  snapBlockPosition,
  withComputedCanvas,
  type ViewBlock,
  type ViewPack,
} from "./types/viewPack";
import "./App.css";

type DragMode = "move" | "resize";
type StudioMode = "edit" | "preview";
type ResizeCorner = "nw" | "ne" | "sw" | "se";

type DragState = {
  mode: DragMode;
  blockId: string;
  startX: number;
  startY: number;
  orig: ViewBlock;
  corner?: ResizeCorner;
};

function uid(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}`;
}

export default function App() {
  const [pack, setPack] = useState<ViewPack>(() => clonePack(DEMO_PACKS[1].pack));
  const [selectedId, setSelectedId] = useState<string | null>("hero");
  const [scale, setScale] = useState(0.42);
  const [mode, setMode] = useState<StudioMode>("preview");
  const [snapGuides, setSnapGuides] = useState<{ x: boolean; y: boolean }>({
    x: false,
    y: false,
  });
  const dragRef = useRef<DragState | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const selected = useMemo(
    () => pack.blocks.find((b) => b.id === selectedId) ?? null,
    [pack.blocks, selectedId],
  );

  const canvasSize = useMemo(() => computeCanvasSize(pack.blocks), [pack.blocks]);

  const updateBlock = useCallback((id: string, patch: Partial<ViewBlock>) => {
    setPack((prev) =>
      withComputedCanvas({
        ...prev,
        blocks: prev.blocks.map((b) => (b.id === id ? { ...b, ...patch } : b)),
      }),
    );
  }, []);

  const deleteBlock = useCallback((id: string) => {
    setPack((prev) =>
      withComputedCanvas({
        ...prev,
        blocks: prev.blocks.filter((b) => b.id !== id),
      }),
    );
    setSelectedId((cur) => (cur === id ? null : cur));
  }, []);

  const clearAll = () => {
    if (!window.confirm("Delete every block on this canvas?")) return;
    setPack((prev) => withComputedCanvas({ ...prev, blocks: [] }));
    setSelectedId(null);
  };

  const loadDemo = (demoId: string) => {
    const demo = DEMO_PACKS.find((d) => d.id === demoId);
    if (!demo) return;
    const next = withComputedCanvas(clonePack(demo.pack));
    setPack(next);
    setSelectedId(next.blocks[0]?.id ?? null);
    setMode("preview");
  };

  const importFile = async (file: File) => {
    try {
      const text = await file.text();
      const next = withComputedCanvas(parseViewPack(JSON.parse(text)));
      setPack(next);
      setSelectedId(next.blocks[0]?.id ?? null);
      setMode("preview");
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Failed to import pack");
    }
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Delete" && event.key !== "Backspace") return;
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT")) {
        return;
      }
      if (!selectedId) return;
      event.preventDefault();
      deleteBlock(selectedId);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [deleteBlock, selectedId]);

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
      dataSource: sourcesForBlock(type)[0]?.id ?? "none",
      trailer: type === "hero" || type === "mediaRail",
      label: def.label,
      hAlign: "start",
      contentAlign: "start",
      posterGrow: type === "mediaRail",
    };
    setPack((prev) => withComputedCanvas({ ...prev, blocks: [...prev.blocks, block] }));
    setSelectedId(block.id);
    setMode("edit");
  };

  const centerSelected = () => {
    if (!selected) return;
    updateBlock(selected.id, {
      x: centerBlockX(selected, VIEWPORT_WIDTH),
      hAlign: "center",
    });
  };

  const onPointerMove = (event: React.PointerEvent) => {
    if (mode !== "edit") return;
    const drag = dragRef.current;
    if (!drag) return;
    const dx = (event.clientX - drag.startX) / scale;
    const dy = (event.clientY - drag.startY) / scale;
    const def = blockDef(drag.orig.type);

    if (drag.mode === "move") {
      const snapped = snapBlockPosition(
        drag.orig.x + dx,
        drag.orig.y + dy,
        drag.orig.w,
        drag.orig.h,
      );
      setSnapGuides({ x: snapped.snappedX, y: snapped.snappedY });
      updateBlock(drag.blockId, {
        x: snapped.x,
        y: snapped.y,
        hAlign: snapped.snappedX && snapped.x === centerBlockX(drag.orig) ? "center" : "start",
      });
      return;
    }

    setSnapGuides({ x: false, y: false });
    const corner = drag.corner ?? "se";
    const next = resizeFromCorner(drag.orig, corner, dx, dy, def.minW, def.minH);
    updateBlock(drag.blockId, next);
  };

  const endDrag = () => {
    dragRef.current = null;
    setSnapGuides({ x: false, y: false });
  };

  const startMove = (block: ViewBlock, event: React.PointerEvent) => {
    if (mode !== "edit") return;
    event.stopPropagation();
    event.preventDefault();
    setSelectedId(block.id);
    dragRef.current = {
      mode: "move",
      blockId: block.id,
      startX: event.clientX,
      startY: event.clientY,
      orig: { ...block },
    };
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  };

  const startResize = (corner: ResizeCorner, block: ViewBlock, event: React.PointerEvent) => {
    if (mode !== "edit") return;
    event.stopPropagation();
    event.preventDefault();
    setSelectedId(block.id);
    dragRef.current = {
      mode: "resize",
      blockId: block.id,
      startX: event.clientX,
      startY: event.clientY,
      orig: { ...block },
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
          <button type="button" className="btn ghost" onClick={() => selectedId && deleteBlock(selectedId)} disabled={!selectedId}>
            Delete
          </button>
          <button type="button" className="btn primary" onClick={exportPack}>
            Export view.json
          </button>
        </div>
      </header>

      <div className="workspace">
        <aside className="rail">
          <h2>Demos</h2>
          <p className="hint">Load a starter layout, then tweak.</p>
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
                setSelectedId(null);
                setMode("edit");
              }}
            >
              New blank
            </button>
          </div>

          <h2>Blocks</h2>
          <p className="hint">Add a Nuvio TV building block.</p>
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
            <span>Delete: toolbar, block ×, or Del/Backspace.</span>
          </div>
        </aside>

        <main className="stage">
          <div
            className={`canvas-shell mode-${mode}`}
            onPointerMove={onPointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            onClick={() => setSelectedId(null)}
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
              {pack.blocks.map((block) => (
                <div
                  key={block.id}
                  className={`block block-${block.type}${selectedId === block.id ? " selected" : ""}${mode === "preview" ? " preview" : ""}`}
                  style={{
                    left: block.x,
                    top: block.y,
                    width: block.w,
                    height: block.h,
                  }}
                  onPointerDown={(e) => startMove(block, e)}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedId(block.id);
                  }}
                >
                  <MockBlockPreview block={block} preview={mode === "preview"} />
                  {mode === "edit" && (
                    <button
                      type="button"
                      className="block-delete"
                      aria-label={`Delete ${block.label || block.type}`}
                      title="Delete"
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteBlock(block.id);
                      }}
                      onPointerDown={(e) => e.stopPropagation()}
                    >
                      ×
                    </button>
                  )}
                  {mode === "edit" && selectedId === block.id && (
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
              ))}
            </div>
          </div>
          <p className="stage-caption">
            {mode === "preview" ? "Preview" : "Edit"} · canvas{" "}
            {canvasSize.width}×{canvasSize.height}
            {canvasSize.height > VIEWPORT_HEIGHT || canvasSize.width > VIEWPORT_WIDTH
              ? " · beyond first screen"
              : ""}{" "}
            · {(scale * 100).toFixed(0)}%
            {selectedId ? ` · selected ${selectedId}` : ""}
          </p>
        </main>

        <aside className="inspector">
          <h2>Inspector</h2>
          {!selected ? (
            <p className="hint">Select a block to bind data, toggle trailer, or delete it.</p>
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
                  {sourcesForBlock(selected.type).map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label}
                    </option>
                  ))}
                </select>
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
