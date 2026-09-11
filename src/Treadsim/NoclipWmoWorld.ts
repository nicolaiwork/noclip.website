import { mat4, vec3, type ReadonlyMat4 } from "gl-matrix";
import type { WmoDefLike, WmoLike, WmoWorldLike } from "./WmoFloorCaster.js";

export interface AabbLike { min: ArrayLike<number>; max: ArrayLike<number> }
export interface RawWmoDef { invModelMatrix: ReadonlyMat4; worldAABB: AabbLike; wmo: WmoLike }
export interface RawWmoWorld { adts: { lodWmoDefs(): RawWmoDef[] }[]; globalWmoDef?: RawWmoDef | null }

const corner = vec3.create();

function transformAabb(bb: AabbLike, m: ReadonlyMat4): { min: number[]; max: number[] } {
    const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < 8; i++) {
        vec3.set(corner, i & 1 ? bb.max[0] : bb.min[0], i & 2 ? bb.max[1] : bb.min[1], i & 4 ? bb.max[2] : bb.min[2]);
        vec3.transformMat4(corner, corner, m);
        for (let k = 0; k < 3; k++) {
            if (corner[k] < min[k]) min[k] = corner[k];
            if (corner[k] > max[k]) max[k] = corner[k];
        }
    }
    return { min, max };
}

/**
 * noclip keeps ADTs and WMO placements in ADT space (X/Y horizontal, Z up) while the
 * camera lives in noclip/placement space (Y up). `WmoFloorCaster` casts straight down
 * along -Y of whatever space its definitions are expressed in, so wrap each definition
 * with its world box and inverse model matrix pushed into noclip space. The underlying
 * `wmo` object is passed through unchanged so the caster's per-WMO caches still hit.
 */
export class NoclipWmoWorld implements WmoWorldLike {
    private defs = new WeakMap<RawWmoDef, WmoDefLike>();
    private tiles = new WeakMap<object, { lodWmoDefs(): WmoDefLike[] }>();

    constructor(private world: RawWmoWorld, private noclipFromAdt: ReadonlyMat4, private adtFromNoclip: ReadonlyMat4) {}

    public get adts(): { lodWmoDefs(): WmoDefLike[] }[] {
        return this.world.adts.map((adt) => {
            let t = this.tiles.get(adt);
            if (!t) {
                t = { lodWmoDefs: () => adt.lodWmoDefs().map((d) => this.wrap(d)) };
                this.tiles.set(adt, t);
            }
            return t;
        });
    }

    public get globalWmoDef(): WmoDefLike | null {
        return this.world.globalWmoDef ? this.wrap(this.world.globalWmoDef) : null;
    }

    private wrap(def: RawWmoDef): WmoDefLike {
        let w = this.defs.get(def);
        if (w === undefined) {
            w = {
                // noclip -> model = (adt -> model) . (noclip -> adt)
                invModelMatrix: mat4.mul(mat4.create(), def.invModelMatrix, this.adtFromNoclip),
                worldAABB: transformAabb(def.worldAABB, this.noclipFromAdt),
                wmo: def.wmo,
            };
            this.defs.set(def, w);
        }
        return w;
    }
}
