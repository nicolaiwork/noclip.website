import { describe, expect, it } from "vitest";
import { HeightFilter } from "./HeightFilter.js";

describe("HeightFilter", () => {
    it("takes the first sample directly", () => {
        const f = new HeightFilter();
        expect(f.update(10, 0.016)).toBe(10);
    });
    it("eases toward small changes", () => {
        const f = new HeightFilter(0.3, 3);
        f.update(10, 0.016);
        const v = f.update(11, 0.1);
        expect(v).toBeGreaterThan(10.2);
        expect(v).toBeLessThan(10.4); // 1 - e^(-1/3) ≈ 0.283
    });
    it("snaps on big jumps (teleport, stairs edge)", () => {
        const f = new HeightFilter(0.3, 3);
        f.update(10, 0.016);
        expect(f.update(20, 0.016)).toBe(20);
    });
});
