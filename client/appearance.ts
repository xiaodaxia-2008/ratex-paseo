import { useSyncExternalStore } from "react";
import { APP_SETTINGS_KEY, storedTextSizes, type AppearanceTextSizes } from "../shared/layout";

/**
 * Paseo's plugin theme carries colors only, so the Appearance text sizes come from the app
 * settings Paseo's web and desktop clients keep in localStorage. Native clients store them in
 * AsyncStorage, which plugin code cannot reach; they keep Paseo's default sizes.
 *
 * Paseo writes the setting in this same window, which fires no `storage` event, so changes are
 * picked up on every render (an Appearance change re-renders plugin views through the theme),
 * on `storage` events from other windows, and by a light poll while a message is mounted.
 */
const POLL_MS = 1000;

type BrowserGlobals = {
  localStorage?: { getItem(key: string): string | null };
  addEventListener?(type: "storage", listener: () => void): void;
  removeEventListener?(type: "storage", listener: () => void): void;
};
const browser = globalThis as BrowserGlobals;

function readStored(): string | null {
  try {
    return browser.localStorage?.getItem(APP_SETTINGS_KEY) ?? null;
  } catch {
    return null;
  }
}

let lastJson: string | null | undefined;
let lastSizes: AppearanceTextSizes | null = null;

function snapshot(): AppearanceTextSizes | null {
  const json = readStored();
  if (json !== lastJson) {
    lastJson = json;
    const next = storedTextSizes(json);
    // Keep the previous object when the sizes are unchanged, so styles stay memoized.
    if (next?.content !== lastSizes?.content || next?.code !== lastSizes?.code) lastSizes = next;
  }
  return lastSizes;
}

const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | undefined;

function check() {
  const before = lastSizes;
  if (snapshot() !== before) for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (listeners.size === 1) {
    browser.addEventListener?.("storage", check);
    timer = setInterval(check, POLL_MS);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      browser.removeEventListener?.("storage", check);
      clearInterval(timer);
      timer = undefined;
    }
  };
}

const noSizes = () => null;
const noSubscription = () => () => {};

/** Paseo's Appearance content and code text sizes on web, or null for the platform defaults. */
export function useAppearanceTextSizes(platform: string): AppearanceTextSizes | null {
  const web = platform === "web";
  return useSyncExternalStore(
    web ? subscribe : noSubscription,
    web ? snapshot : noSizes,
    web ? snapshot : noSizes,
  );
}
