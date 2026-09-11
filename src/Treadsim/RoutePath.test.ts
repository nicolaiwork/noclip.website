import { describe, expect, it } from "vitest";
import { RoutePath } from "./RoutePath.js";
import { TILE_SIZE } from "./AdtHeightField.js";

describe("RoutePath on a straight line", () => {
    const path = new RoutePath(
        [{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 100, y: 0 }],
        [{ name: "A", index: 0 }, { name: "B", index: 1 }, { name: "C", index: 2 }]);

    it("has the chord length as arc length and stops at the waypoint arc lengths", () => {
        expect(path.lengthTotal).toBeCloseTo(100, 6);
        expect(path.stopS[0]).toBe(0);
        expect(path.stopS[1]).toBeCloseTo(50, 6);
        expect(path.stopS[2]).toBeCloseTo(100, 6);
    });
    it("positionAt interpolates and clamps", () => {
        expect(path.positionAt(25.3)[0]).toBeCloseTo(25.3, 6);
        expect(path.positionAt(-5)[0]).toBe(0);
        expect(path.positionAt(500)[0]).toBeCloseTo(100, 6);
    });
    it("tangentAt is the unit direction of travel", () => {
        const [tx, ty] = path.tangentAt(10);
        expect(tx).toBeCloseTo(1, 6); expect(ty).toBeCloseTo(0, 6);
    });
    it("nextStopAfter returns the next stop strictly ahead", () => {
        expect(path.nextStopAfter(0)).toBe(1);
        expect(path.nextStopAfter(49.99)).toBe(1);
        expect(path.nextStopAfter(50)).toBe(2);
        expect(path.nextStopAfter(100)).toBeUndefined();
    });
});

describe("RoutePath on a quarter circle", () => {
    const R = 100;
    const wps = [0, 30, 60, 90].map((deg) => ({ x: R * Math.cos(deg * Math.PI / 180), y: R * Math.sin(deg * Math.PI / 180) }));
    const path = new RoutePath(wps, [{ name: "S", index: 0 }, { name: "E", index: 3 }]);

    it("is close to the true arc length and stays near the circle", () => {
        expect(path.lengthTotal).toBeGreaterThan(155);   // chords sum to 155.3
        expect(path.lengthTotal).toBeLessThan(158.5);    // true arc 157.08
        for (let s = 0; s <= path.lengthTotal; s += 1) {
            const [x, y] = path.positionAt(s);
            expect(Math.hypot(x, y)).toBeGreaterThan(R - 2.2);
            expect(Math.hypot(x, y)).toBeLessThan(R + 2);
        }
    });
    it("passes through every waypoint", () => {
        const [x, y] = path.positionAt(path.lengthTotal / 2);
        // the middle of the path lies between waypoints 1 and 2 on the circle
        expect(Math.atan2(y, x) * 180 / Math.PI).toBeGreaterThan(30);
        expect(Math.atan2(y, x) * 180 / Math.PI).toBeLessThan(60);
        const end = path.positionAt(path.lengthTotal);
        expect(end[0]).toBeCloseTo(0, 5); expect(end[1]).toBeCloseTo(R, 5);
    });
    it("starts heading roughly along +y (tangent to the circle at (R, 0))", () => {
        const [tx, ty] = path.tangentAt(0);
        expect(Math.abs(tx)).toBeLessThan(0.27);
        expect(ty).toBeGreaterThan(0.95);
    });
});

describe("RoutePath.tileCoords", () => {
    it("lists every tile the path crosses, once", () => {
        // From the middle of tile [31,49] north across into tile [31,48]: x from -9184 to -8400 (tile edge at 32-49 = -17*533.33 = -9066.7)
        const path = new RoutePath([{ x: -9184.55, y: 314.07 }, { x: -8600, y: 314.07 }], [{ name: "a", index: 0 }, { name: "b", index: 1 }]);
        expect(path.tileCoords()).toEqual([[31, 49], [31, 48]]);
        expect(TILE_SIZE).toBeCloseTo(533.333, 2);
    });
});
