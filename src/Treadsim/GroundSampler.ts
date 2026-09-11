import { HeightFilter } from "./HeightFilter.js";

export interface TerrainLike { heightAtNoclip(nx: number, nz: number): number | undefined }
export interface FloorLike { floorBelow(nx: number, ny: number, nz: number, maxDrop: number): number | undefined }

/**
 * Walkable ground under the eye: the higher of terrain and the nearest WMO floor
 * below the eye. WMO floors are only searched a few eye-heights down, so upper
 * storeys above us are ignored and cellars under a hill lose to the terrain.
 */
export class GroundSampler {
    private filter = new HeightFilter();

    constructor(private terrain: TerrainLike, private wmo: FloorLike) {}

    public groundY(nx: number, ny: number, nz: number, eyeHeight: number): number | undefined {
        const t = this.terrain.heightAtNoclip(nx, nz);
        const w = this.wmo.floorBelow(nx, ny, nz, 4 * eyeHeight);
        if (t === undefined) return w;
        if (w === undefined) return t;
        return Math.max(t, w);
    }

    /** Filtered camera Y for this frame, or undefined if nothing is loaded underneath. */
    public eyeY(nx: number, ny: number, nz: number, eyeHeight: number, dt: number): number | undefined {
        const g = this.groundY(nx, ny, nz, eyeHeight);
        if (g === undefined) return undefined;
        return this.filter.update(g + eyeHeight, dt);
    }
}
