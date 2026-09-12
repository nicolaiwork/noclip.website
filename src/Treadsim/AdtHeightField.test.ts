import { describe, expect, it } from "vitest";
import { AdtHeightField, CHUNK_SIZE, CHUNK_STRIDE, UNIT_SIZE, chunkIndexToCoords, interpolateChunk } from "./AdtHeightField.js";

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
    it("selects the triangle of the centre fan, not a bilinear blend", () => {
        const data = new Float32Array(256 * CHUNK_STRIDE);
        // cell r=2, c=3 of chunk 0: outer vertex (row 2, col 4) and the cell's centre (inner) vertex.
        data[5 + 38] = 4;  // j = 2*17 + 4
        data[5 + 46] = 10; // j = 2*17 + 9 + 3
        // du = -0.3, dv = 0 -> low-u edge triangle: corners h=0 and h=4, centre 10.
        expect(interpolateChunk(data, 5, 2.2, 3.5)).toBeCloseTo(5.2, 9);
        // du = 0, dv = -0.3 -> low-v edge triangle: corners h=0 and h=0, centre 10.
        expect(interpolateChunk(data, 5, 2.5, 3.2)).toBeCloseTo(4.0, 9);
        // exactly the centre vertex.
        expect(interpolateChunk(data, 5, 2.5, 3.5)).toBeCloseTo(10, 9);
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

describe("AdtHeightField.chunkIndexAt", () => {
    it("returns the chunk whose [pos - 8 units] square contains the point, -1 outside the tile", () => {
        // planarTile(0, 0, ...) is flat (all heights 0), same layout as a "flatTile" would be.
        const f = new AdtHeightField(planarTile(0, 0, [1000, 500, 0]));
        expect(f.chunkIndexAt(1000 - 0.5 * CHUNK_SIZE, 500 - 0.5 * CHUNK_SIZE)).toBe(0);
        expect(f.chunkIndexAt(1000 - 1.5 * CHUNK_SIZE, 500 - 0.5 * CHUNK_SIZE)).toBe(16);   // one row down
        expect(f.chunkIndexAt(1000 - 0.5 * CHUNK_SIZE, 500 - 2.5 * CHUNK_SIZE)).toBe(2);    // two columns over
        expect(f.chunkIndexAt(1000 - 15.5 * CHUNK_SIZE, 500 - 15.5 * CHUNK_SIZE)).toBe(255);
        expect(f.chunkIndexAt(1000 + 5, 500)).toBe(-1);
        expect(f.chunkIndexAt(1000 - 17 * CHUNK_SIZE, 500)).toBe(-1);
    });
    it("heightAt still agrees with chunkIndexAt (same chunk, same answer)", () => {
        const d = planarTile(0, 0, [1000, 500, 0]);
        d[16 * CHUNK_STRIDE + 4] = 42; // chunk 16 sits 42 units higher
        const f = new AdtHeightField(d);
        expect(f.heightAt(1000 - 1.5 * CHUNK_SIZE, 500 - 0.5 * CHUNK_SIZE)).toBeCloseTo(42);
        expect(f.heightAt(1000 - 0.5 * CHUNK_SIZE, 500 - 0.5 * CHUNK_SIZE)).toBeCloseTo(0);
    });
});
