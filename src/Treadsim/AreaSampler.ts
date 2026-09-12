import { AdtHeightField } from "./AdtHeightField.js";

export interface AreaTile {
    heightField: Float32Array | null;
    areaIds: Uint32Array | null;
    worldSpaceAABB: { min: ArrayLike<number>; max: ArrayLike<number> };
}

/**
 * AreaTable ID under a game-space (x, y): the MCNK chunk's `areaId`, exported by the fork next to
 * the height field (`WowAdt.take_area_ids`, same chunk order). Mirrors `TerrainSampler`.
 */
export class AreaSampler {
    private fields = new WeakMap<AreaTile, AdtHeightField>();

    constructor(private world: { adts: AreaTile[] }) {}

    public areaAt(x: number, y: number): number | undefined {
        for (const tile of this.world.adts) {
            if (!tile.heightField || !tile.areaIds) continue;
            const bb = tile.worldSpaceAABB;
            if (x < bb.min[0] || x > bb.max[0] || y < bb.min[1] || y > bb.max[1]) continue;
            let f = this.fields.get(tile);
            if (!f) { f = new AdtHeightField(tile.heightField); this.fields.set(tile, f); }
            const ci = f.chunkIndexAt(x, y);
            if (ci >= 0) return tile.areaIds[ci];
        }
        return undefined;
    }
}
