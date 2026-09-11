import { describe, expect, it } from "vitest";
import { RoutePath } from "./RoutePath.js";
import { gapIssues, headingSpikes, reportRoute, SPIKE_THRESHOLD_DEG } from "./RouteQuality.js";

const straight = (n = 20, gap = 8) => Array.from({ length: n }, (_, i) => ({ x: i * gap, y: 0 }));
const ends = (n: number) => [{ name: "A", index: 0 }, { name: "B", index: n - 1 }];

describe("headingSpikes", () => {
    it("finds nothing on a straight line, a gentle arc, or a genuine 90-degree corner at 8 u spacing", () => {
        expect(headingSpikes(new RoutePath(straight(), ends(20)))).toEqual([]);
        const arc = Array.from({ length: 20 }, (_, i) => { const a = i * 8 / 50; return { x: 50 * Math.sin(a), y: 50 - 50 * Math.cos(a) }; });
        expect(headingSpikes(new RoutePath(arc, ends(20)))).toEqual([]);
        const corner = [...Array.from({ length: 10 }, (_, i) => ({ x: i * 8, y: 0 })), ...Array.from({ length: 10 }, (_, i) => ({ x: 72, y: (i + 1) * 8 }))];
        const cornerSpikes = headingSpikes(new RoutePath(corner, ends(20)));
        expect(cornerSpikes).toEqual([]);                                    // measured 35.7 deg/u < 45
        expect(headingSpikes(new RoutePath(corner, ends(20)), 30).length).toBe(1); // but it is a real corner
    });
    it("flags a sideways spike at the right waypoint, once, and marks it when it sits on a declared stop", () => {
        const wps = straight(); wps.splice(10, 0, { x: 76.8, y: 3.4 });    // 3.4 u off the line, 4.8 u after wp 9
        const spikes = headingSpikes(new RoutePath(wps, ends(21)));
        expect(spikes.length).toBe(1);
        expect(spikes[0].waypoint).toBe(10);
        expect(spikes[0].degPerUnit).toBeGreaterThan(SPIKE_THRESHOLD_DEG);
        expect(spikes[0].atStop).toBe(false);
        const stopped = headingSpikes(new RoutePath(wps, [{ name: "A", index: 0 }, { name: "Corner", index: 10 }, { name: "B", index: 20 }]));
        expect(stopped[0].atStop).toBe(true);
    });
    it("flushes a spike run that lasts to the end of the path", () => {
        // threshold 0: every sample on a curve is over threshold, so one run spans the whole arc and closes at EOF
        const arc = Array.from({ length: 20 }, (_, i) => { const a = i * 8 / 50; return { x: 50 * Math.sin(a), y: 50 - 50 * Math.cos(a) }; });
        const spikes = headingSpikes(new RoutePath(arc, ends(20)), 0);
        expect(spikes.length).toBe(1);
        expect(spikes[0].degPerUnit).toBeGreaterThan(0);
    });
});

describe("gapIssues", () => {
    it("reports gaps above maxGap and below minGap with the waypoint pair", () => {
        const wps = [{ x: 0, y: 0 }, { x: 8, y: 0 }, { x: 30, y: 0 }, { x: 30.5, y: 0 }];
        expect(gapIssues(wps)).toEqual([{ from: 1, to: 2, gap: 22 }, { from: 2, to: 3, gap: 0.5 }]);
        expect(gapIssues(straight())).toEqual([]);
    });
});

describe("reportRoute", () => {
    it("is empty for fewer than two waypoints and combines both scans otherwise", () => {
        expect(reportRoute([{ x: 0, y: 0 }], [])).toEqual({ spikes: [], gaps: [] });
        const wps = straight(); wps.splice(10, 0, { x: 76.8, y: 3.4 }); wps.push({ x: 200, y: 0 });
        const r = reportRoute(wps, ends(wps.length));
        expect(r.spikes.map((s) => s.waypoint)).toEqual([10]);
        expect(r.gaps.map((g) => g.to)).toEqual([wps.length - 1]);
    });
});
