export interface Settings { worldScale: number; loop: boolean; lastRouteId: string | null; sound: boolean; musicVolume: number; ambienceVolume: number }

/** 1 game unit = 1 yard, so 1.0936 game units per treadmill metre keeps HUD distance honest. Sound is off by default (spec §7). */
export const DEFAULT_SETTINGS: Settings = { worldScale: 1.0936, loop: false, lastRouteId: null, sound: false, musicVolume: 0.6, ambienceVolume: 0.6 };
const KEY = "treadsim.settings";

export const WORLD_SCALE_RANGE = { min: 0.5, max: 2 } as const;
export function clampWorldScale(v: number): number {
    if (!Number.isFinite(v)) return DEFAULT_SETTINGS.worldScale;
    return Math.max(WORLD_SCALE_RANGE.min, Math.min(WORLD_SCALE_RANGE.max, v));
}
export function clampVolume(v: number): number {
    if (!Number.isFinite(v)) return DEFAULT_SETTINGS.musicVolume;
    return Math.max(0, Math.min(1, v));
}

/** Field-by-field: a bad field falls back to its default, a number out of range is clamped; the rest survive. */
export function loadSettings(storage: Pick<Storage, "getItem">): Settings {
    try {
        const raw = storage.getItem(KEY);
        if (!raw) return { ...DEFAULT_SETTINGS };
        const o = JSON.parse(raw) as Record<string, unknown>;
        const num = (v: unknown, clamp: (n: number) => number, d: number) => typeof v === "number" ? clamp(v) : d;
        const bool = (v: unknown, d: boolean) => typeof v === "boolean" ? v : d;
        return {
            worldScale: num(o.worldScale, clampWorldScale, DEFAULT_SETTINGS.worldScale),
            loop: bool(o.loop, DEFAULT_SETTINGS.loop),
            lastRouteId: typeof o.lastRouteId === "string" ? o.lastRouteId : null,
            sound: bool(o.sound, DEFAULT_SETTINGS.sound),
            musicVolume: num(o.musicVolume, clampVolume, DEFAULT_SETTINGS.musicVolume),
            ambienceVolume: num(o.ambienceVolume, clampVolume, DEFAULT_SETTINGS.ambienceVolume),
        };
    } catch { return { ...DEFAULT_SETTINGS }; }
}

export function saveSettings(storage: Pick<Storage, "setItem">, s: Settings): void {
    try { storage.setItem(KEY, JSON.stringify(s)); } catch { /* private mode: ignore */ }
}
