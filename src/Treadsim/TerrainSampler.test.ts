import { describe, expect, it } from "vitest";
import { TerrainSampler } from "./TerrainSampler.js";
import { CHUNK_STRIDE, UNIT_SIZE } from "./AdtHeightField.js";

function flatTile(basePos: [number, number, number], height: number): Float32Array {
    const data = new Float32Array(256 * CHUNK_STRIDE);
    for (let c = 0; c < 256; c++) {
        const ix = Math.floor(c / 16), iy = c % 16, o = c * CHUNK_STRIDE;
        data[o] = ix; data[o + 1] = iy;
        data[o + 2] = basePos[0] - ix * 8 * UNIT_SIZE;
        data[o + 3] = basePos[1] - iy * 8 * UNIT_SIZE;
        data[o + 4] = basePos[2];
        for (let j = 0; j < 145; j++) data[o + 5 + j] = height;
    }
    return data;
}

describe("TerrainSampler", () => {
    const base: [number, number, number] = [-9000, 400, 0];
    const tileMin = [base[0] - 128 * UNIT_SIZE, base[1] - 128 * UNIT_SIZE];
    // worldSpaceAABB is ADT space, as noclip's AdtData builds it
    const tile = {
        heightField: flatTile(base, 12),
        worldSpaceAABB: { min: [tileMin[0], tileMin[1], -100], max: [base[0], base[1], 200] },
    };
    const sampler = new TerrainSampler({ adts: [{ heightField: null, worldSpaceAABB: tile.worldSpaceAABB }, tile] });

    it("returns the terrain height for a game-space point inside the tile", () => {
        expect(sampler.heightAt(base[0] - 50, base[1] - 60)).toBeCloseTo(12, 5);
    });
    it("skips tiles whose height field is not loaded and returns undefined outside every tile", () => {
        expect(sampler.heightAt(0, 0)).toBeUndefined();
    });
});
