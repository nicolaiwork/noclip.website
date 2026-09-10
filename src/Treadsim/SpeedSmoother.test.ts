import { describe, expect, it } from "vitest";
import { SpeedSmoother } from "./SpeedSmoother.js";

describe("SpeedSmoother", () => {
    it("starts at zero and converges toward the sample", () => {
        const s = new SpeedSmoother(1.5, 100);
        expect(s.value).toBe(0);
        let v = 0;
        for (let i = 0; i < 30; i++) v = s.update(3, 0.1); // 3 s at 10 Hz
        expect(v).toBeGreaterThan(2.5);
        expect(v).toBeLessThan(3);
    });

    it("never changes faster than maxAccel", () => {
        const s = new SpeedSmoother(0.01, 1.5); // tiny tau: acceleration limit dominates
        const v1 = s.update(10, 0.1);
        expect(v1).toBeCloseTo(0.15, 6);
        const v2 = s.update(0, 0.1);
        expect(v2).toBeCloseTo(0, 4);
    });

    it("reset sets the value directly", () => {
        const s = new SpeedSmoother();
        s.reset(2.5);
        expect(s.value).toBe(2.5);
    });
});
