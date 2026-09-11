export interface PreloadWorld {
    loading: boolean;
    adts: unknown[];
    hasLoadedAdt(coord: [number, number]): boolean;
    ensureAdtLoaded(x: number, y: number): Promise<any | undefined>;
}
export interface PreloadScene { setupAdt(adt: any): void }

/** Tiles within `margin` of any input tile, unique, clipped to the 64x64 map grid. */
export function expandTiles(coords: [number, number][], margin: number): [number, number][] {
    const seen = new Set<string>();
    const out: [number, number][] = [];
    for (const [cx, cy] of coords) {
        for (let x = cx - margin; x <= cx + margin; x++) for (let y = cy - margin; y <= cy + margin; y++) {
            if (x < 0 || y < 0 || x > 63 || y > 63) continue;
            const k = `${x},${y}`;
            if (!seen.has(k)) { seen.add(k); out.push([x, y]); }
        }
    }
    return out;
}

/**
 * Loads every tile the route crosses (plus margin) before the run starts, one at a
 * time like noclip's own streaming, so nothing pops in mid-run. Sets `world.loading`
 * so LazyWorldData.onEnterAdt does not start a competing load.
 */
export async function preloadTiles(coords: [number, number][], world: PreloadWorld, scene: PreloadScene,
    onProgress: (done: number, total: number) => void, margin = 1): Promise<void> {
    const todo = expandTiles(coords, margin).filter((c) => !world.hasLoadedAdt(c));
    onProgress(0, todo.length);
    world.loading = true;
    try {
        let done = 0;
        for (const [x, y] of todo) {
            try {
                const adt = await world.ensureAdtLoaded(x, y);
                if (adt) { world.adts.push(adt); scene.setupAdt(adt); }
            } catch (e) {
                console.warn(`treadsim: failed to preload tile ${x},${y}`, e);
            }
            onProgress(++done, todo.length);
        }
    } finally {
        world.loading = false;
    }
}
