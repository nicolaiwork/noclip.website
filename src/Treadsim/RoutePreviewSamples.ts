import { RoutePath } from "./RoutePath.js";

export interface PreviewSample { x: number; y: number; z: number | undefined }

const ENDS = (n: number) => [{ name: "a", index: 0 }, { name: "b", index: n - 1 }];

/** Dense polyline along the draft's spline with the terrain height under each sample (ADT space). */
export function samplePreview(points: { x: number; y: number }[], heightAt: (x: number, y: number) => number | undefined, spacing = 2): PreviewSample[] {
    if (points.length < 2) return points.map((p) => ({ x: p.x, y: p.y, z: heightAt(p.x, p.y) }));
    const path = new RoutePath(points, ENDS(points.length));
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
