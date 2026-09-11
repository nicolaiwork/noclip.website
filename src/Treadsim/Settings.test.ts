import { describe, expect, it } from "vitest";
import { clampWorldScale, DEFAULT_SETTINGS, loadSettings, saveSettings, WORLD_SCALE_RANGE } from "./Settings.js";

function memStorage(initial: Record<string, string> = {}) {
    const m = new Map(Object.entries(initial));
    return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); }, dump: () => Object.fromEntries(m) };
}

describe("Settings", () => {
    it("defaults to one yard per game unit (worldScale 1.0936), no loop", () => {
        expect(loadSettings(memStorage())).toEqual(DEFAULT_SETTINGS);
        expect(DEFAULT_SETTINGS.worldScale).toBeCloseTo(1.0936, 4);
    });
    it("round-trips and ignores garbage", () => {
        const s = memStorage();
        saveSettings(s, { worldScale: 1, loop: true, lastRouteId: "r" });
        expect(loadSettings(s)).toEqual({ worldScale: 1, loop: true, lastRouteId: "r" });
        expect(loadSettings(memStorage({ "treadsim.settings": "{not json" }))).toEqual(DEFAULT_SETTINGS);
        expect(loadSettings(memStorage({ "treadsim.settings": JSON.stringify({ worldScale: -3, loop: "yes" }) }))).toEqual(DEFAULT_SETTINGS);
    });
    it("shares one worldScale range between storage validation and the UI clamp", () => {
        expect(WORLD_SCALE_RANGE).toEqual({ min: 0.5, max: 2 });
        expect(clampWorldScale(5)).toBe(2); expect(clampWorldScale(0.1)).toBe(0.5); expect(clampWorldScale(NaN)).toBeCloseTo(1.0936, 4);
        expect(loadSettings(memStorage({ "treadsim.settings": JSON.stringify({ worldScale: 5, loop: false }) }))).toEqual(DEFAULT_SETTINGS);
    });
});
