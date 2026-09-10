import type { ReadonlyVec3 } from "gl-matrix";

const EPS = 1e-7;

/** Möller–Trumbore, both faces. Returns t (in units of |d|) or undefined. */
export function rayTriangle(o: ReadonlyVec3, d: ReadonlyVec3, a: ReadonlyVec3, b: ReadonlyVec3, c: ReadonlyVec3): number | undefined {
    const e1x = b[0] - a[0], e1y = b[1] - a[1], e1z = b[2] - a[2];
    const e2x = c[0] - a[0], e2y = c[1] - a[1], e2z = c[2] - a[2];
    const px = d[1] * e2z - d[2] * e2y, py = d[2] * e2x - d[0] * e2z, pz = d[0] * e2y - d[1] * e2x;
    const det = e1x * px + e1y * py + e1z * pz;
    if (Math.abs(det) < EPS) return undefined;
    const inv = 1 / det;
    const tx = o[0] - a[0], ty = o[1] - a[1], tz = o[2] - a[2];
    const u = (tx * px + ty * py + tz * pz) * inv;
    if (u < 0 || u > 1) return undefined;
    const qx = ty * e1z - tz * e1y, qy = tz * e1x - tx * e1z, qz = tx * e1y - ty * e1x;
    const v = (d[0] * qx + d[1] * qy + d[2] * qz) * inv;
    if (v < 0 || u + v > 1) return undefined;
    const t = (e2x * qx + e2y * qy + e2z * qz) * inv;
    return t > EPS ? t : undefined;
}

/** Slab test: does the ray o + t*d, t in [0, tMax], intersect the box? */
export function rayAabb(o: ReadonlyVec3, d: ReadonlyVec3, min: ArrayLike<number>, max: ArrayLike<number>, tMax: number): boolean {
    let t0 = 0, t1 = tMax;
    for (let i = 0; i < 3; i++) {
        if (Math.abs(d[i]) < EPS) {
            if (o[i] < min[i] || o[i] > max[i]) return false;
            continue;
        }
        const inv = 1 / d[i];
        let ta = (min[i] - o[i]) * inv, tb = (max[i] - o[i]) * inv;
        if (ta > tb) { const s = ta; ta = tb; tb = s; }
        t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
        if (t0 > t1) return false;
    }
    return true;
}
