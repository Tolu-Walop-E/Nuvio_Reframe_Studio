import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BLOCK_CATALOG, blockDef, type BlockType } from "./catalog/blocks";
import { sourcesForBlock } from "./catalog/dataSources";
import { DEMO_PACKS, clonePack, parseViewPack } from "./demos";
import { MockBlockPreview } from "./preview/MockBlockPreview";
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
type StudioMode = "edit" | "preview";

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
  const [pack, setPack] = useState<ViewPack>(() => clonePack(DEMO_PACKS[1].pack));
  const [selectedId, setSelectedId] = useState<string | null>("hero");
  const [scale, setScale] = useState(0.42);
  const [mode, setMode] = useState<StudioMode>("preview");
  const dragRef = useRef<DragState | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

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

  const deleteBlock = useCallback((id: string) => {
    setPack((prev) => ({
      ...prev,
      blocks: prev.blocks.filter((b) => b.id !== id),
    }));
    setSelectedId((cur) => (cur === id ? null : cur));
  }, []);

  const clearAll = () => {
    if (!window.confirm("Delete every block on this canvas?")) return;
    setPack((prev) => ({ ...prev, blocks: [] }));
    setSelectedId(null);
  };

  const loadDemo = (demoId: string) => {
    const demo = DEMO_PACKS.find((d) => d.id === demoId);
    if (!demo) return;
    const next = clonePack(demo.pack);
    setPack(next);
    setSelectedId(next.blocks[0]?.id ?? null);
    setMode("preview");
  };

  const importFile = async (file: File) => {
    try {
      const text = await file.text();
      const next = parseViewPack(JSON.parse(text));
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
      y: Math.min(y, CANVAS_HEIGHT - def.defaultH),
      w: def.defaultW,
      h: def.defaultH,
      dataSource: sourcesForBlock(type)[0]?.id ?? "none",
      trailer: type === "hero" || type === "mediaRail",
      label: def.label,
    };
    setPack((prev) => ({ ...prev, blocks: [...prev.blocks, block] }));
    setSelectedId(block.id);
    setMode("edit");
  };

  const onPointerMove = (event: React.PointerEvent) => {
    if (mode !== "edit") return;
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

  const startDrag = (dragMode: DragMode, block: ViewBlock, event: React.PointerEvent) => {
    if (mode !== "edit") return;
    event.stopPropagation();
    event.preventDefault();
    setSelectedId(block.id);
    dragRef.current = {
      mode: dragMode,
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
                width: CANVAS_WIDTH,
                height: CANVAS_HEIGHT,
                transform: `scale(${scale})`,
              }}
            >
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
                  onPointerDown={(e) => startDrag("move", block, e)}
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
          <p className="stage-caption">
            {mode === "preview" ? "Preview" : "Edit"} · 1920 × 1080 · {(scale * 100).toFixed(0)}%
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

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}
