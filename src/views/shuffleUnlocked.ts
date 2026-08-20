import {
  layoutBlocks,
  type ViewBlock,
  type ViewPack,
  withComputedCanvas,
} from "../types/viewPack";

export const MIN_ROTATE_INTERVAL_HOURS = 12;

export type ShuffleResult = {
  pack: ViewPack;
  didShuffle: boolean;
  seed: string;
};

/** Deterministic PRNG from a string seed (mulberry32). */
export function hashSeed(seed: string): () => number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  let t = h >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function defaultLocked(block: ViewBlock): boolean {
  if (block.locked === true) return true;
  if (block.locked === false) return false;
  // Chrome that shouldn't wander unless explicitly unlocked.
  return (
    block.type === "topNav" ||
    block.type === "hero" ||
    block.dataSource === "continueWatching"
  );
}

function fisherYates<T>(items: T[], rand: () => number): T[] {
  const next = [...items];
  for (let i = next.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const tmp = next[i];
    next[i] = next[j];
    next[j] = tmp;
  }
  return next;
}

/**
 * Lock-slot shuffle: sort by Y into slots; locked blocks keep their slot indices;
 * unlocked blocks permute into the remaining slots; restack Y from slot heights.
 */
export function shuffleUnlockedBlocks(
  blocks: ViewBlock[],
  seed: string,
): ViewBlock[] {
  if (blocks.length === 0) return [];
  const ordered = [...blocks].sort(
    (a, b) => a.y - b.y || a.x - b.x || a.id.localeCompare(b.id),
  );
  const lockedFlags = ordered.map(defaultLocked);
  const unlocked = ordered.filter((_, i) => !lockedFlags[i]);
  if (unlocked.length <= 1) return layoutBlocks(blocks);

  const shuffledUnlocked = fisherYates(unlocked, hashSeed(seed));
  let u = 0;
  const bySlot = ordered.map((block, i) =>
    lockedFlags[i] ? block : shuffledUnlocked[u++],
  );

  // Re-apply geometry from original slots so size/position slots stay fixed.
  const remapped = bySlot.map((block, i) => ({
    ...block,
    x: ordered[i].x,
    y: ordered[i].y,
    w: ordered[i].w,
    h: ordered[i].h,
  }));

  // Preserve original array identity order (by id) isn't required; consumers
  // usually sort by Y. Return restacked list.
  return layoutBlocks(remapped);
}

export function normalizeRotateIntervalHours(value: unknown): number {
  const n = typeof value === "number" && Number.isFinite(value) ? value : MIN_ROTATE_INTERVAL_HOURS;
  return Math.max(MIN_ROTATE_INTERVAL_HOURS, Math.round(n));
}

export function newShuffleSeed(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Apply rotation if enabled and the interval has elapsed (or force=true).
 * Persists `lastShuffleAt` + `shuffleSeed` on the pack.
 */
export function applyUnlockedRotation(
  pack: ViewPack,
  nowMs: number = Date.now(),
  opts?: { force?: boolean },
): ShuffleResult {
  if (!pack.rotateUnlocked) {
    return { pack, didShuffle: false, seed: pack.shuffleSeed ?? "" };
  }

  const intervalMs =
    normalizeRotateIntervalHours(pack.rotateIntervalHours) * 60 * 60 * 1000;
  const last = typeof pack.lastShuffleAt === "number" ? pack.lastShuffleAt : 0;
  const due = opts?.force === true || last <= 0 || nowMs - last >= intervalMs;

  if (!due) {
    const seed = pack.shuffleSeed || newShuffleSeed();
    // Re-apply deterministic order from stored seed (stable across relaunch).
    const blocks = shuffleUnlockedBlocks(pack.blocks, seed);
    return {
      pack: withComputedCanvas({
        ...pack,
        blocks,
        shuffleSeed: seed,
        rotateIntervalHours: normalizeRotateIntervalHours(pack.rotateIntervalHours),
      }),
      didShuffle: false,
      seed,
    };
  }

  const seed = newShuffleSeed();
  const blocks = shuffleUnlockedBlocks(pack.blocks, seed);
  const next = withComputedCanvas({
    ...pack,
    blocks,
    shuffleSeed: seed,
    lastShuffleAt: nowMs,
    rotateIntervalHours: normalizeRotateIntervalHours(pack.rotateIntervalHours),
  });
  return { pack: next, didShuffle: true, seed };
}
