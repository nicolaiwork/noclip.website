export interface Settings { worldScale: number; loop: boolean; lastRouteId: string | null }

/** 1 game unit = 1 yard, so 1.0936 game units per treadmill metre keeps HUD distance honest. */
export const DEFAULT_SETTINGS: Settings = { worldScale: 1.0936, loop: false, lastRouteId: null };
const KEY = "treadsim.settings";

export function loadSettings(storage: Pick<Storage, "getItem">): Settings {
    try {
        const raw = storage.getItem(KEY);
        if (!raw) return { ...DEFAULT_SETTINGS };
        const o = JSON.parse(raw);
        const worldScale = typeof o.worldScale === "number" && o.worldScale > 0.1 && o.worldScale < 10 ? o.worldScale : null;
        const loop = typeof o.loop === "boolean" ? o.loop : null;
        if (worldScale === null || loop === null) return { ...DEFAULT_SETTINGS };
        return { worldScale, loop, lastRouteId: typeof o.lastRouteId === "string" ? o.lastRouteId : null };
    } catch { return { ...DEFAULT_SETTINGS }; }
}

export function saveSettings(storage: Pick<Storage, "setItem">, s: Settings): void {
    try { storage.setItem(KEY, JSON.stringify(s)); } catch { /* private mode: ignore */ }
}
