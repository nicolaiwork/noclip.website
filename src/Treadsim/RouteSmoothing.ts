import type { RouteStop, RouteWaypoint } from "./RouteFile.js";

export interface SmoothingOptions { passes?: number; lambda?: number; maxShift?: number }
export const DEFAULT_SMOOTHING: Required<SmoothingOptions> = { passes: 2, lambda: 0.5, maxShift: 1.5 };

/**
 * Laplacian smoothing of the interior waypoints: each pass moves a point `lambda` of the way toward
 * the midpoint of its neighbours. Endpoints and declared stops never move. Every point's total
 * displacement from its original position is clamped to `maxShift` units, so ±1–2 u click jitter
 * (period two points) is removed while a genuine corner is cut by at most `maxShift`.
 * Returns new objects; the input is not mutated.
 */
export function smoothWaypoints(waypoints: RouteWaypoint[], stops: RouteStop[], opts: SmoothingOptions = {}): RouteWaypoint[] {
    const { passes, lambda, maxShift } = { ...DEFAULT_SMOOTHING, ...opts };
    const n = waypoints.length;
    const original = waypoints.map((p) => ({ x: p.x, y: p.y }));
    const fixed = new Set<number>([0, n - 1, ...stops.map((s) => s.index)]);
    let current = original.map((p) => ({ x: p.x, y: p.y }));
    for (let pass = 0; pass < passes; pass++) {
        const prev = current;
        const next = prev.map((p) => ({ x: p.x, y: p.y }));
        for (let i = 0; i < n; i++) {
            if (fixed.has(i)) continue;
            const a = prev[i - 1], b = prev[i + 1];
            if (!a || !b) continue;
            let px = prev[i].x + lambda * ((a.x + b.x) / 2 - prev[i].x);
            let py = prev[i].y + lambda * ((a.y + b.y) / 2 - prev[i].y);
            const dx = px - original[i].x, dy = py - original[i].y;
            const d = Math.hypot(dx, dy);
            if (d > maxShift) {
                const scale = maxShift / d;
                px = original[i].x + dx * scale;
                py = original[i].y + dy * scale;
            }
            next[i] = { x: px, y: py };
        }
        current = next;
    }
    return current;
}

/** |offset| of each interior point from the chord between its neighbours (game units); [] for < 3 points. */
export function lateralOffsets(waypoints: RouteWaypoint[]): number[] {
    const n = waypoints.length;
    if (n < 3) return [];
    const out: number[] = [];
    for (let i = 1; i < n - 1; i++) {
        const a = waypoints[i - 1], b = waypoints[i + 1], p = waypoints[i];
        const abx = b.x - a.x, aby = b.y - a.y;
        const len = Math.hypot(abx, aby);
        if (len < 1e-9) { out.push(Math.hypot(p.x - a.x, p.y - a.y)); continue; }
        // cross product magnitude / chord length = perpendicular distance from the chord
        const cross = (p.x - a.x) * aby - (p.y - a.y) * abx;
        out.push(Math.abs(cross) / len);
    }
    return out;
}
