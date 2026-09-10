import { describe, expect, it } from "vitest";
import { AdtHeightField, CHUNK_STRIDE, UNIT_SIZE, chunkIndexToCoords, interpolateChunk } from "./AdtHeightField.js";

/** Builds a tile where every chunk's heights follow h = a*x + b*y (x,y in vertex units). */
function planarTile(a: number, b: number, basePos: [number, number, number]): Float32Array {
    const data = new Float32Array(256 * CHUNK_STRIDE);
    for (let c = 0; c < 256; c++) {
        const ix = Math.floor(c / 16), iy = c % 16;
        const o = c * CHUNK_STRIDE;
        data[o] = ix; data[o + 1] = iy;
        data[o + 2] = basePos[0] - ix * 8 * UNIT_SIZE;
        data[o + 3] = basePos[1] - iy * 8 * UNIT_SIZE;
        data[o + 4] = basePos[2];
        for (let j = 0; j < 145; j++) {
            const [x, y] = chunkIndexToCoords(j);
            data[o + 5 + j] = a * x + b * y;
        }
    }
    return data;
}

describe("chunkIndexToCoords", () => {
    it("matches the Rust layout", () => {
        expect(chunkIndexToCoords(0)).toEqual([0, 0]);
        expect(chunkIndexToCoords(8)).toEqual([0, 8]);
        expect(chunkIndexToCoords(9)).toEqual([0.5, 0.5]);
        expect(chunkIndexToCoords(16)).toEqual([0.5, 7.5]);
        expect(chunkIndexToCoords(17)).toEqual([1, 0]);
        expect(chunkIndexToCoords(144)).toEqual([8, 8]);
    });
});

describe("interpolateChunk", () => {
    it("reproduces a plane exactly inside every triangle", () => {
        const tile = planarTile(2, 3, [0, 0, 0]);
        for (const [u, v] of [[0.1, 0.2], [0.9, 0.2], [0.2, 0.9], [0.8, 0.8], [3.5, 3.5], [7.99, 0.01], [4.25, 6.75]]) {
            expect(interpolateChunk(tile, 5, u, v)).toBeCloseTo(2 * u + 3 * v, 5);
        }
    });
    it("hits vertices exactly", () => {
        const tile = planarTile(1, 1, [0, 0, 0]);
        expect(interpolateChunk(tile, 5, 3, 5)).toBeCloseTo(8, 9);
        expect(interpolateChunk(tile, 5, 2.5, 2.5)).toBeCloseTo(5, 9);
    });
});

describe("AdtHeightField.heightAt", () => {
    const field = new AdtHeightField(planarTile(2, 3, [1000, 500, 50]));
    it("finds the chunk and adds pos.z", () => {
        // chunk (0,0) spans x in [1000-8u, 1000], y in [500-8u, 500]
        const x = 1000 - 3.3 * UNIT_SIZE, y = 500 - 6.7 * UNIT_SIZE;
        expect(field.heightAt(x, y)).toBeCloseTo(50 + 2 * 3.3 + 3 * 6.7, 4);
    });
    it("works in a far chunk", () => {
        const x = 1000 - (5 * 8 + 1.5) * UNIT_SIZE, y = 500 - (9 * 8 + 2.25) * UNIT_SIZE;
        expect(field.heightAt(x, y)).toBeCloseTo(50 + 2 * 1.5 + 3 * 2.25, 4);
    });
    it("returns undefined outside the tile", () => {
        expect(field.heightAt(1001, 500)).toBeUndefined();
        expect(field.heightAt(1000 - 200 * UNIT_SIZE, 500)).toBeUndefined();
    });
    it("rejects malformed data", () => {
        expect(() => new AdtHeightField(new Float32Array(10))).toThrow();
    });
});
