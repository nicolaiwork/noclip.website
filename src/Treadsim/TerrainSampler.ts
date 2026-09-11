import { AdtHeightField } from "./AdtHeightField.js";

export interface TerrainTile {
    heightField: Float32Array | null;
    worldSpaceAABB: { min: ArrayLike<number>; max: ArrayLike<number> };
}

/**
 * Terrain height under a game-space (x, y), read from the loaded tiles' height
 * fields. noclip's `AdtData.worldSpaceAABB` is ADT space too, so no conversion.
 */
export class TerrainSampler {
    private fields = new WeakMap<TerrainTile, AdtHeightField>();

    constructor(private world: { adts: TerrainTile[] }) {}

    public heightAt(x: number, y: number): number | undefined {
        for (const tile of this.world.adts) {
            if (!tile.heightField) continue;
            const bb = tile.worldSpaceAABB;
            if (x < bb.min[0] || x > bb.max[0] || y < bb.min[1] || y > bb.max[1]) continue;
            let f = this.fields.get(tile);
            if (!f) { f = new AdtHeightField(tile.heightField); this.fields.set(tile, f); }
            const h = f.heightAt(x, y);
            if (h !== undefined) return h;
        }
        return undefined;
    }
}
