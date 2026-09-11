import { RoutePath } from "./RoutePath.js";
import type { RouteStop, RouteWaypoint } from "./RouteFile.js";
import { lateralOffsets } from "./RouteSmoothing.js";

/**
 * Route quality scan (Phase 3 final review, recommendation 2). A sideways waypoint bends the
 * spline hard: heading changes of 50+ degrees per unit of s, where a real 90-degree road
 * corner at 8 u spacing measures ~36. Spikes on declared stops are reported but the CI gate
 * exempts them (stops sit on genuine corners like the Goldshire crossroads, 85 deg/u).
 */
export const SPIKE_THRESHOLD_DEG = 45;
export const MAX_GAP = 15;
export const MIN_GAP = 1;

export interface HeadingSpike { s: number; waypoint: number; degPerUnit: number; atStop: boolean }
export interface GapIssue { from: number; to: number; gap: number }
export interface JitterStats { median: number; p90: number; max: number }
export interface RouteReport { spikes: HeadingSpike[]; gaps: GapIssue[]; jitter: JitterStats }

function wrapDeg(d: number): number { return ((d + 540) % 360) - 180; }

function nearestWaypoint(path: RoutePath, s: number): number {
    let best = 0;
    for (let i = 1; i < path.waypointS.length; i++) if (Math.abs(path.waypointS[i] - s) < Math.abs(path.waypointS[best] - s)) best = i;
    return best;
}

/** Samples the tangent every `step` units and groups consecutive over-threshold samples into one spike (its peak). */
export function headingSpikes(path: RoutePath, threshold = SPIKE_THRESHOLD_DEG, step = 1): HeadingSpike[] {
    const out: HeadingSpike[] = [];
    let prev: number | null = null;
    let cur: HeadingSpike | null = null;
    for (let s = 0; s <= path.lengthTotal + 1e-9; s += step) {
        const [tx, ty] = path.tangentAt(Math.min(s, path.lengthTotal));
        const h = Math.atan2(ty, tx) * 180 / Math.PI;
        if (prev !== null) {
            const d = Math.abs(wrapDeg(h - prev)) / step;
            if (d > threshold) {
                if (cur === null || d > cur.degPerUnit) cur = { s, waypoint: nearestWaypoint(path, s), degPerUnit: d, atStop: false };
            } else if (cur !== null) { out.push(cur); cur = null; }
        }
        prev = h;
    }
    if (cur !== null) out.push(cur);
    for (const sp of out) sp.atStop = path.stops.some((st) => st.index === sp.waypoint);
    return out;
}

export function gapIssues(waypoints: RouteWaypoint[], maxGap = MAX_GAP, minGap = MIN_GAP): GapIssue[] {
    const out: GapIssue[] = [];
    for (let i = 1; i < waypoints.length; i++) {
        const gap = Math.hypot(waypoints[i].x - waypoints[i - 1].x, waypoints[i].y - waypoints[i - 1].y);
        if (gap > maxGap || gap < minGap) out.push({ from: i - 1, to: i, gap: Math.round(gap * 100) / 100 });
    }
    return out;
}

function jitterStats(waypoints: RouteWaypoint[]): JitterStats {
    const offsets = lateralOffsets(waypoints);
    if (offsets.length === 0) return { median: 0, p90: 0, max: 0 };
    const sorted = [...offsets].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    const p90 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.9))];
    const max = sorted[sorted.length - 1];
    return { median, p90, max };
}

export function reportRoute(waypoints: RouteWaypoint[], stops: RouteStop[]): RouteReport {
    if (waypoints.length < 2) return { spikes: [], gaps: [], jitter: { median: 0, p90: 0, max: 0 } };
    // Judged on the smoothed path the follower actually drives; jitter itself is informational
    // and measured on the raw clicked waypoints.
    return { spikes: headingSpikes(new RoutePath(waypoints, stops)), gaps: gapIssues(waypoints), jitter: jitterStats(waypoints) };
}
