import { isElectron } from "../env";

const POPOUT_SEARCH_KEY = "popout";

/**
 * A window opened from the app to hold one view on its own: it has no sidebar and keeps that
 * for its lifetime, so in-app navigation never has to carry the flag along.
 */
export const isPopoutWindow: boolean =
  typeof window !== "undefined" &&
  new URLSearchParams(window.location.search).get(POPOUT_SEARCH_KEY) === "1";

/** `path` is a router path; Electron routes through the hash, the browser through the path. */
export function popoutWindowHref(path: string, current: URL, hashRouting: boolean): string {
  const url = hashRouting ? new URL(current.href) : new URL(path, current.origin);
  url.searchParams.set(POPOUT_SEARCH_KEY, "1");
  if (hashRouting) url.hash = path;
  return url.href;
}

/** Opens `path` in a new window; Electron turns the same call into a second app window. */
export function openPopoutWindow(path: string): void {
  window.open(
    popoutWindowHref(path, new URL(window.location.href), isElectron),
    "_blank",
    "popup=yes,width=1180,height=820,noopener",
  );
}
