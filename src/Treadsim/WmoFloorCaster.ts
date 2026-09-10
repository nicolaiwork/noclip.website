import { vec3, type ReadonlyMat4, type ReadonlyVec3 } from "gl-matrix";
import { rayAabb, rayTriangle } from "./raycast.js";

export interface WmoGroupLike {
    group_id: number; antiportal: boolean;
    vertex_buffer_offset?: number; index_buffer_offset?: number;
    num_vertices: number; num_indices: number;
}
export interface WmoLike { vertexBuffer: Uint8Array; indexBuffer: Uint16Array; groupDescriptors: WmoGroupLike[] }
export interface WmoDefLike { invModelMatrix: ReadonlyMat4; worldAABB: { min: ArrayLike<number>; max: ArrayLike<number> }; wmo: WmoLike }
export interface WmoWorldLike { adts: { lodWmoDefs(): WmoDefLike[] }[]; globalWmoDef: WmoDefLike | null }

interface GroupBounds { min: vec3; max: vec3 }

/**
 * Casts straight down from just above the eye through every WMO whose world box
 * contains the point, in each WMO's model space, and returns the highest floor
 * (noclip Y) within `maxDrop`. Group bounding boxes are computed once per WMO
 * from the vertex data and cached.
 */
export class WmoFloorCaster {
    private groupBounds = new WeakMap<WmoLike, Map<number, GroupBounds>>();
    private scratchO = vec3.create();
    private scratchD = vec3.create();
    private a = vec3.create(); private b = vec3.create(); private c = vec3.create();

    constructor(private world: WmoWorldLike) {}

    public floorBelow(nx: number, ny: number, nz: number, maxDrop: number): number | undefined {
        const startAbove = 0.5;
        const origin: [number, number, number] = [nx, ny + startAbove, nz];
        const tMax = maxDrop + startAbove;
        let best: number | undefined;
        const consider = (def: WmoDefLike) => {
            const bb = def.worldAABB;
            if (nx < bb.min[0] || nx > bb.max[0] || nz < bb.min[2] || nz > bb.max[2]) return;
            if (origin[1] < bb.min[1]) return; // WMO entirely above the eye
            const t = this.castDef(def, origin, tMax);
            if (t === undefined) return;
            const y = origin[1] - t;
            if (best === undefined || y > best) best = y;
        };
        for (const adt of this.world.adts) for (const def of adt.lodWmoDefs()) consider(def);
        if (this.world.globalWmoDef) consider(this.world.globalWmoDef);
        return best;
    }

    private castDef(def: WmoDefLike, origin: ReadonlyVec3, tMax: number): number | undefined {
        const inv = def.invModelMatrix;
        const o = vec3.transformMat4(this.scratchO, origin, inv);
        // direction (0,-1,0) through the linear part of inv: minus its second column
        const d = vec3.set(this.scratchD, -inv[4], -inv[5], -inv[6]);
        const wmo = def.wmo;
        const f32 = new Float32Array(wmo.vertexBuffer.buffer, wmo.vertexBuffer.byteOffset, Math.floor(wmo.vertexBuffer.byteLength / 4));
        const ib = wmo.indexBuffer;
        const bounds = this.boundsFor(wmo, f32);
        let best: number | undefined;
        for (const g of wmo.groupDescriptors) {
            if (g.antiportal || g.vertex_buffer_offset === undefined || g.index_buffer_offset === undefined) continue;
            const gb = bounds.get(g.group_id);
            if (gb && !rayAabb(o, d, gb.min, gb.max, tMax)) continue;
            const vOff = g.vertex_buffer_offset / 4;
            const iOff = g.index_buffer_offset / 2;
            for (let i = 0; i + 2 < g.num_indices; i += 3) {
                const ia = vOff + ib[iOff + i] * 3, ibx = vOff + ib[iOff + i + 1] * 3, ic = vOff + ib[iOff + i + 2] * 3;
                vec3.set(this.a, f32[ia], f32[ia + 1], f32[ia + 2]);
                vec3.set(this.b, f32[ibx], f32[ibx + 1], f32[ibx + 2]);
                vec3.set(this.c, f32[ic], f32[ic + 1], f32[ic + 2]);
                const t = rayTriangle(o, d, this.a, this.b, this.c);
                if (t !== undefined && t <= tMax && (best === undefined || t < best)) best = t;
            }
        }
        return best;
    }

    private boundsFor(wmo: WmoLike, f32: Float32Array): Map<number, GroupBounds> {
        let m = this.groupBounds.get(wmo);
        if (m) return m;
        m = new Map();
        for (const g of wmo.groupDescriptors) {
            if (g.vertex_buffer_offset === undefined) continue;
            const min = vec3.fromValues(Infinity, Infinity, Infinity), max = vec3.fromValues(-Infinity, -Infinity, -Infinity);
            const vOff = g.vertex_buffer_offset / 4;
            for (let v = 0; v < g.num_vertices; v++) {
                for (let k = 0; k < 3; k++) {
                    const x = f32[vOff + v * 3 + k];
                    if (x < min[k]) min[k] = x;
                    if (x > max[k]) max[k] = x;
                }
            }
            m.set(g.group_id, { min, max });
        }
        this.groupBounds.set(wmo, m);
        return m;
    }
}
