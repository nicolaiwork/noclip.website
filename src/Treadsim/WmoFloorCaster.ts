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
interface WmoGeometry { f32: Float32Array; bounds: Map<number, GroupBounds> }

export interface CasterOptions { useGrid?: boolean; gridCells?: number }

interface GroupGrid {
    a: number; u: number; v: number;   // ray axis and the two grid axes, in model space
    du: number; dv: number;             // d[u]/d[a], d[v]/d[a]: oblique projection slopes
    minU: number; minV: number; cell: number; nu: number; nv: number;
    tris: (number[] | undefined)[];     // per cell: triangle ordinals within the group
}

/**
 * Casts straight down from just above the eye through every WMO whose world box
 * contains the point, in each WMO's model space, and returns the highest floor
 * (ADT z) within `maxDrop`. Group bounding boxes are computed once per WMO
 * from the vertex data and cached. Per definition and group, a 2D grid of
 * triangles projected along the cast direction is built on first use, so a
 * cast tests a few triangles instead of every triangle in every group under
 * the eye.
 */
export class WmoFloorCaster {
    private geometry = new WeakMap<WmoLike, WmoGeometry>();
    private grids = new WeakMap<WmoDefLike, Map<number, GroupGrid>>();
    private readonly useGrid: boolean;
    private readonly gridCells: number;
    private scratchO = vec3.create();
    private scratchD = vec3.create();
    private a = vec3.create(); private b = vec3.create(); private c = vec3.create();

    constructor(private world: WmoWorldLike, opts: CasterOptions = {}) {
        this.useGrid = opts.useGrid ?? true;
        this.gridCells = opts.gridCells ?? 64;
    }

    /**
     * Highest floor (ADT z) within `maxDrop` below the eye at game-space (x, y, z).
     * Casts straight down (-Z) in each WMO's model space.
     */
    public floorBelow(x: number, y: number, z: number, maxDrop: number): number | undefined {
        const startAbove = 0.5;
        const origin: [number, number, number] = [x, y, z + startAbove];
        const tMax = maxDrop + startAbove;
        let best: number | undefined;
        const consider = (def: WmoDefLike) => {
            const bb = def.worldAABB;
            if (x < bb.min[0] || x > bb.max[0] || y < bb.min[1] || y > bb.max[1]) return;
            if (origin[2] < bb.min[2]) return;         // WMO entirely above the eye
            if (bb.max[2] < origin[2] - tMax) return;  // WMO entirely below reach
            const t = this.castDef(def, origin, tMax);
            if (t === undefined) return;
            const floorZ = origin[2] - t;
            if (best === undefined || floorZ > best) best = floorZ;
        };
        for (const adt of this.world.adts) for (const def of adt.lodWmoDefs()) consider(def);
        if (this.world.globalWmoDef) consider(this.world.globalWmoDef);
        return best;
    }

    private castDef(def: WmoDefLike, origin: ReadonlyVec3, tMax: number): number | undefined {
        const inv = def.invModelMatrix;
        const o = vec3.transformMat4(this.scratchO, origin, inv);
        // world direction (0,0,-1) through the linear part of inv: minus its third column
        const d = vec3.set(this.scratchD, -inv[8], -inv[9], -inv[10]);
        const wmo = def.wmo;
        const { f32, bounds } = this.geometryFor(wmo);
        const ib = wmo.indexBuffer;
        let best: number | undefined;
        for (const g of wmo.groupDescriptors) {
            if (g.antiportal || g.vertex_buffer_offset === undefined || g.index_buffer_offset === undefined) continue;
            const gb = bounds.get(g.group_id);
            if (gb && !rayAabb(o, d, gb.min, gb.max, tMax)) continue;
            const vOff = g.vertex_buffer_offset / 4;
            const iOff = g.index_buffer_offset / 2;
            if (this.useGrid && gb) {
                const grid = this.gridFor(def, g, f32, ib, gb, d);
                const ou = o[grid.u] - grid.du * o[grid.a], ov = o[grid.v] - grid.dv * o[grid.a];
                const cu = Math.min(grid.nu - 1, Math.max(0, Math.floor((ou - grid.minU) / grid.cell)));
                const cv = Math.min(grid.nv - 1, Math.max(0, Math.floor((ov - grid.minV) / grid.cell)));
                const list = grid.tris[cu * grid.nv + cv];
                if (!list) continue;
                for (const t of list) best = this.testTri(f32, ib, vOff, iOff, t, o, d, tMax, best);
            } else {
                const nTri = Math.floor(g.num_indices / 3);
                for (let t = 0; t < nTri; t++) best = this.testTri(f32, ib, vOff, iOff, t, o, d, tMax, best);
            }
        }
        return best;
    }

    private testTri(f32: Float32Array, ib: Uint16Array, vOff: number, iOff: number, t: number,
        o: ReadonlyVec3, d: ReadonlyVec3, tMax: number, best: number | undefined): number | undefined {
        const i = iOff + t * 3;
        const ia = vOff + ib[i] * 3, ibx = vOff + ib[i + 1] * 3, ic = vOff + ib[i + 2] * 3;
        vec3.set(this.a, f32[ia], f32[ia + 1], f32[ia + 2]);
        vec3.set(this.b, f32[ibx], f32[ibx + 1], f32[ibx + 2]);
        vec3.set(this.c, f32[ic], f32[ic + 1], f32[ic + 2]);
        const hit = rayTriangle(o, d, this.a, this.b, this.c);
        return hit !== undefined && hit <= tMax && (best === undefined || hit < best) ? hit : best;
    }

    /** Oblique-projection grid of one group's triangles for this definition's ray direction. Built once. */
    private gridFor(def: WmoDefLike, g: WmoGroupLike, f32: Float32Array, ib: Uint16Array, gb: GroupBounds, d: ReadonlyVec3): GroupGrid {
        let perDef = this.grids.get(def);
        if (!perDef) { perDef = new Map(); this.grids.set(def, perDef); }
        const cached = perDef.get(g.group_id);
        if (cached) return cached;
        const ax = Math.abs(d[0]), ay = Math.abs(d[1]), az = Math.abs(d[2]);
        const a = ax >= ay && ax >= az ? 0 : ay >= az ? 1 : 2;
        const u = (a + 1) % 3, v = (a + 2) % 3;
        const du = d[u] / d[a], dv = d[v] / d[a];
        let minU = Infinity, maxU = -Infinity, minV = Infinity, maxV = -Infinity;
        for (let i = 0; i < 8; i++) {
            const p = [i & 1 ? gb.max[0] : gb.min[0], i & 2 ? gb.max[1] : gb.min[1], i & 4 ? gb.max[2] : gb.min[2]];
            const pu = p[u] - du * p[a], pv = p[v] - dv * p[a];
            if (pu < minU) minU = pu; if (pu > maxU) maxU = pu; if (pv < minV) minV = pv; if (pv > maxV) maxV = pv;
        }
        const cell = Math.max(1, Math.max(maxU - minU, maxV - minV) / this.gridCells);
        const nu = Math.max(1, Math.ceil((maxU - minU) / cell)), nv = Math.max(1, Math.ceil((maxV - minV) / cell));
        const tris: (number[] | undefined)[] = new Array(nu * nv);
        const vOff = g.vertex_buffer_offset! / 4, iOff = g.index_buffer_offset! / 2;
        const nTri = Math.floor(g.num_indices / 3);
        for (let t = 0; t < nTri; t++) {
            let tMinU = Infinity, tMaxU = -Infinity, tMinV = Infinity, tMaxV = -Infinity;
            for (let k = 0; k < 3; k++) {
                const vi = vOff + ib[iOff + t * 3 + k] * 3;
                const pa = f32[vi + a], pu = f32[vi + u] - du * pa, pv = f32[vi + v] - dv * pa;
                if (pu < tMinU) tMinU = pu; if (pu > tMaxU) tMaxU = pu; if (pv < tMinV) tMinV = pv; if (pv > tMaxV) tMaxV = pv;
            }
            const c0 = Math.min(nu - 1, Math.max(0, Math.floor((tMinU - minU) / cell)));
            const c1 = Math.min(nu - 1, Math.max(0, Math.floor((tMaxU - minU) / cell)));
            const r0 = Math.min(nv - 1, Math.max(0, Math.floor((tMinV - minV) / cell)));
            const r1 = Math.min(nv - 1, Math.max(0, Math.floor((tMaxV - minV) / cell)));
            for (let cu = c0; cu <= c1; cu++) for (let cv = r0; cv <= r1; cv++) {
                const idx = cu * nv + cv;
                (tris[idx] ??= []).push(t);
            }
        }
        const grid: GroupGrid = { a, u, v, du, dv, minU, minV, cell, nu, nv, tris };
        perDef.set(g.group_id, grid);
        return grid;
    }

    private geometryFor(wmo: WmoLike): WmoGeometry {
        let geom = this.geometry.get(wmo);
        if (geom) return geom;
        const f32 = new Float32Array(wmo.vertexBuffer.buffer, wmo.vertexBuffer.byteOffset, Math.floor(wmo.vertexBuffer.byteLength / 4));
        const bounds = new Map<number, GroupBounds>();
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
            bounds.set(g.group_id, { min, max });
        }
        geom = { f32, bounds };
        this.geometry.set(wmo, geom);
        return geom;
    }
}
