import { mat4, vec4, type ReadonlyMat4, type ReadonlyVec3 } from "gl-matrix";
import { adtFromNoclip } from "./coords.js";

export interface GroundRay { origin: [number, number, number]; dir: [number, number, number] }

/**
 * Unprojects a canvas pixel through the camera's clipFromWorld matrix into an ADT-space ray
 * from the camera. Any NDC depth in [0, 1] is in front of the camera (noclip uses reversed,
 * infinite depth), so 0.5 gives a point on the ray; the direction is that point minus the eye.
 */
export function rayFromScreen(clipFromWorld: ReadonlyMat4, cameraPosNoclip: ReadonlyVec3, px: number, py: number, width: number, height: number): GroundRay {
    const inv = mat4.invert(mat4.create(), clipFromWorld);
    if (!inv) throw new Error("GroundPick: singular projection");
    const ndc = vec4.fromValues((2 * px) / width - 1, 1 - (2 * py) / height, 0.5, 1);
    const w = vec4.transformMat4(vec4.create(), ndc, inv);
    const pNoclip: [number, number, number] = [w[0] / w[3], w[1] / w[3], w[2] / w[3]];
    const origin = adtFromNoclip(cameraPosNoclip);
    const p = adtFromNoclip(pNoclip);
    const d: [number, number, number] = [p[0] - origin[0], p[1] - origin[1], p[2] - origin[2]];
    const len = Math.hypot(d[0], d[1], d[2]) || 1;
    return { origin, dir: [d[0] / len, d[1] / len, d[2] / len] };
}

/**
 * Steps along the ray until it passes from above to below the terrain, then bisects the
 * crossing. Samples without terrain (tile not loaded) neither start nor end a crossing.
 */
export function marchToGround(ray: GroundRay, heightAt: (x: number, y: number) => number | undefined, maxDist = 3000, step = 1): [number, number, number] | undefined {
    const at = (t: number): [number, number, number] => [ray.origin[0] + ray.dir[0] * t, ray.origin[1] + ray.dir[1] * t, ray.origin[2] + ray.dir[2] * t];
    const above = (t: number): boolean | undefined => {
        const [x, y, z] = at(t);
        const h = heightAt(x, y);
        return h === undefined ? undefined : z > h;
    };
    let prevT: number | null = null;
    for (let t = 0; t <= maxDist; t += step) {
        const a = above(t);
        if (a === undefined) { prevT = null; continue; }
        if (a) { prevT = t; continue; }
        if (prevT === null) continue;                       // started (or re-emerged) below ground: not a crossing from above
        let lo = prevT, hi = t;
        for (let i = 0; i < 12; i++) {
            const mid = (lo + hi) / 2;
            if (above(mid) === false) hi = mid; else lo = mid;
        }
        const [x, y] = at(hi);
        const h = heightAt(x, y);
        return h === undefined ? undefined : [x, y, h];
    }
    return undefined;
}

export function pickGround(clipFromWorld: ReadonlyMat4, cameraPosNoclip: ReadonlyVec3, px: number, py: number, width: number, height: number, heightAt: (x: number, y: number) => number | undefined): [number, number, number] | undefined {
    return marchToGround(rayFromScreen(clipFromWorld, cameraPosNoclip, px, py, width, height), heightAt);
}
