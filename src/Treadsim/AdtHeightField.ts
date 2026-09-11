export const TILE_SIZE = 1600 / 3;
export const CHUNK_SIZE = TILE_SIZE / 16;
export const UNIT_SIZE = CHUNK_SIZE / 8;
export const CHUNK_STRIDE = 5 + 9 * 9 + 8 * 8; // header floats + 145 heights
const EPS = 1e-2;

/** Mirror of Rust `Adt::chunk_index_to_coords`: vertex j -> (x, y) in vertex units. */
export function chunkIndexToCoords(j: number): [number, number] {
    let x = Math.floor(j / 17);
    let y = j % 17;
    if (y > 8.01) { x += 0.5; y -= 8.5; }
    return [x, y];
}

function baryHeight(px: number, py: number,
    ax: number, ay: number, ha: number,
    bx: number, by: number, hb: number,
    cx: number, cy: number, hc: number): number {
    const d = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
    const wa = ((by - cy) * (px - cx) + (cx - bx) * (py - cy)) / d;
    const wb = ((cy - ay) * (px - cx) + (ax - cx) * (py - cy)) / d;
    const wc = 1 - wa - wb;
    return wa * ha + wb * hb + wc * hc;
}

/**
 * Height (relative to the chunk's pos.z) at (u, v) in vertex units, u,v in [0, 8].
 * Each cell has an inner vertex at its centre and is split into four triangles
 * that meet there, exactly like the game's terrain mesh.
 */
export function interpolateChunk(h: Float32Array, base: number, u: number, v: number): number {
    const r = Math.min(7, Math.max(0, Math.floor(u)));
    const c = Math.min(7, Math.max(0, Math.floor(v)));
    const fu = u - r, fv = v - c;
    const outer = (rr: number, cc: number) => h[base + rr * 17 + cc];
    const center = h[base + r * 17 + 9 + c];
    const du = fu - 0.5, dv = fv - 0.5;
    let ax: number, ay: number, ha: number, bx: number, by: number, hb: number;
    if (Math.abs(du) >= Math.abs(dv)) {
        if (du < 0) { ax = 0; ay = 0; ha = outer(r, c);     bx = 0; by = 1; hb = outer(r, c + 1); }
        else        { ax = 1; ay = 0; ha = outer(r + 1, c); bx = 1; by = 1; hb = outer(r + 1, c + 1); }
    } else {
        if (dv < 0) { ax = 0; ay = 0; ha = outer(r, c);     bx = 1; by = 0; hb = outer(r + 1, c); }
        else        { ax = 0; ay = 1; ha = outer(r, c + 1); bx = 1; by = 1; hb = outer(r + 1, c + 1); }
    }
    return baryHeight(fu, fv, ax, ay, ha, bx, by, hb, 0.5, 0.5, center);
}

/** One ADT tile's terrain heights, queryable in game (ADT) coordinates. */
export class AdtHeightField {
    constructor(private data: Float32Array) {
        if (data.length !== 256 * CHUNK_STRIDE)
            throw new Error(`AdtHeightField: expected ${256 * CHUNK_STRIDE} floats, got ${data.length}`);
    }

    public heightAt(adtX: number, adtY: number): number | undefined {
        const d = this.data;
        for (let ci = 0; ci < 256; ci++) {
            const o = ci * CHUNK_STRIDE;
            const u = (d[o + 2] - adtX) / UNIT_SIZE;
            const v = (d[o + 3] - adtY) / UNIT_SIZE;
            if (u < -EPS || u > 8 + EPS || v < -EPS || v > 8 + EPS) continue;
            return d[o + 4] + interpolateChunk(d, o + 5, Math.min(8, Math.max(0, u)), Math.min(8, Math.max(0, v)));
        }
        return undefined;
    }
}
