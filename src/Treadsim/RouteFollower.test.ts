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
    it("slews yaw at most 45 deg/s toward the look-ahead tangent", () => {
        // right-angle turn at (50,0): heading +x then +y
        const p = new RoutePath([{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 50, y: 50 }], [{ name: "a", index: 0 }, { name: "b", index: 2 }]);
        const f = new RouteFollower(p, { lookAhead: 3 });
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
});
