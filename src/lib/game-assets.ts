export const GAME_ASSET_HOST = "assets.playnccdn.com";
export const GAME_ASSET_PATH_PREFIX = "/static-aion2-gamedata/resources/";

const ICON_FILE_NAME = /^[A-Za-z0-9_-]{1,120}\.png$/;

export function iconPathFromUrl(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }

  if (parsed.protocol !== "https:" || parsed.hostname !== GAME_ASSET_HOST) return null;
  if (parsed.search || parsed.hash || parsed.username || parsed.password || parsed.port) return null;
  if (!parsed.pathname.startsWith(GAME_ASSET_PATH_PREFIX)) return null;

  const fileName = parsed.pathname.slice(GAME_ASSET_PATH_PREFIX.length);
  return ICON_FILE_NAME.test(fileName) ? fileName : null;
}

export function iconUrl(iconPath: string): string {
  return `https://${GAME_ASSET_HOST}${GAME_ASSET_PATH_PREFIX}${iconPath}`;
}
