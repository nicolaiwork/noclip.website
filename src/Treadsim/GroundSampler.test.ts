import { describe, expect, it } from "vitest";
import { GroundSampler } from "./GroundSampler.js";

const terrainAt = (h: number | undefined) => ({ heightAtNoclip: () => h });
const floorAt = (h: number | undefined) => ({ floorBelow: () => h });

describe("GroundSampler.groundY", () => {
    it("uses terrain when there is no WMO floor", () => {
        expect(new GroundSampler(terrainAt(10), floorAt(undefined)).groundY(0, 12, 0, 1.8)).toBe(10);
    });
    it("prefers a WMO floor above the terrain (bridge, city street)", () => {
        expect(new GroundSampler(terrainAt(10), floorAt(14)).groundY(0, 16, 0, 1.8)).toBe(14);
    });
    it("ignores a WMO floor below the terrain (cellar under a hill)", () => {
        expect(new GroundSampler(terrainAt(10), floorAt(4)).groundY(0, 12, 0, 1.8)).toBe(10);
    });
    it("returns undefined with no data at all", () => {
        expect(new GroundSampler(terrainAt(undefined), floorAt(undefined)).groundY(0, 0, 0, 1.8)).toBeUndefined();
    });
});

describe("GroundSampler.eyeY", () => {
    it("returns ground + eye height, filtered", () => {
        const s = new GroundSampler(terrainAt(10), floorAt(undefined));
        expect(s.eyeY(0, 12, 0, 1.8, 0.016)).toBeCloseTo(11.8, 9);
    });
});
