import { describe, expect, it } from "vitest";
import { LookOffset } from "./LookOffset.js";

describe("LookOffset", () => {
    it("turns with the mouse while dragging, same sign convention as noclip (dx * -1/500)", () => {
        const l = new LookOffset();
        l.update(100, 0, true, 1 / 60);
        expect(l.yaw).toBeCloseTo(-0.2, 9);
        l.update(0, -50, true, 1 / 60);
        expect(l.pitch).toBeCloseTo(0.1, 9);
    });
    it("clamps pitch to +-60 degrees and yaw to +-150 degrees", () => {
        const l = new LookOffset();
        l.update(0, -100000, true, 1 / 60);
        expect(l.pitch).toBeCloseTo(60 * Math.PI / 180, 9);
        l.update(100000, 0, true, 1 / 60);
        expect(l.yaw).toBeCloseTo(-150 * Math.PI / 180, 9);
    });
    it("eases back to zero when released (tau 0.5 s)", () => {
        const l = new LookOffset();
        l.update(100, 100, true, 1 / 60);
        const y0 = Math.abs(l.yaw);
        for (let i = 0; i < 60; i++) l.update(0, 0, false, 1 / 60); // 1 s
        expect(Math.abs(l.yaw)).toBeLessThan(y0 * 0.15);
        expect(Math.abs(l.yaw)).toBeGreaterThan(0);
        for (let i = 0; i < 600; i++) l.update(0, 0, false, 1 / 60);
        expect(Math.abs(l.yaw)).toBeLessThan(1e-4);
        expect(Math.abs(l.pitch)).toBeLessThan(1e-4);
    });
    it("ignores mouse deltas when not dragging", () => {
        const l = new LookOffset();
        l.update(100, 100, false, 1 / 60);
        expect(l.yaw).toBe(0); expect(l.pitch).toBe(0);
    });
});
