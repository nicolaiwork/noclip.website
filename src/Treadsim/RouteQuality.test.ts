import { describe, expect, it } from "vitest";
import { RoutePath } from "./RoutePath.js";
import { gapIssues, headingSpikes, reportRoute, SPIKE_CEILING_DEG, SPIKE_THRESHOLD_DEG } from "./RouteQuality.js";

const straight = (n = 20, gap = 8) => Array.from({ length: n }, (_, i) => ({ x: i * gap, y: 0 }));
const ends = (n: number) => [{ name: "A", index: 0 }, { name: "B", index: n - 1 }];

// This suite exercises headingSpikes/gapIssues against known raw geometry, independent of the
// route-smoothing feature (covered separately in RouteSmoothing.test.ts and RoutePath.test.ts),
// so every RoutePath here is built with smoothing off.
describe("headingSpikes", () => {
    it("finds nothing on a straight line, a gentle arc, or a genuine 90-degree corner at 8 u spacing", () => {
        expect(headingSpikes(new RoutePath(straight(), ends(20), 0.5, false))).toEqual([]);
        const arc = Array.from({ length: 20 }, (_, i) => { const a = i * 8 / 50; return { x: 50 * Math.sin(a), y: 50 - 50 * Math.cos(a) }; });
        expect(headingSpikes(new RoutePath(arc, ends(20), 0.5, false))).toEqual([]);
        const corner = [...Array.from({ length: 10 }, (_, i) => ({ x: i * 8, y: 0 })), ...Array.from({ length: 10 }, (_, i) => ({ x: 72, y: (i + 1) * 8 }))];
        const cornerSpikes = headingSpikes(new RoutePath(corner, ends(20), 0.5, false));
        expect(cornerSpikes).toEqual([]);                                    // measured 35.7 deg/u < 45
        expect(headingSpikes(new RoutePath(corner, ends(20), 0.5, false), 30).length).toBe(1); // but it is a real corner
    });
    it("flags a sideways spike at the right waypoint, once, and marks it when it sits on a declared stop", () => {
        const wps = straight(); wps.splice(10, 0, { x: 76.8, y: 3.4 });    // 3.4 u off the line, 4.8 u after wp 9
        const spikes = headingSpikes(new RoutePath(wps, ends(21), 0.5, false));
        expect(spikes.length).toBe(1);
        expect(spikes[0].waypoint).toBe(10);
        expect(spikes[0].degPerUnit).toBeGreaterThan(SPIKE_THRESHOLD_DEG);
        expect(spikes[0].atStop).toBe(false);
        const stopped = headingSpikes(new RoutePath(wps, [{ name: "A", index: 0 }, { name: "Corner", index: 10 }, { name: "B", index: 20 }], 0.5, false));
        expect(stopped[0].atStop).toBe(true);
    });
    it("flushes a spike run that lasts to the end of the path", () => {
        // threshold 0: every sample on a curve is over threshold, so one run spans the whole arc and closes at EOF
        const arc = Array.from({ length: 20 }, (_, i) => { const a = i * 8 / 50; return { x: 50 * Math.sin(a), y: 50 - 50 * Math.cos(a) }; });
        const spikes = headingSpikes(new RoutePath(arc, ends(20), 0.5, false), 0);
        expect(spikes.length).toBe(1);
        expect(spikes[0].degPerUnit).toBeGreaterThan(0);
    });
    it("reports a spike above the hard ceiling even when it sits on a declared stop", () => {
        // a sharp near-reversal at the middle waypoint, declared a stop: a stop exempts the
        // 45 deg/u gate, but not the 120 deg/u ceiling (Minor 5).
        const wps = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 1 }];
        const stops = [{ name: "A", index: 0 }, { name: "Corner", index: 1 }, { name: "B", index: 2 }];
        const spikes = headingSpikes(new RoutePath(wps, stops, 0.5, false));
        const atCorner = spikes.filter((s) => s.waypoint === 1);
        expect(atCorner.length).toBeGreaterThan(0);
        expect(atCorner.some((s) => s.atStop && s.degPerUnit > SPIKE_CEILING_DEG)).toBe(true);
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
        expect(reportRoute([{ x: 0, y: 0 }], [])).toEqual({ spikes: [], gaps: [], jitter: { median: 0, p90: 0, max: 0 } });
        // reportRoute judges spikes on the smoothed path it would actually drive, so the
        // off-line waypoint needs to be both a declared stop (unaffected by smoothing) and a
        // large enough deviation (8 u, not the 3.4 u used before smoothing existed) that its
        // neighbours' softening still leaves a >45 deg/u corner, like a genuine road corner would.
        const wps = straight(); wps.splice(10, 0, { x: 76.8, y: 8 }); wps.push({ x: 200, y: 0 });
        const stops = [{ name: "A", index: 0 }, { name: "Corner", index: 10 }, { name: "B", index: wps.length - 1 }];
        const r = reportRoute(wps, stops);
        expect(r.spikes.map((s) => s.waypoint)).toEqual([10]);
        expect(r.gaps.map((g) => g.to)).toEqual([wps.length - 1]);
    });

    it("reports jitter from the raw waypoints: ~1 on the alternating fixture, 0 on a straight line", () => {
        // amplitude 0.5: each interior point's neighbours sit 0.5 on the other side of the
        // centreline, so the chord offset (the jitter metric) is 1.
        const jittered = Array.from({ length: 12 }, (_, i) => ({ x: i * 8, y: i === 0 || i === 11 ? 0 : (i % 2 === 0 ? 0.5 : -0.5) }));
        const r = reportRoute(jittered, ends(jittered.length));
        expect(r.jitter.median).toBeCloseTo(1, 6);
        const flat = reportRoute(straight(), ends(20));
        expect(flat.jitter).toEqual({ median: 0, p90: 0, max: 0 });
    });
});
