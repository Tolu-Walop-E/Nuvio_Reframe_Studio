import type { CSSProperties } from "react";
import type { PreviewBoard, PreviewItem } from "../nuvio/previewBoard";
import type { ViewBlock } from "../types/viewPack";

const POSTER_HUES = [12, 28, 200, 260, 320, 160, 45, 185, 5, 95];
const GENRES = ["Action", "Anime", "Comedy", "Drama", "Sci‑Fi", "Thriller", "Horror", "Romance"];
const NAV = ["Home", "Movies", "Shows", "Collections"];

function fallbackPosterStyle(index: number, w: number, h: number): CSSProperties {
  const hue = POSTER_HUES[index % POSTER_HUES.length];
  return {
    background: `
      linear-gradient(160deg, hsla(${hue}, 70%, 48%, 0.95), hsla(${(hue + 40) % 360}, 55%, 22%, 0.98)),
      radial-gradient(circle at 30% 20%, hsla(${hue}, 90%, 70%, 0.35), transparent 50%)
    `,
    width: w,
    height: h,
  };
}

/** Cards scale with the rail container so resize grows/shrinks posters together. */
function cardDims(block: ViewBlock, landscape: boolean): { w: number; h: number } {
  const padY = 32;
  const availH = Math.max(40, block.h - padY);
  const h = Math.round(availH * 0.9);
  const ratio = landscape ? 210 / 118 : 118 / 178;
  let w = Math.round(h * ratio);
  // Keep a sensible min so tiny rails still read as posters.
  w = Math.max(landscape ? 72 : 48, w);
  const hOut = Math.max(40, Math.round(w / ratio));
  return { w, h: Math.min(hOut, availH) };
}

type Props = {
  block: ViewBlock;
  preview: boolean;
  board?: PreviewBoard | null;
};

export function MockBlockPreview({ block, preview, board }: Props) {
  if (block.type === "topNav") {
    return (
      <div className={`mock mock-nav${preview ? " rich" : ""}`}>
        <div className="mock-logo">NUVIO</div>
        <div className="mock-nav-links">
          {NAV.map((item, i) => (
            <span key={item} className={i === 0 ? "active" : ""}>
              {item}
            </span>
          ))}
        </div>
        <div className="mock-nav-gear">⚙</div>
      </div>
    );
  }

  if (block.type === "hero") {
    const items = itemsFor(block, board);
    const hero = items[0];
    const art = hero?.backdrop || hero?.poster;
    return (
      <div
        className={`mock mock-hero${preview ? " rich" : ""}`}
        style={
          art
            ? {
                backgroundImage: `url(${cssUrl(art)})`,
                backgroundSize: "cover",
                backgroundPosition: "center top",
              }
            : undefined
        }
      >
        <div className="mock-hero-art" style={art ? { background: "transparent" } : undefined} />
        <div className="mock-hero-scrim" />
        <div className="mock-hero-copy">
          <p className="eyebrow">{block.label || "Featured"}</p>
          {hero?.logo ? (
            <img className="mock-hero-logo" src={hero.logo} alt={hero.title} />
          ) : (
            <h3>{hero?.title || heroTitle(block.dataSource)}</h3>
          )}
          <p className="synopsis">
            {hero
              ? `${hero.title}${block.trailer ? " · trailer-ready" : ""}`
              : `Loading art · ${block.dataSource}`}
          </p>
          <div className="mock-hero-ctas">
            <span className="cta primary">Play</span>
            <span className="cta">More info</span>
          </div>
        </div>
      </div>
    );
  }

  if (block.type === "genreRail") {
    const chipH = Math.max(36, Math.min(64, Math.round(block.h * 0.45)));
    const chipW = Math.round(chipH * 2.4);
    return (
      <div className={`mock mock-rail${preview ? " rich" : ""}`}>
        <div className="mock-rail-title">{block.label || "Genres"}</div>
        <div className={`mock-row align-${block.contentAlign ?? "start"}`}>
          {GENRES.map((g) => (
            <div
              key={g}
              className="mock-chip"
              style={{ minWidth: chipW, height: chipH, fontSize: Math.round(chipH * 0.32) }}
            >
              {g}
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (block.type === "spacer") {
    return <div className="mock mock-spacer">{preview ? "" : "Spacer"}</div>;
  }

  const live = itemsFor(block, board);
  // Prefer content shape from loaded items; only force landscape for CW / cover tiles.
  const landscape =
    block.dataSource === "continueWatching" ||
    (live.length > 0
      ? live.every((i) => i.landscape)
      : block.type === "collectionRail");
  const grow = block.posterGrow !== false && !landscape;
  const { w: cardW, h: cardH } = cardDims(block, landscape);
  const count = live.length > 0 ? Math.min(live.length, landscape ? 8 : 12) : landscape ? 7 : 10;

  return (
    <div className={`mock mock-rail${preview ? " rich" : ""}`}>
      <div
        className="mock-rail-title"
        style={{ fontSize: Math.max(16, Math.min(26, Math.round(block.h * 0.12))) }}
      >
        {block.label || block.type}
      </div>
      <div className={`mock-row align-${block.contentAlign ?? "start"}`}>
        {Array.from({ length: count }, (_, i) => {
          const item = live[i];
          const src = item?.poster || item?.backdrop;
          return (
            <div
              key={item?.id ?? i}
              className={[
                "mock-poster",
                landscape ? "landscape" : "portrait",
                i === 0 && preview ? "focused" : "",
                i === 0 && preview && grow ? "grows" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              style={
                src
                  ? {
                      width: cardW,
                      height: cardH,
                      backgroundImage: `url(${cssUrl(src)})`,
                      backgroundSize: "cover",
                      backgroundPosition: "center",
                    }
                  : fallbackPosterStyle(i + hash(block.id), cardW, cardH)
              }
              title={item?.title}
            >
              {landscape &&
                (block.dataSource === "continueWatching" || item?.progress != null) && (
                  <div className="mock-progress">
                    <i
                      style={{
                        width: `${item?.progress ?? 35 + ((i * 17) % 50)}%`,
                      }}
                    />
                  </div>
                )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function itemsFor(block: ViewBlock, board?: PreviewBoard | null): PreviewItem[] {
  if (!board) return [];
  const direct = board[block.dataSource];
  if (direct?.length) return direct;
  if (block.type === "hero") return board.featured ?? [];
  return [];
}

function cssUrl(url: string): string {
  return JSON.stringify(url).slice(1, -1);
}

function heroTitle(source: string): string {
  if (source.startsWith("collection:")) return "Your Collection";
  if (source.startsWith("catalog:")) {
    const parts = source.split(":");
    return parts[parts.length - 1] || "Catalog Premiere";
  }
  switch (source) {
    case "featured":
      return "Neon Harbor";
    case "catalogPopularMovies":
      return "Midnight Circuit";
    case "catalogPopularShows":
      return "Ashen Crown";
    default:
      return "Untitled Premiere";
  }
}

function hash(value: string): number {
  let n = 0;
  for (let i = 0; i < value.length; i++) n = (n + value.charCodeAt(i) * (i + 1)) % 97;
  return n;
}
