import { describe, expect, it } from "vitest";
import { pointHeights, samplePreview } from "./RoutePreviewSamples.js";

describe("samplePreview", () => {
    it("samples the spline every `spacing` units with terrain heights, undefined where no tile is loaded", () => {
        const heightAt = (x: number) => (x < 50 ? 10 : undefined);
        const s = samplePreview([{ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 80, y: 0 }], heightAt, 2);
        expect(s.length).toBe(41);
        expect(s[0]).toEqual({ x: 0, y: 0, z: 10 });
        expect(s[20].x).toBeCloseTo(40, 6);
        expect(s[40]).toEqual({ x: 80, y: 0, z: undefined });
    });
    it("returns the points themselves for fewer than two points", () => {
        expect(samplePreview([], () => 1)).toEqual([]);
        expect(samplePreview([{ x: 3, y: 4 }], () => 1)).toEqual([{ x: 3, y: 4, z: 1 }]);
    });
});

describe("pointHeights", () => {
    it("maps each point through heightAt", () => {
        expect(pointHeights([{ x: 0, y: 0 }, { x: 1, y: 0 }], (x) => (x === 0 ? 5 : undefined))).toEqual([5, undefined]);
    });
});
