import { describe, expect, it } from "vitest";
import { RoutePath } from "./RoutePath.js";
import { RouteFollower } from "./RouteFollower.js";

const line = () => new RoutePath(
    [{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 100, y: 0 }],
    [{ name: "A", index: 0 }, { name: "B", index: 1 }, { name: "C", index: 2 }]);

describe("RouteFollower", () => {
    it("advances by speed * worldScale * dt and faces along the path (+x => yaw 0)", () => {
        const f = new RouteFollower(line());
        const pose = f.update(1, 2, 1.0936);
        expect(f.s).toBeCloseTo(2.1872, 6);
        expect(pose.x).toBeCloseTo(2.1872, 6);
        expect(pose.y).toBeCloseTo(0, 6);
        expect(pose.yaw).toBeCloseTo(0, 6);
    });
    it("a path heading +y gives yaw pi/2", () => {
        const p = new RoutePath([{ x: 0, y: 0 }, { x: 0, y: 100 }], [{ name: "a", index: 0 }, { name: "b", index: 1 }]);
        expect(new RouteFollower(p).update(0.1, 1, 1).yaw).toBeCloseTo(Math.PI / 2, 6);
    });
    it("emits arrived for intermediate stops and finished at the last one, then holds", () => {
        const arrived: string[] = [];
        let finished = 0;
        const f = new RouteFollower(line(), {}, { arrived: (s) => arrived.push(s.name), finished: () => finished++ });
        for (let i = 0; i < 30; i++) f.update(1, 5, 1); // 150 units requested
        expect(arrived).toEqual(["B", "C"]);
        expect(finished).toBe(1);
        expect(f.finished).toBe(true);
        expect(f.s).toBe(100);
        f.update(1, 5, 1);
        expect(f.s).toBe(100);
        expect(finished).toBe(1);
    });
    it("reports the next stop and distance to it", () => {
        const f = new RouteFollower(line());
        f.update(1, 10, 1);
        expect(f.nextStopIndex).toBe(1);
        expect(f.distanceToNextStop()).toBeCloseTo(40, 6);
    });
    it("loops when asked: after the end it wraps and stops fire again", () => {
        const arrived: string[] = [];
        const f = new RouteFollower(line(), { loop: true }, { arrived: (s) => arrived.push(s.name) });
        for (let i = 0; i < 30; i++) f.update(1, 5, 1); // 150 units
        expect(f.finished).toBe(false);
        expect(f.s).toBeCloseTo(50, 6);
        expect(arrived).toEqual(["B", "C", "B"]);
    });
    it("defaults to an 8 u look-ahead: heading already aims past a turn at s = 5", () => {
        // corner at s = 5; smoothing off since this test is about look-ahead distance, not smoothing
        const turn = new RoutePath([{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 5, y: 50 }], [{ name: "a", index: 0 }, { name: "b", index: 2 }], 0.5, false);
        const yaw = new RouteFollower(turn).update(1 / 60, 0, 1).yaw; // s stays 0 (speed 0): target = tangent at min(L, 0 + 8)
        // with the old look-ahead of 3 the target would still sit on the first segment (~-8 deg);
        // at 8 it is already well into the +y segment.
        expect(yaw).toBeGreaterThan(Math.PI / 4);
    });
    it("slews yaw at most 45 deg/s toward the look-ahead tangent", () => {
        // right-angle turn at (50,0): heading +x then +y
        const p = new RoutePath([{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 50, y: 50 }], [{ name: "a", index: 0 }, { name: "b", index: 2 }]);
        const f = new RouteFollower(p, { lookAhead: 3 }); // geometry of this fixture (jump to s = 48) assumes lookAhead 3
        const y0 = f.update(1 / 60, 0, 1).yaw; // at s = 0 the heading initialises to ~+x
        f.s = 48; // jump to just before the corner: the look-ahead tangent is around the bend
        const y1 = f.update(1 / 60, 0, 1).yaw;
        expect(y1 - y0).toBeGreaterThan(0);   // turning toward +y
        expect(y1 - y0).toBeLessThanOrEqual((45 * Math.PI / 180) / 60 + 1e-9); // but no faster than 45 deg/s
    });
    it("wraps angle differences the short way", () => {
        // path heading -x then -x: yaw pi. Start heading set near -pi; must not spin the long way.
        const p = new RoutePath([{ x: 100, y: 0 }, { x: 0, y: 0 }], [{ name: "a", index: 0 }, { name: "b", index: 1 }]);
        const f = new RouteFollower(p);
        const y = f.update(1 / 60, 0, 1).yaw;
        expect(Math.abs(Math.abs(y) - Math.PI)).toBeLessThan(1e-6);
        f.update(1 / 60, 0, 1);
        expect(Math.abs(Math.abs(f.update(1 / 60, 0, 1).yaw) - Math.PI)).toBeLessThan(1e-6);
    });
    it("in loop mode the look-ahead wraps past the end so the heading turns toward the first segment", () => {
        const square = new RoutePath(
            [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }, { x: 0, y: 0 }],
            [{ name: "a", index: 0 }, { name: "b", index: 4 }]);
        // geometry of this fixture assumes lookAhead 3 (the comments below are in terms of it)
        const looped = new RouteFollower(square, { loop: true, maxYawRate: 1000, lookAhead: 3 });
        looped.s = square.lengthTotal - 1;
        const yawLoop = looped.update(0.001, 0, 1).yaw;          // target = tangent at (L - 1 + 3) mod L = 2 → +x
        const straight = new RouteFollower(square, { loop: false, maxYawRate: 1000, lookAhead: 3 });
        straight.s = square.lengthTotal - 1;
        const yawEnd = straight.update(0.001, 0, 1).yaw;          // target = tangent at L → -y
        expect(Math.abs(yawLoop)).toBeLessThan(Math.PI / 4);
        expect(yawEnd).toBeCloseTo(-Math.PI / 2, 1);
    });
    it("closed loop: wraps at lengthTotal, walking the closing segment without a position teleport", () => {
        // A closed square (side 10): the last stop sits at waypointS[3], well before
        // lengthTotal (~36-44, per RoutePath.test.ts) — the gap is the closing segment back to
        // waypoint 0, which must be walked, not skipped by wrapping on the last stop.
        const square = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }];
        const stops = [{ name: "Start", index: 0 }, { name: "End", index: 3 }];
        const path = new RoutePath(square, stops, 0.5, false, { closed: true });
        const f = new RouteFollower(path, { loop: true });
        let prev = f.update(0, 0, 1); // dt = 0: establishes the initial pose without moving
        let maxStep = 0;
        let sawClosingSegment = false;
        const steps = Math.ceil((2 * path.lengthTotal) / 0.5) + 4; // just over two laps at 0.5 u/frame
        for (let i = 0; i < steps; i++) {
            const pose = f.update(1, 0.5, 1); // ds = 0.5 u per frame
            maxStep = Math.max(maxStep, Math.hypot(pose.x - prev.x, pose.y - prev.y));
            if (f.s > path.waypointS[3] && f.s < path.lengthTotal) sawClosingSegment = true;
            prev = pose;
        }
        expect(maxStep).toBeLessThan(1.5); // no teleport across the seam
        expect(sawClosingSegment).toBe(true); // s actually walks the closing segment, not just wraps past it
    });
    it("nextStopIndex is undefined (not a stale index) in the closing-segment gap, and 1 again after the wrap", () => {
        // Same closed square as the teleport test above: the last stop ("End") sits at
        // waypointS[3], strictly before lengthTotal (the closing segment back to waypoint 0 is
        // real distance still to walk) — the gap between them is exactly where nextStop would
        // transiently equal stops.length if it were not clamped (final review folded minor:
        // this used to make distanceToNextStop() return NaN instead of undefined).
        const square = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }];
        const stops = [{ name: "Start", index: 0 }, { name: "End", index: 3 }];
        const path = new RoutePath(square, stops, 0.5, false, { closed: true });
        const f = new RouteFollower(path, { loop: true });
        const lastStopS = path.stopS[path.stopS.length - 1];
        expect(lastStopS).toBeLessThan(path.lengthTotal); // the gap actually exists on this fixture

        // Walk in small steps until s is strictly inside the gap (past the last stop's arrival,
        // short of the wrap).
        let sawGap = false;
        while (f.s <= lastStopS + 1e-9 || f.s >= path.lengthTotal - 1e-9) {
            f.update(1, 0.5, 1);
            if (f.s > lastStopS + 1e-9 && f.s < path.lengthTotal - 1e-9) {
                sawGap = true;
                expect(f.nextStopIndex).toBeUndefined();
                expect(f.distanceToNextStop()).toBeUndefined();
                break;
            }
        }
        expect(sawGap).toBe(true);

        // Keep walking through the wrap: nextStopIndex becomes 1 again ("End" of the next lap).
        let wrapped = false;
        for (let i = 0; i < 50 && !wrapped; i++) {
            f.update(1, 0.5, 1);
            if (f.s < lastStopS) wrapped = true;
        }
        expect(wrapped).toBe(true);
        expect(f.nextStopIndex).toBe(1);
    });
    it("closed loop: stops fire once per lap, in order, and stop 0 never fires", () => {
        const wps = [{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }];
        const stops = [{ name: "Start", index: 0 }, { name: "Mid", index: 1 }, { name: "End", index: 4 }];
        const path = new RoutePath(wps, stops, 0.5, false, { closed: true });
        const arrived: string[] = [];
        const f = new RouteFollower(path, { loop: true }, { arrived: (s) => arrived.push(s.name) });
        const steps = Math.ceil((2.5 * path.lengthTotal) / 0.5); // just over two laps, short of a third
        for (let i = 0; i < steps; i++) f.update(1, 0.5, 1);
        expect(arrived.slice(0, 4)).toEqual(["Mid", "End", "Mid", "End"]);
        expect(arrived).not.toContain("Start");
    });
    it("slews across the ±π seam the short way", () => {
        // path heading -x (yaw π) then bending slightly to -y: heading target just below -π+ε, current +π-ε
        const p = new RoutePath([{ x: 0, y: 0 }, { x: -100, y: 0 }, { x: -200, y: -20 }], [{ name: "a", index: 0 }, { name: "b", index: 2 }]);
        const f = new RouteFollower(p, { maxYawRate: 10 * Math.PI / 180 });
        f.update(0.001, 0, 1);                                    // heading initialised to ~π (facing -x)
        f.s = 120;                                                // now the look-ahead target is past -π (facing slightly -y)
        const before = f.update(0.001, 0, 1).yaw;
        const after = f.update(0.5, 0, 1).yaw;                    // 5 degrees of slew allowed
        const delta = ((after - before + 3 * Math.PI) % (2 * Math.PI)) - Math.PI;
        expect(Math.abs(delta)).toBeLessThan(6 * Math.PI / 180);  // moved ≤ 5°, not a 350° swing
        expect(Math.abs(after)).toBeGreaterThan(Math.PI - 0.2);   // and still around the seam
        expect(after).toBeLessThan(0); // crossed the seam onto the negative branch
    });
});
