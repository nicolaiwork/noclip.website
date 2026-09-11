import { describe, expect, it } from "vitest";
import { pointHeights, samplePreview } from "./RoutePreviewSamples.js";
import { RoutePath } from "./RoutePath.js";

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

describe("samplePreview with declared stops", () => {
    it("pins an interior stop so its own sample keeps the stop's exact position, unlike the unpinned default", () => {
        // alternating jitter: x = 8*i, y = ±1, 12 points; declared stop at index 5
        const jittered = Array.from({ length: 12 }, (_, i) => ({ x: i * 8, y: i % 2 === 0 ? 1 : -1 }));
        const stopIndex = 5;
        const stops = [{ name: "corner", index: stopIndex }];
        // arc length to the (pinned) stop, from the same construction samplePreview uses internally,
        // so a sample lands exactly on it when used as the spacing
        const probe = new RoutePath(jittered, [{ name: "a", index: 0 }, { name: "corner", index: stopIndex }, { name: "b", index: 11 }]);
        const sAtStop = probe.waypointS[stopIndex];
        const nearestTo40 = (samples: { x: number; y: number }[]) =>
            samples.reduce((best, s) => (Math.abs(s.x - 40) < Math.abs(best.x - 40) ? s : best));

        const pinned = samplePreview(jittered, () => 0, sAtStop, stops);
        expect(nearestTo40(pinned).y).toBeCloseTo(jittered[stopIndex].y, 6);

        const unpinned = samplePreview(jittered, () => 0, sAtStop);
        expect(Math.abs(nearestTo40(unpinned).y)).toBeLessThan(0.3);
    });
});

describe("pointHeights", () => {
    it("maps each point through heightAt", () => {
        expect(pointHeights([{ x: 0, y: 0 }, { x: 1, y: 0 }], (x) => (x === 0 ? 5 : undefined))).toEqual([5, undefined]);
    });
});
