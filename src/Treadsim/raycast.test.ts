import { describe, expect, it } from "vitest";
import type { ReadonlyVec3 } from "gl-matrix";
import { rayAabb, rayTriangle } from "./raycast.js";

describe("rayTriangle", () => {
    const a: ReadonlyVec3 = [0, 0, 0], b: ReadonlyVec3 = [10, 0, 0], c: ReadonlyVec3 = [0, 0, 10]; // horizontal triangle at y = 0
    it("hits a horizontal floor from above with t in world units", () => {
        expect(rayTriangle([2, 5, 2], [0, -1, 0], a, b, c)).toBeCloseTo(5, 9);
    });
    it("hits back faces too (winding must not matter for floors)", () => {
        expect(rayTriangle([2, 5, 2], [0, -1, 0], a, c, b)).toBeCloseTo(5, 9);
    });
    it("misses outside the triangle and behind the origin", () => {
        expect(rayTriangle([20, 5, 20], [0, -1, 0], a, b, c)).toBeUndefined();
        expect(rayTriangle([2, -5, 2], [0, -1, 0], a, b, c)).toBeUndefined();
    });
    it("scales t with an unnormalised direction", () => {
        expect(rayTriangle([2, 5, 2], [0, -2, 0], a, b, c)).toBeCloseTo(2.5, 9);
    });
});

describe("rayAabb", () => {
    it("detects a downward ray through a box and rejects a ray beside it", () => {
        expect(rayAabb([1, 10, 1], [0, -1, 0], [0, 0, 0], [2, 2, 2], 100)).toBe(true);
        expect(rayAabb([5, 10, 1], [0, -1, 0], [0, 0, 0], [2, 2, 2], 100)).toBe(false);
        expect(rayAabb([1, 10, 1], [0, -1, 0], [0, 0, 0], [2, 2, 2], 5)).toBe(false); // too far
    });
});
