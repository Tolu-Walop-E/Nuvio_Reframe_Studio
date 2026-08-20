import { rpc } from "./client";
import { getStudioSyncClientId } from "./syncClientId";
import type { NuvioConfig, NuvioSession } from "./types";
import type { ViewPack } from "../types/viewPack";
import { slugify, withComputedCanvas } from "../types/viewPack";

function packPayload(pack: ViewPack): ViewPack {
  return withComputedCanvas({
    ...pack,
    id: slugify(pack.name),
    schemaVersion: 1,
  });
}

/**
 * UPSERT the active view pack for this Nuvio profile (same account the TV syncs).
 * Requires migration `view_pack_blobs` + RPCs on the Supabase project.
 */
export async function pushViewPackToAccount(
  config: NuvioConfig,
  session: NuvioSession,
  pack: ViewPack,
  profileId: number,
): Promise<{ packName: string; profileId: number }> {
  const payload = packPayload(pack);
  await rpc(config, session, "sync_push_view_pack", {
    p_profile_id: profileId,
    p_pack_json: payload,
    p_origin_client_id: getStudioSyncClientId(),
  });
  return { packName: payload.name, profileId };
}
