import { HeightFilter } from "./HeightFilter.js";

export interface TerrainLike { heightAt(x: number, y: number): number | undefined }
export interface FloorLike { floorBelow(x: number, y: number, z: number, maxDrop: number): number | undefined }

export const RECAST_DISTANCE = 0.25;
export const RECAST_HEIGHT = 1.0;

/**
 * Walkable ground under a game-space point: the higher of terrain and the nearest
 * WMO floor below the eye. WMO floors are only searched a few eye-heights down, so
 * upper storeys above us are ignored and cellars under a hill lose to the terrain.
 * All coordinates are ADT/game space (X north, Y west, Z up).
 */
export class GroundSampler {
    private filter = new HeightFilter();
    private cast: { x: number; y: number; z: number; floor: number | undefined } | null = null;

    constructor(private terrain: TerrainLike, private wmo: FloorLike) {}

    /** Ground z under (x, y). `zEye` undefined = no previous eye height, terrain only. */
    public height(x: number, y: number, zEye: number | undefined, eyeHeight: number): number | undefined {
        const t = this.terrain.heightAt(x, y);
        const w = zEye === undefined ? undefined : this.floorCached(x, y, zEye, 4 * eyeHeight);
        if (t === undefined) return w;
        if (w === undefined) return t;
        return Math.max(t, w);
    }

    /** floorBelow is ~ms per call in cities; only re-cast once we have actually moved. */
    private floorCached(x: number, y: number, z: number, maxDrop: number): number | undefined {
        const c = this.cast;
        if (c && Math.hypot(x - c.x, y - c.y) <= RECAST_DISTANCE && Math.abs(z - c.z) <= RECAST_HEIGHT) return c.floor;
        const floor = this.wmo.floorBelow(x, y, z, maxDrop);
        this.cast = { x, y, z, floor };
        return floor;
    }

    /** Filtered eye z for this frame, or undefined if nothing is loaded underneath. */
    public eyeZ(x: number, y: number, zEye: number | undefined, eyeHeight: number, dt: number): number | undefined {
        const g = this.height(x, y, zEye, eyeHeight);
        if (g === undefined) return undefined;
        return this.filter.update(g + eyeHeight, dt);
    }

    /** Forget filter state (teleport, route start) so the next sample snaps. */
    public reset(): void { this.filter.reset(); this.cast = null; }
}
