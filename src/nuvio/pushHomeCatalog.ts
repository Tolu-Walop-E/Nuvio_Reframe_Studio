import { rpc } from "./client";
import { getStudioSyncClientId } from "./syncClientId";
import type { SyncHomeCatalogPayload } from "./homePack";
import type { NuvioConfig, NuvioSession } from "./types";

const PLATFORM = "home_catalog_shared";

/** Push home catalog settings (including genre targets) for the active profile. */
export async function pushHomeCatalogSettings(
  config: NuvioConfig,
  session: NuvioSession,
  profileId: number,
  payload: SyncHomeCatalogPayload,
): Promise<void> {
  await rpc(config, session, "sync_push_home_catalog_settings", {
    p_profile_id: profileId,
    p_settings_json: payload,
    p_platform: PLATFORM,
    p_origin_client_id: getStudioSyncClientId(),
  });
}
