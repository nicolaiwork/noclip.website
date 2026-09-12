import { describe, expect, it } from "vitest";
import { clampVolume, clampWorldScale, DEFAULT_SETTINGS, loadSettings, saveSettings, WORLD_SCALE_RANGE } from "./Settings.js";

function memStorage(initial: Record<string, string> = {}) {
    const m = new Map(Object.entries(initial));
    return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); } };
}
const stored = (o: unknown) => memStorage({ "treadsim.settings": JSON.stringify(o) });

describe("Settings", () => {
    it("defaults: one yard per game unit, no loop, sound off at 60 % volumes", () => {
        expect(loadSettings(memStorage())).toEqual(DEFAULT_SETTINGS);
        expect(DEFAULT_SETTINGS).toEqual({ worldScale: expect.closeTo(1.0936, 4), loop: false, lastRouteId: null, sound: false, musicVolume: 0.6, ambienceVolume: 0.6 });
    });
    it("round-trips", () => {
        const s = memStorage();
        const v = { worldScale: 1, loop: true, lastRouteId: "r", sound: true, musicVolume: 0.25, ambienceVolume: 1 };
        saveSettings(s, v);
        expect(loadSettings(s)).toEqual(v);
    });
    it("validates field by field: garbage fields fall back alone, out-of-range numbers clamp (Phase 4 review Minor 12)", () => {
        expect(loadSettings(memStorage({ "treadsim.settings": "{not json" }))).toEqual(DEFAULT_SETTINGS);
        expect(loadSettings(stored({ worldScale: 0.3, loop: true, lastRouteId: "keep-me" }))).toEqual({ ...DEFAULT_SETTINGS, worldScale: 0.5, loop: true, lastRouteId: "keep-me" });
        expect(loadSettings(stored({ worldScale: "x", loop: "yes", sound: 1, musicVolume: 7, ambienceVolume: -1 }))).toEqual({ ...DEFAULT_SETTINGS, musicVolume: 1, ambienceVolume: 0 });
    });
    it("shares one worldScale range between storage validation and the UI clamp", () => {
        expect(WORLD_SCALE_RANGE).toEqual({ min: 0.5, max: 2 });
        expect(clampWorldScale(5)).toBe(2); expect(clampWorldScale(0.1)).toBe(0.5); expect(clampWorldScale(NaN)).toBeCloseTo(1.0936, 4);
        expect(clampVolume(2)).toBe(1); expect(clampVolume(-1)).toBe(0); expect(clampVolume(NaN)).toBe(0.6);
    });
});
