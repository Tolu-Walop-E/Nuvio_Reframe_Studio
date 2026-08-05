import { useCallback, useMemo, useRef, useState } from "react";
import { BLOCK_CATALOG, blockDef, type BlockType } from "./catalog/blocks";
import { sourcesForBlock } from "./catalog/dataSources";
import {
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  createEmptyPack,
  slugify,
  type ViewBlock,
  type ViewPack,
} from "./types/viewPack";
import "./App.css";

type DragMode = "move" | "resize";

type DragState = {
  mode: DragMode;
  blockId: string;
  startX: number;
  startY: number;
  orig: ViewBlock;
};

function uid(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}`;
}

export default function App() {
  const [pack, setPack] = useState<ViewPack>(() => createEmptyPack("Netflix-like home"));
  const [selectedId, setSelectedId] = useState<string | null>("hero-1");
  const [scale, setScale] = useState(0.45);
  const dragRef = useRef<DragState | null>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);

  const selected = useMemo(
    () => pack.blocks.find((b) => b.id === selectedId) ?? null,
    [pack.blocks, selectedId],
  );

  const updateBlock = useCallback((id: string, patch: Partial<ViewBlock>) => {
    setPack((prev) => ({
      ...prev,
      blocks: prev.blocks.map((b) => (b.id === id ? { ...b, ...patch } : b)),
    }));
  }, []);

  const addBlock = (type: BlockType) => {
    const def = blockDef(type);
    const y =
      pack.blocks.reduce((max, b) => Math.max(max, b.y + b.h), 0) + 12;
    const block: ViewBlock = {
      id: uid(type),
      type,
      x: 0,
      y: Math.min(y, CANVAS_HEIGHT - def.defaultH),
      w: def.defaultW,
      h: def.defaultH,
      dataSource: sourcesForBlock(type)[0]?.id ?? "none",
      trailer: type === "hero" || type === "mediaRail",
      label: def.label,
    };
    setPack((prev) => ({ ...prev, blocks: [...prev.blocks, block] }));
    setSelectedId(block.id);
  };

  const removeSelected = () => {
    if (!selectedId) return;
    setPack((prev) => ({
      ...prev,
      blocks: prev.blocks.filter((b) => b.id !== selectedId),
    }));
    setSelectedId(null);
  };

  const onPointerMove = (event: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag) return;
    const dx = (event.clientX - drag.startX) / scale;
    const dy = (event.clientY - drag.startY) / scale;
    const def = blockDef(drag.orig.type);

    if (drag.mode === "move") {
      updateBlock(drag.blockId, {
        x: Math.round(clamp(drag.orig.x + dx, 0, CANVAS_WIDTH - drag.orig.w)),
        y: Math.round(clamp(drag.orig.y + dy, 0, CANVAS_HEIGHT - drag.orig.h)),
      });
    } else {
      updateBlock(drag.blockId, {
        w: Math.round(clamp(drag.orig.w + dx, def.minW, CANVAS_WIDTH - drag.orig.x)),
        h: Math.round(clamp(drag.orig.h + dy, def.minH, CANVAS_HEIGHT - drag.orig.y)),
      });
    }
  };

  const endDrag = () => {
    dragRef.current = null;
  };

  const startDrag = (
    mode: DragMode,
    block: ViewBlock,
    event: React.PointerEvent,
  ) => {
    event.stopPropagation();
    event.preventDefault();
    setSelectedId(block.id);
    dragRef.current = {
      mode,
      blockId: block.id,
      startX: event.clientX,
      startY: event.clientY,
      orig: { ...block },
    };
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  };

  const exportPack = () => {
    const payload: ViewPack = {
      ...pack,
      id: slugify(pack.name),
      schemaVersion: 1,
      canvas: { width: CANVAS_WIDTH, height: CANVAS_HEIGHT },
    };
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
          <button type="button" className="btn ghost" onClick={removeSelected} disabled={!selectedId}>
            Delete
          </button>
          <button type="button" className="btn primary" onClick={exportPack}>
            Export view.json
          </button>
        </div>
      </header>

      <div className="workspace">
        <aside className="rail">
          <h2>Blocks</h2>
          <p className="hint">Add a Nuvio TV building block. Drag and resize on the canvas.</p>
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
            <span>Packs stay design-only until the app loads them by id.</span>
          </div>
        </aside>

        <main className="stage">
          <div
            className="canvas-shell"
            onPointerMove={onPointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            onClick={() => setSelectedId(null)}
          >
            <div
              ref={canvasRef}
              className="canvas"
              style={{
                width: CANVAS_WIDTH,
                height: CANVAS_HEIGHT,
                transform: `scale(${scale})`,
              }}
            >
              {pack.blocks.map((block) => (
                <div
                  key={block.id}
                  className={`block block-${block.type}${selectedId === block.id ? " selected" : ""}`}
                  style={{
                    left: block.x,
                    top: block.y,
                    width: block.w,
                    height: block.h,
                  }}
                  onPointerDown={(e) => startDrag("move", block, e)}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedId(block.id);
                  }}
                >
                  <div className="block-title">
                    <span>{block.label || blockDef(block.type).label}</span>
                    <span className="block-meta">
                      {block.dataSource}
                      {block.trailer ? " · trailer" : ""}
                    </span>
                  </div>
                  {selectedId === block.id && (
                    <button
                      type="button"
                      className="resize-handle"
                      aria-label="Resize"
                      onPointerDown={(e) => startDrag("resize", block, e)}
                    />
                  )}
                </div>
              ))}
            </div>
          </div>
          <p className="stage-caption">1920 × 1080 TV canvas · scale {(scale * 100).toFixed(0)}%</p>
        </main>

        <aside className="inspector">
          <h2>Inspector</h2>
          {!selected ? (
            <p className="hint">Select a block to bind data and trailer.</p>
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
              <div className="geometry">
                <span>
                  x {selected.x} · y {selected.y}
                </span>
                <span>
                  {selected.w} × {selected.h}
                </span>
              </div>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}
