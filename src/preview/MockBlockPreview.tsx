import type { CSSProperties } from "react";
import type { PreviewBoard, PreviewItem } from "../nuvio/previewBoard";
import type { ViewBlock, ViewPack } from "../types/viewPack";
import {
  FOCUSED_METADATA_HEIGHT,
  MAX_LABELED_POSTER_HEIGHT,
  blockShowsFocusedPosterInfo,
} from "../types/viewPack";
import { railTitleWithCatalogType } from "../views/expandCollection";

const POSTER_HUES = [12, 28, 200, 260, 320, 160, 45, 185, 5, 95];
const GENRES = ["Action", "Anime", "Comedy", "Drama", "Sci‑Fi", "Thriller", "Horror", "Romance"];
const NAV = ["Home", "Movies", "TV Shows", "Watchlist"];
const PLACEHOLDER_BLURBS = [
  "A daring crew races against time across rival colonies.",
  "When secrets surface, loyalty becomes the rarest currency.",
  "An ordinary town hides an extraordinary myth.",
  "Found family, found footage — nothing stays buried.",
  "Love, loss, and the machines that keep us company.",
];

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
function cardDims(
  block: ViewBlock,
  landscape: boolean,
  withLabels: boolean,
): { w: number; h: number } {
  // When focused info is on, reserve a full Netflix-style footer (title+facts+3 lines).
  const labelReserve = withLabels ? FOCUSED_METADATA_HEIGHT : 0;
  const padY = 32 + labelReserve;
  const availH = Math.max(40, block.h - padY);
  const posterCap = withLabels ? MAX_LABELED_POSTER_HEIGHT : Math.round(block.h * 0.85);
  const h = Math.min(Math.round(availH * 0.9), posterCap);
  const ratio = landscape ? 210 / 118 : 118 / 178;
  let w = Math.round(h * ratio);
  // Keep a sensible min so tiny rails still read as posters.
  w = Math.max(landscape ? 72 : 48, w);
  const hOut = Math.max(40, Math.round(w / ratio));
  return { w, h: Math.min(hOut, availH, posterCap) };
}

type Props = {
  block: ViewBlock;
  preview: boolean;
  board?: PreviewBoard | null;
  pack?: Pick<ViewPack, "showFocusedPosterInfo"> | null;
  /** Live genre chip labels from the signed-in account (Genres collection). */
  genreLabels?: string[] | null;
};

export function MockBlockPreview({ block, preview, board, pack, genreLabels }: Props) {
  if (block.type === "topNav") {
    return (
      <div className={`mock mock-nav${preview ? " rich" : ""}`}>
        <span className="mock-nav-icon" aria-hidden>
          <PersonIcon />
        </span>
        <span className="mock-nav-spacer" />
        <div className="mock-nav-pill">
          {NAV.map((item, i) => (
            <span key={item} className={i === 0 ? "active" : ""}>
              {item}
            </span>
          ))}
        </div>
        <span className="mock-nav-spacer" />
        <div className="mock-nav-utils">
          <span className="mock-nav-icon" aria-hidden>
            <SearchIcon />
          </span>
          <span className="mock-nav-icon" aria-hidden>
            <SettingsIcon />
          </span>
        </div>
      </div>
    );
  }

  if (block.type === "hero") {
    const items = itemsFor(block, board);
    const hero = items[0];
    const art = hero?.backdrop || hero?.poster;
    const synopsis =
      hero?.description?.trim() ||
      (hero ? PLACEHOLDER_BLURBS[Math.abs(hash(hero.title)) % PLACEHOLDER_BLURBS.length] : null);
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
          {hero?.logo ? (
            <img className="mock-hero-logo" src={hero.logo} alt={hero.title} />
          ) : (
            <h3>{hero?.title || heroTitle(block.dataSource)}</h3>
          )}
          {synopsis ? <p className="synopsis">{synopsis}</p> : null}
          <span className="mock-hero-cta">View Details</span>
        </div>
      </div>
    );
  }

  if (block.type === "genreRail") {
    const chipH = Math.max(36, Math.min(64, Math.round(block.h * 0.45)));
    const chipW = Math.round(chipH * 2.4);
    const labels =
      genreLabels && genreLabels.length > 0 ? genreLabels.slice(0, 12) : GENRES;
    return (
      <div className={`mock mock-rail${preview ? " rich" : ""}`}>
        <div className="mock-rail-title">{block.label || "Genres"}</div>
        <div className={`mock-row align-${block.contentAlign ?? "start"}`}>
          {labels.map((g) => (
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
  const showLabels = blockShowsFocusedPosterInfo(block, pack ?? {});
  const { w: cardW, h: cardH } = cardDims(block, landscape, showLabels);
  const count = live.length > 0 ? Math.min(live.length, landscape ? 8 : 12) : landscape ? 7 : 10;
  const focused = live[0];
  const focusedTitle = focused?.title?.trim() || "Title 1";
  const focusedDesc =
    focused?.description?.trim() ||
    PLACEHOLDER_BLURBS[hash(block.id) % PLACEHOLDER_BLURBS.length];
  const focusedFacts = [
    "2024",
    GENRES[hash(block.id) % GENRES.length],
    landscape ? "1h 48m" : "2h 12m",
  ].join("  ·  ");

  return (
    <div className={`mock mock-rail${preview ? " rich" : ""}${showLabels ? " has-labels" : ""}`}>
      <div
        className="mock-rail-title"
        style={{ fontSize: Math.max(16, Math.min(26, Math.round(block.h * 0.12))) }}
      >
        {railTitleWithCatalogType(block.label, block.dataSource) || block.type}
      </div>
      <div className={`mock-row align-${block.contentAlign ?? "start"}`}>
        {Array.from({ length: count }, (_, i) => {
          const item = live[i];
          const src = item?.poster || item?.backdrop;
          const title = item?.title?.trim() || `Title ${i + 1}`;
          const description =
            item?.description?.trim() ||
            (item ? undefined : PLACEHOLDER_BLURBS[(i + hash(block.id)) % PLACEHOLDER_BLURBS.length]);
          return (
            <div
              key={item?.id ?? i}
              className={[
                "mock-card",
                landscape ? "landscape" : "portrait",
                i === 0 && preview ? "focused" : "",
                i === 0 && preview && grow ? "grows" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              style={{ width: cardW }}
              title={description ? `${title} — ${description}` : title}
            >
              <div
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
            </div>
          );
        })}
      </div>
      {showLabels ? (
        <div className="mock-focused-meta">
          <div className="mock-focused-title">{focusedTitle}</div>
          <div className="mock-focused-facts">
            <span className="mock-focused-match">94%</span>
            <span>{focusedFacts}</span>
          </div>
          <div className="mock-focused-desc">{focusedDesc}</div>
        </div>
      ) : null}
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

function PersonIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="8" r="3.2" />
      <path d="M5.5 19.2c1.4-3.2 3.7-4.7 6.5-4.7s5.1 1.5 6.5 4.7" strokeLinecap="round" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="11" cy="11" r="6.2" />
      <path d="M16.2 16.2 20 20" strokeLinecap="round" />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="12" r="3" />
      <path
        strokeLinecap="round"
        d="M12 3.6v1.8M12 18.6v1.8M4.9 7.1l1.3 1.3M17.8 15.6l1.3 1.3M3.6 12h1.8M18.6 12h1.8M4.9 16.9l1.3-1.3M17.8 8.4l1.3-1.3"
      />
    </svg>
  );
}
