import { describe, expect, it } from "vitest";
import { TerrainSampler } from "./TerrainSampler.js";
import { CHUNK_STRIDE, UNIT_SIZE } from "./AdtHeightField.js";
import { noclipFromAdt } from "./coords.js";

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
    const tileMinAdt = [base[0] - 128 * UNIT_SIZE, base[1] - 128 * UNIT_SIZE];
    // worldSpaceAABB is in ADT space, as noclip's AdtData builds it
    const tile = {
        heightField: flatTile(base, 12),
        worldSpaceAABB: { min: [tileMinAdt[0], tileMinAdt[1], -100], max: [base[0], base[1], 200] },
    };
    const sampler = new TerrainSampler({ adts: [tile, { heightField: null, worldSpaceAABB: tile.worldSpaceAABB }] });

    it("returns the terrain height in noclip Y for a point inside the tile", () => {
        const [nx, , nz] = noclipFromAdt([base[0] - 50, base[1] - 60, 0]);
        expect(sampler.heightAtNoclip(nx, nz)).toBeCloseTo(12, 5);
    });
    it("returns undefined outside every tile", () => {
        expect(sampler.heightAtNoclip(0, 0)).toBeUndefined();
    });
});
