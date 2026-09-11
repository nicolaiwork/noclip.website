import { RoutePath } from "./RoutePath.js";
import type { RouteStop } from "./RouteFile.js";

export interface PreviewSample { x: number; y: number; z: number | undefined }

const ENDS = (n: number) => [{ name: "a", index: 0 }, { name: "b", index: n - 1 }];

/** Ensures indices 0 and n-1 are present (added if missing), ascending, deduplicated by index. */
function normalizeStops(stops: RouteStop[], n: number): RouteStop[] {
    const byIndex = new Map<number, RouteStop>();
    for (const s of stops) byIndex.set(s.index, s);
    if (!byIndex.has(0)) byIndex.set(0, { name: "start", index: 0 });
    if (!byIndex.has(n - 1)) byIndex.set(n - 1, { name: "end", index: n - 1 });
    return [...byIndex.values()].sort((a, b) => a.index - b.index);
}

/**
 * Dense polyline along the draft's spline with the terrain height under each sample (ADT space).
 * `stops`, when given, are pinned during smoothing (like `reportRoute`'s path) so the preview
 * matches the line the follower actually drives; otherwise only the first/last point are fixed.
 */
export function samplePreview(points: { x: number; y: number }[], heightAt: (x: number, y: number) => number | undefined, spacing = 2, stops?: RouteStop[]): PreviewSample[] {
    if (points.length < 2) return points.map((p) => ({ x: p.x, y: p.y, z: heightAt(p.x, p.y) }));
    const path = new RoutePath(points, stops ? normalizeStops(stops, points.length) : ENDS(points.length));
    const out: PreviewSample[] = [];
    const n = Math.ceil(path.lengthTotal / spacing);
    for (let i = 0; i <= n; i++) {
        const s = Math.min(path.lengthTotal, i * spacing);
        const [x, y] = path.positionAt(s);
        out.push({ x, y, z: heightAt(x, y) });
    }
    return out;
}

export function pointHeights(points: { x: number; y: number }[], heightAt: (x: number, y: number) => number | undefined): (number | undefined)[] {
    return points.map((p) => heightAt(p.x, p.y));
}
