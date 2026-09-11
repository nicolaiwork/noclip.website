import { describe, expect, it } from "vitest";
import { expandTiles, preloadTiles } from "./RoutePreloader.js";

describe("expandTiles", () => {
    it("adds a ring of neighbours, dedupes and clips to the 64x64 grid", () => {
        const out = expandTiles([[31, 49], [31, 48]], 1);
        expect(out.length).toBe(12); // 3x4 block
        expect(out).toContainEqual([30, 47]);
        expect(out).toContainEqual([32, 50]);
        expect(expandTiles([[0, 0]], 1)).toEqual([[0, 0], [0, 1], [1, 0], [1, 1]]);
    });
});

describe("preloadTiles", () => {
    function fakeWorld(loaded: [number, number][] = []) {
        const requested: [number, number][] = [];
        const w = {
            loading: false, adts: [] as any[],
            hasLoadedAdt: ([x, y]: [number, number]) => loaded.some(([a, b]) => a === x && b === y),
            ensureAdtLoaded: async (x: number, y: number) => { requested.push([x, y]); return x === 50 ? undefined : { x, y }; },
        };
        return { w, requested };
    }
    it("loads only tiles not yet loaded, in order, and reports progress", async () => {
        const { w, requested } = fakeWorld([[1, 1]]);
        const setup: any[] = [];
        const progress: [number, number][] = [];
        await preloadTiles([[1, 1], [1, 2]], w, { setupAdt: (a) => setup.push(a) }, (d, t) => progress.push([d, t]), 0);
        expect(requested).toEqual([[1, 2]]);
        expect(w.adts).toEqual([{ x: 1, y: 2 }]);
        expect(setup).toEqual([{ x: 1, y: 2 }]);
        expect(progress).toEqual([[0, 1], [1, 1]]);
    });
    it("holds world.loading during the preload and skips tiles that do not exist", async () => {
        const { w } = fakeWorld();
        let sawLoading = false;
        const scene = { setupAdt: () => { sawLoading = w.loading; } };
        await preloadTiles([[50, 5], [2, 2]], w, scene, () => {}, 0);
        expect(sawLoading).toBe(true);
        expect(w.loading).toBe(false);
        expect(w.adts).toEqual([{ x: 2, y: 2 }]);
    });
    it("waits for a competing streaming pass to finish before loading tiles", async () => {
        const requested: [number, number][] = [];
        let flippedAt = -1;
        let calls = 0;
        const w = {
            loading: true, adts: [] as any[],
            hasLoadedAdt: () => false,
            ensureAdtLoaded: async (x: number, y: number) => { requested.push([x, y]); calls++; return { x, y }; },
        };
        setTimeout(() => { flippedAt = calls; w.loading = false; }, 60);
        await preloadTiles([[3, 3]], w, { setupAdt: () => {} }, () => {}, 0);
        expect(requested).toEqual([[3, 3]]);
        // ensureAdtLoaded must only be called after loading flipped to false, i.e. calls was 0 at that point
        expect(flippedAt).toBe(0);
    });
    it("skips a tile that becomes loaded mid-loop and still reaches full progress", async () => {
        const loaded = new Set<string>();
        const progress: [number, number][] = [];
        const w = {
            loading: false, adts: [] as any[],
            hasLoadedAdt: ([x, y]: [number, number]) => loaded.has(`${x},${y}`),
            ensureAdtLoaded: async (x: number, y: number) => {
                if (x === 1 && y === 1) loaded.add("2,2"); // marks the second tile loaded elsewhere
                return { x, y };
            },
        };
        await preloadTiles([[1, 1], [2, 2]], w, { setupAdt: () => {} }, (d, t) => progress.push([d, t]), 0);
        expect(w.adts).toEqual([{ x: 1, y: 1 }]); // [2,2] skipped, not fetched again
        expect(progress[progress.length - 1]).toEqual([2, 2]);
    });
});
