import { rpc } from "./client";
import { parseScreenPacks } from "./screenPacks";
import type { NuvioConfig, NuvioSession } from "./types";
import type { ViewPack } from "../types/viewPack";

type PullRow = {
  profile_id?: number;
  pack_json?: unknown;
  updated_at?: string;
};

/**
 * Pull the account's active view pack from Supabase (`sync_pull_view_pack`).
 * Same blob Studio pushes via Send to TV / the TV accepts.
 */
export async function pullViewPackFromAccount(
  config: NuvioConfig,
  session: NuvioSession,
  profileId: number,
): Promise<{
  pack: ViewPack;
  movies: ViewPack | null;
  shows: ViewPack | null;
  updatedAt?: string;
  profileId: number;
} | null> {
  const rows = await rpc<PullRow[]>(config, session, "sync_pull_view_pack", {
    p_profile_id: profileId,
  });
  const row = Array.isArray(rows) ? rows[0] : null;
  if (!row?.pack_json || typeof row.pack_json !== "object") {
    return null;
  }
  const parsed = parseScreenPacks(row.pack_json);
  return {
    pack: parsed.home,
    movies: parsed.movies,
    shows: parsed.shows,
    updatedAt: typeof row.updated_at === "string" ? row.updated_at : undefined,
    profileId: typeof row.profile_id === "number" ? row.profile_id : profileId,
  };
}
