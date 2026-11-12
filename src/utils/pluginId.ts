export const PLUGIN_NAMESPACE = "com.sgi.bestiary";

export function getPluginId(subpath: string): string {
  return `${PLUGIN_NAMESPACE}/${subpath}`;
}

export const METADATA_KEYS = {
  TOKEN: getPluginId("token"),
  SCENE_SETTINGS: getPluginId("scene-settings"),
  ROOM_SETTINGS: getPluginId("room-settings"),
  INITIATIVE_STATE: getPluginId("initiative"),
  COMBAT_STATE: getPluginId("combat-state"),
} as const;

export const BROADCAST_CHANNELS = {
  DICE_ROLL: getPluginId("dice-roll"),
  PLAYER_EDIT: getPluginId("player-edit"),
  SYNC_PING: getPluginId("sync-ping"),
} as const;

export const LOCAL_ITEM_PREFIX = `${PLUGIN_NAMESPACE}.hud.`;
