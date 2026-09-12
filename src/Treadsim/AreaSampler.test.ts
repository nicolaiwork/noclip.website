import { describe, expect, it } from "vitest";
import { AreaSampler } from "./AreaSampler.js";
import { CHUNK_SIZE, CHUNK_STRIDE } from "./AdtHeightField.js";

function flatTile(x0: number, y0: number): Float32Array {
    const d = new Float32Array(256 * CHUNK_STRIDE);
    for (let ci = 0; ci < 256; ci++) {
        const o = ci * CHUNK_STRIDE;
        d[o + 2] = x0 - Math.floor(ci / 16) * CHUNK_SIZE; d[o + 3] = y0 - (ci % 16) * CHUNK_SIZE;
    }
    return d;
}
function tile(x0: number, y0: number, area: (ci: number) => number, loaded = true) {
    const areaIds = new Uint32Array(256); for (let i = 0; i < 256; i++) areaIds[i] = area(i);
    return { heightField: loaded ? flatTile(x0, y0) : null, areaIds: loaded ? areaIds : null,
        worldSpaceAABB: { min: [x0 - 16 * CHUNK_SIZE, y0 - 16 * CHUNK_SIZE, -1000], max: [x0, y0, 1000] } };
}

describe("AreaSampler", () => {
    it("returns the area of the chunk under the point and undefined off every tile", () => {
        const s = new AreaSampler({ adts: [tile(1000, 500, (ci) => ci < 16 ? 87 : 12)] });
        expect(s.areaAt(1000 - 0.5 * CHUNK_SIZE, 500 - 3 * CHUNK_SIZE)).toBe(87);   // first row → Goldshire
        expect(s.areaAt(1000 - 5 * CHUNK_SIZE, 500 - 3 * CHUNK_SIZE)).toBe(12);     // Elwynn
        expect(s.areaAt(2000, 2000)).toBeUndefined();
    });
    it("skips tiles that are not loaded yet and tiles whose AABB excludes the point", () => {
        const s = new AreaSampler({ adts: [tile(1000, 500, () => 9, false), tile(1000, 500 - 16 * CHUNK_SIZE, () => 24)] });
        expect(s.areaAt(1000 - 0.5 * CHUNK_SIZE, 500 - 0.5 * CHUNK_SIZE)).toBeUndefined();
        expect(s.areaAt(1000 - 0.5 * CHUNK_SIZE, 500 - 16.5 * CHUNK_SIZE)).toBe(24);
    });
});
