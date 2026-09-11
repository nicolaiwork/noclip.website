import { AdtHeightField } from "./AdtHeightField.js";
import { adtFromNoclip } from "./coords.js";

export interface TerrainTile {
    heightField: Float32Array | null;
    worldSpaceAABB: { min: ArrayLike<number>; max: ArrayLike<number> };
}

/**
 * Terrain height under a noclip-space (x, z), read from the loaded tiles' height
 * fields. noclip's `AdtData.worldSpaceAABB` is in ADT space (X, Y horizontal,
 * Z up), so the tile lookup is done in ADT space too.
 */
export class TerrainSampler {
    private fields = new WeakMap<TerrainTile, AdtHeightField>();

    constructor(private world: { adts: TerrainTile[] }) {}

    public heightAtNoclip(nx: number, nz: number): number | undefined {
        const [ax, ay] = adtFromNoclip([nx, 0, nz]);
        for (const tile of this.world.adts) {
            if (!tile.heightField) continue;
            const bb = tile.worldSpaceAABB;
            if (ax < bb.min[0] || ax > bb.max[0] || ay < bb.min[1] || ay > bb.max[1]) continue;
            let f = this.fields.get(tile);
            if (!f) { f = new AdtHeightField(tile.heightField); this.fields.set(tile, f); }
            const h = f.heightAt(ax, ay);
            if (h !== undefined) return h; // ADT z is noclip y
        }
        return undefined;
    }
}
