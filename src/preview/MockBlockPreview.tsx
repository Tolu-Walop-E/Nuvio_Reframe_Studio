import type { CSSProperties } from "react";
import type { ViewBlock } from "../types/viewPack";

const POSTER_HUES = [12, 28, 200, 260, 320, 160, 45, 185, 5, 95];
const GENRES = ["Action", "Anime", "Comedy", "Drama", "Sci‑Fi", "Thriller", "Horror", "Romance"];
const NAV = ["Home", "Movies", "Shows", "Collections"];

function posterStyle(index: number, landscape = false): CSSProperties {
  const hue = POSTER_HUES[index % POSTER_HUES.length];
  return {
    background: `
      linear-gradient(160deg, hsla(${hue}, 70%, 48%, 0.95), hsla(${(hue + 40) % 360}, 55%, 22%, 0.98)),
      radial-gradient(circle at 30% 20%, hsla(${hue}, 90%, 70%, 0.35), transparent 50%)
    `,
    width: landscape ? 210 : 118,
    height: landscape ? 118 : 178,
  };
}

type Props = {
  block: ViewBlock;
  preview: boolean;
};

export function MockBlockPreview({ block, preview }: Props) {
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
    return (
      <div className={`mock mock-hero${preview ? " rich" : ""}`}>
        <div className="mock-hero-art" />
        <div className="mock-hero-scrim" />
        <div className="mock-hero-copy">
          <p className="eyebrow">{block.label || "Featured"}</p>
          <h3>{heroTitle(block.dataSource)}</h3>
          <p className="synopsis">
            Mock preview · points at <code>{block.dataSource}</code>
            {block.trailer ? " · trailer-ready" : ""}
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
    return (
      <div className={`mock mock-rail${preview ? " rich" : ""}`}>
        <div className="mock-rail-title">{block.label || "Genres"}</div>
        <div className="mock-row">
          {GENRES.map((g) => (
            <div key={g} className="mock-chip">
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

  const landscape = block.type === "collectionRail" || block.dataSource === "continueWatching";
  const count = landscape ? 7 : 10;
  return (
    <div className={`mock mock-rail${preview ? " rich" : ""}`}>
      <div className="mock-rail-title">{block.label || block.type}</div>
      <div className="mock-row">
        {Array.from({ length: count }, (_, i) => (
          <div
            key={i}
            className={`mock-poster${landscape ? " landscape" : ""}${i === 0 && preview ? " focused" : ""}`}
            style={posterStyle(i + hash(block.id), landscape)}
          >
            {landscape && block.dataSource === "continueWatching" && (
              <div className="mock-progress">
                <i style={{ width: `${35 + ((i * 17) % 50)}%` }} />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function heroTitle(source: string): string {
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
