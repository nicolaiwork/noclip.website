import { describe, expect, it } from "vitest";
import { GroundSampler } from "./GroundSampler.js";

const terrainAt = (h: number | undefined) => ({ heightAt: () => h });
const floorAt = (h: number | undefined) => ({ floorBelow: () => h });

describe("GroundSampler.height", () => {
    it("uses terrain when there is no WMO floor", () => {
        expect(new GroundSampler(terrainAt(10), floorAt(undefined)).height(0, 0, 12, 1.8)).toBe(10);
    });
    it("prefers a WMO floor above the terrain (bridge, city street)", () => {
        expect(new GroundSampler(terrainAt(10), floorAt(14)).height(0, 0, 16, 1.8)).toBe(14);
    });
    it("ignores a WMO floor below the terrain (cellar under a hill)", () => {
        expect(new GroundSampler(terrainAt(10), floorAt(4)).height(0, 0, 12, 1.8)).toBe(10);
    });
    it("returns undefined with no data at all", () => {
        expect(new GroundSampler(terrainAt(undefined), floorAt(undefined)).height(0, 0, 0, 1.8)).toBeUndefined();
    });
    it("skips the WMO cast when there is no previous eye height", () => {
        let casts = 0;
        const wmo = { floorBelow: () => { casts++; return 14; } };
        expect(new GroundSampler(terrainAt(10), wmo).height(0, 0, undefined, 1.8)).toBe(10);
        expect(casts).toBe(0);
    });
});

describe("GroundSampler.eyeZ", () => {
    it("returns ground + eye height, filtered", () => {
        const s = new GroundSampler(terrainAt(10), floorAt(undefined));
        expect(s.eyeZ(0, 0, 12, 1.8, 0.016)).toBeCloseTo(11.8, 9);
    });
    it("reset() forgets the filter state so the next sample snaps", () => {
        const s = new GroundSampler(terrainAt(10), floorAt(undefined));
        s.eyeZ(0, 0, 12, 1.8, 0.016);
        s.reset();
        expect(s.eyeZ(0, 0, 12, 1.8, 0.016)).toBeCloseTo(11.8, 9);
    });
});

describe("GroundSampler WMO re-cast gate", () => {
    function counting(h: number) {
        let casts = 0;
        return { wmo: { floorBelow: () => { casts++; return h; } }, get casts() { return casts; } };
    }
    it("does not re-cast while the eye stays within 0.25 units horizontally", () => {
        const c = counting(14);
        const s = new GroundSampler(terrainAt(10), c.wmo);
        s.height(0, 0, 16, 1.8);
        s.height(0.1, 0.1, 16, 1.8);
        s.height(0.2, 0, 16, 1.8);
        expect(c.casts).toBe(1);
        expect(s.height(0.2, 0, 16, 1.8)).toBe(14); // cached result still used
    });
    it("re-casts after moving further than 0.25 units, or 1 unit vertically, or after reset()", () => {
        const c = counting(14);
        const s = new GroundSampler(terrainAt(10), c.wmo);
        s.height(0, 0, 16, 1.8);
        s.height(0.3, 0, 16, 1.8);
        expect(c.casts).toBe(2);
        s.height(0.3, 0, 17.5, 1.8);
        expect(c.casts).toBe(3);
        s.reset();
        s.height(0.3, 0, 17.5, 1.8);
        expect(c.casts).toBe(4);
    });
});
