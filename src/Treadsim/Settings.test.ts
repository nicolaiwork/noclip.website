import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, loadSettings, saveSettings } from "./Settings.js";

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
});
