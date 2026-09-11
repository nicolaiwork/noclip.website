import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { DEFAULT_SMOOTHING, lateralOffsets, smoothWaypoints } from "./RouteSmoothing.js";
import { parseRouteFile } from "./RouteFile.js";

// alternating jitter y = ±1 along x = 8*i, 12 points (period-two click jitter)
const jittered = (n = 12, gap = 8) => Array.from({ length: n }, (_, i) => ({ x: i * gap, y: i % 2 === 0 ? 1 : -1 }));
const ends = (n: number) => [{ name: "A", index: 0 }, { name: "B", index: n - 1 }];

describe("smoothWaypoints", () => {
    it("removes period-two jitter within one pass and keeps x unchanged", () => {
        const wps = jittered();
        const smoothed = smoothWaypoints(wps, ends(wps.length));
        // pass 1 (Jacobi from the alternating original) collapses every interior point to
        // exactly 0; pass 2 then pulls the two points next to a fixed endpoint slightly back
        // toward it (its neighbour average is no longer 0 on that side) -- bounded, not a
        // reintroduction of the original ±1 jitter.
        for (let i = 2; i < wps.length - 2; i++) expect(Math.abs(smoothed[i].y)).toBeLessThan(0.15);
        expect(Math.abs(smoothed[1].y)).toBeLessThan(0.3);
        expect(Math.abs(smoothed[wps.length - 2].y)).toBeLessThan(0.3);
        for (let i = 1; i < wps.length - 1; i++) expect(smoothed[i].x).toBeCloseTo(wps[i].x, 9);
        expect(smoothed[0]).toEqual(wps[0]);
        expect(smoothed[wps.length - 1]).toEqual(wps[wps.length - 1]);
    });

    it("never moves a declared stop", () => {
        const wps = jittered();
        const stopIndex = 5;
        const stops = [...ends(wps.length), { name: "Stop", index: stopIndex }].sort((a, b) => a.index - b.index);
        const smoothed = smoothWaypoints(wps, stops);
        expect(smoothed[stopIndex]).toEqual(wps[stopIndex]);
    });

    it("clamps a 90-degree corner's displacement to maxShift", () => {
        const corner = [
            ...Array.from({ length: 10 }, (_, i) => ({ x: i * 8, y: 0 })),
            ...Array.from({ length: 10 }, (_, i) => ({ x: 72, y: (i + 1) * 8 })),
        ];
        const smoothed = smoothWaypoints(corner, ends(corner.length));
        const cornerIndex = 9;
        const d = Math.hypot(smoothed[cornerIndex].x - corner[cornerIndex].x, smoothed[cornerIndex].y - corner[cornerIndex].y);
        expect(d).toBeLessThanOrEqual(DEFAULT_SMOOTHING.maxShift + 1e-9);
        const dNeighbour = Math.hypot(smoothed[cornerIndex - 1].x - corner[cornerIndex - 1].x, smoothed[cornerIndex - 1].y - corner[cornerIndex - 1].y);
        expect(dNeighbour).toBeLessThan(d);
    });

    it("passes: 0 returns copies unchanged and does not mutate the input", () => {
        const wps = jittered();
        const smoothed = smoothWaypoints(wps, ends(wps.length), { passes: 0 });
        expect(smoothed).toEqual(wps);
        expect(smoothed[3]).not.toBe(wps[3]);
        expect(wps[3]).toEqual({ x: 24, y: -1 }); // input untouched
    });

    it("keeps a realistic route's spacing rule and reduces median lateral offset", () => {
        const dir = fileURLToPath(new URL("../../../routes/", import.meta.url));
        const route = parseRouteFile(JSON.parse(readFileSync(dir + "goldshire-to-eastvale.json", "utf8")));
        const before = lateralOffsets(route.waypoints);
        const beforeMedian = [...before].sort((a, b) => a - b)[Math.floor(before.length / 2)];
        expect(beforeMedian).toBeGreaterThan(0.4);
        const smoothed = smoothWaypoints(route.waypoints, route.stops);
        for (let i = 1; i < smoothed.length; i++) {
            expect(Math.hypot(smoothed[i].x - smoothed[i - 1].x, smoothed[i].y - smoothed[i - 1].y)).toBeGreaterThanOrEqual(1 - 1e-9);
        }
        const after = lateralOffsets(smoothed);
        const afterMedian = [...after].sort((a, b) => a - b)[Math.floor(after.length / 2)];
        expect(afterMedian).toBeLessThan(0.2);
    });
});

describe("lateralOffsets", () => {
    it("is empty for fewer than three points", () => {
        expect(lateralOffsets([])).toEqual([]);
        expect(lateralOffsets([{ x: 0, y: 0 }])).toEqual([]);
        expect(lateralOffsets([{ x: 0, y: 0 }, { x: 1, y: 0 }])).toEqual([]);
    });

    it("is zero on a straight line and twice the amplitude on the alternating jitter fixture", () => {
        const straight = Array.from({ length: 10 }, (_, i) => ({ x: i * 8, y: 0 }));
        expect(lateralOffsets(straight).every((o) => o < 1e-9)).toBe(true);
        const wps = jittered(); // y = ±1: each point's neighbours sit 1 on the other side, so offset from the chord is 2
        const offsets = lateralOffsets(wps);
        expect(offsets.length).toBe(wps.length - 2);
        for (const o of offsets) expect(o).toBeCloseTo(2, 6);
    });
});
