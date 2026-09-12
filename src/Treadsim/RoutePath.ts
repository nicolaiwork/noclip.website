import { adtTileCoord } from "./coords.js";
import type { RouteStop, RouteWaypoint } from "./RouteFile.js";
import { DEFAULT_SMOOTHING, smoothWaypoints, type SmoothingOptions } from "./RouteSmoothing.js";

const ALPHA = 0.5; // centripetal Catmull-Rom

// Same value as RouteQuality.MAX_GAP (15 u) and the same reason: past this distance the closing
// segment reads as a separate, unauthored stretch of road rather than a seam. Duplicated (not
// imported) because RouteQuality.ts imports RoutePath.ts — importing back would be a cycle.
export const MAX_LOOP_SEAM = 15;

function catmullRom(p0: RouteWaypoint, p1: RouteWaypoint, p2: RouteWaypoint, p3: RouteWaypoint, u: number): [number, number] {
    // Barry–Goldman pyramid with knot spacing |Pi+1 - Pi|^alpha. u in [0,1] maps to [t1,t2].
    const d = (a: RouteWaypoint, b: RouteWaypoint) => Math.pow(Math.hypot(b.x - a.x, b.y - a.y), ALPHA);
    const t0 = 0, t1 = t0 + d(p0, p1), t2 = t1 + d(p1, p2), t3 = t2 + d(p2, p3);
    const t = t1 + (t2 - t1) * u;
    const lerp = (a: [number, number], b: [number, number], ta: number, tb: number): [number, number] => {
        const w = (t - ta) / (tb - ta);
        return [a[0] + (b[0] - a[0]) * w, a[1] + (b[1] - a[1]) * w];
    };
    const P = (p: RouteWaypoint): [number, number] => [p.x, p.y];
    const a1 = lerp(P(p0), P(p1), t0, t1), a2 = lerp(P(p1), P(p2), t1, t2), a3 = lerp(P(p2), P(p3), t2, t3);
    const b1 = lerp(a1, a2, t0, t2), b2 = lerp(a2, a3, t1, t3);
    return lerp(b1, b2, t1, t2);
}

/**
 * A route sampled into a dense polyline (default 0.5 unit spacing) with cumulative
 * arc length, so progress along the route is a single number `s`. Game coordinates.
 */
export class RoutePath {
    private xs: number[] = [];
    private ys: number[] = [];
    private cum: number[] = [];
    public readonly waypointS: number[] = [];
    public readonly stopS: number[];
    public readonly lengthTotal: number;

    constructor(rawWaypoints: RouteWaypoint[], public readonly stops: RouteStop[], spacing = 0.5, smoothing: SmoothingOptions | false = DEFAULT_SMOOTHING, opts: { closed?: boolean } = {}) {
        if (rawWaypoints.length < 2) throw new Error("RoutePath: needs at least two waypoints");
        const closed = opts.closed ?? false;
        const waypoints = smoothing === false ? rawWaypoints : smoothWaypoints(rawWaypoints, stops, smoothing);
        const n = waypoints.length;
        // Open: the Catmull-Rom neighbour past either end is a reflected phantom point (there is
        // no real waypoint there). Closed: there is no open end — the spline wraps, so the
        // neighbour across the seam is the real wrap-around waypoint, and a closing segment from
        // the last waypoint back to the first is part of the loop.
        const at = (i: number): RouteWaypoint => {
            if (closed) return waypoints[((i % n) + n) % n];
            if (i < 0) return { x: 2 * waypoints[0].x - waypoints[1].x, y: 2 * waypoints[0].y - waypoints[1].y };
            if (i >= n) return { x: 2 * waypoints[n - 1].x - waypoints[n - 2].x, y: 2 * waypoints[n - 1].y - waypoints[n - 2].y };
            return waypoints[i];
        };
        const segCount = closed ? n : n - 1;
        this.push(waypoints[0].x, waypoints[0].y);
        this.waypointS.push(0);
        for (let i = 0; i < segCount; i++) {
            const p1 = at(i), p2 = at(i + 1);
            const chord = Math.hypot(p2.x - p1.x, p2.y - p1.y);
            const steps = Math.max(1, Math.ceil(chord / spacing));
            for (let k = 1; k <= steps; k++) {
                const [x, y] = catmullRom(at(i - 1), at(i), at(i + 1), at(i + 2), k / steps);
                this.push(x, y);
            }
            // The closing segment (i === n-1 when closed) ends back at waypoint 0, already
            // recorded at s=0 above; it is not a new original waypoint, so no waypointS entry.
            if (!(closed && i === n - 1)) this.waypointS.push(this.cum[this.cum.length - 1]);
        }
        this.lengthTotal = this.cum[this.cum.length - 1];
        this.stopS = stops.map((s) => this.waypointS[s.index]);
    }

    private push(x: number, y: number): void {
        const i = this.xs.length;
        this.xs.push(x); this.ys.push(y);
        this.cum.push(i === 0 ? 0 : this.cum[i - 1] + Math.hypot(x - this.xs[i - 1], y - this.ys[i - 1]));
    }

    /** Index i with cum[i] <= s < cum[i+1], clamped to [0, len-2]. */
    private segment(s: number): number {
        let lo = 0, hi = this.cum.length - 2;
        while (lo < hi) {
            const mid = (lo + hi + 1) >> 1;
            if (this.cum[mid] <= s) lo = mid; else hi = mid - 1;
        }
        return lo;
    }

    public positionAt(s: number): [number, number] {
        s = Math.max(0, Math.min(this.lengthTotal, s));
        const i = this.segment(s);
        const len = this.cum[i + 1] - this.cum[i];
        const w = len > 0 ? (s - this.cum[i]) / len : 0;
        return [this.xs[i] + (this.xs[i + 1] - this.xs[i]) * w, this.ys[i] + (this.ys[i + 1] - this.ys[i]) * w];
    }

    public tangentAt(s: number): [number, number] {
        s = Math.max(0, Math.min(this.lengthTotal, s));
        const i = this.segment(s);
        const dx = this.xs[i + 1] - this.xs[i], dy = this.ys[i + 1] - this.ys[i];
        const len = Math.hypot(dx, dy) || 1;
        return [dx / len, dy / len];
    }

    public nextStopAfter(s: number): number | undefined {
        for (let i = 0; i < this.stopS.length; i++) if (this.stopS[i] > s + 1e-9) return i;
        return undefined;
    }

    /**
     * True when closing `waypoints` into a loop (last waypoint back to the first) would be a
     * short seam rather than a cross-country leg — the gate `onStart` uses before passing
     * `{ closed: true }` to the constructor (final review Important 2: Loop must not silently
     * splice a multi-hundred-metre off-road return onto a point-to-point route).
     */
    public static isClosable(waypoints: RouteWaypoint[], maxSeam = MAX_LOOP_SEAM): boolean {
        if (waypoints.length < 3) return false;
        const first = waypoints[0], last = waypoints[waypoints.length - 1];
        return Math.hypot(last.x - first.x, last.y - first.y) <= maxSeam;
    }

    public tileCoords(): [number, number][] {
        const seen = new Set<string>();
        const out: [number, number][] = [];
        for (let i = 0; i < this.xs.length; i++) {
            const c = adtTileCoord(this.xs[i], this.ys[i]);
            const key = `${c[0]},${c[1]}`;
            if (!seen.has(key)) { seen.add(key); out.push(c); }
        }
        return out;
    }
}
