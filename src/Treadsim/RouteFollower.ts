import type { RoutePath } from "./RoutePath.js";
import type { RouteStop } from "./RouteFile.js";

export interface FollowerPose { x: number; y: number; yaw: number }
export interface FollowerEvents { arrived?(stop: RouteStop, index: number): void; finished?(): void }
export interface FollowerOptions { loop?: boolean; lookAhead?: number; maxYawRate?: number }

export const DEFAULT_LOOK_AHEAD = 8;
export const DEFAULT_MAX_YAW_RATE = 45 * Math.PI / 180;

function wrapAngle(a: number): number {
    a = (a + Math.PI) % (2 * Math.PI);
    if (a < 0) a += 2 * Math.PI;
    return a - Math.PI;
}

/**
 * Owns progress `s` along a RoutePath. Each update moves by speed * worldScale * dt,
 * fires `arrived` when a stop is passed, `finished` (and holds) at the last stop unless
 * looping. Heading is the tangent `lookAhead` units ahead, slewed at most `maxYawRate`.
 * Coordinates are game space; `yaw` is the noclip yaw (see plan Reference: atan2(ty, tx)).
 */
export class RouteFollower {
    public s = 0;
    private _finished = false;
    private heading: number | null = null;
    private nextStop = 1;
    private readonly loop: boolean;
    private readonly lookAhead: number;
    private readonly maxYawRate: number;

    constructor(public readonly path: RoutePath, opts: FollowerOptions = {}, private events: FollowerEvents = {}) {
        this.loop = opts.loop ?? false;
        this.lookAhead = opts.lookAhead ?? DEFAULT_LOOK_AHEAD;
        this.maxYawRate = opts.maxYawRate ?? DEFAULT_MAX_YAW_RATE;
    }

    public get finished(): boolean { return this._finished; }
    // In loop mode, nextStop can transiently overflow past the last stop's index between firing
    // its `arrived` and the position wrap at lengthTotal (the closing-segment gap on a closed
    // path) — clamp to undefined rather than expose an out-of-range index.
    public get nextStopIndex(): number | undefined {
        if (this._finished) return undefined;
        return this.nextStop <= this.path.stops.length - 1 ? this.nextStop : undefined;
    }

    public distanceToNextStop(): number | undefined {
        const i = this.nextStopIndex;
        return i === undefined ? undefined : this.path.stopS[i] - this.s;
    }

    public reset(): void { this.s = 0; this._finished = false; this.heading = null; this.nextStop = 1; }

    public update(dtSeconds: number, speedMps: number, worldScale: number): FollowerPose {
        if (!this._finished) this.advance(speedMps * worldScale * dtSeconds);
        const [x, y] = this.path.positionAt(this.s);
        const L = this.path.lengthTotal;
        const ahead = this.loop && L > 0 ? (((this.s + this.lookAhead) % L) + L) % L : Math.min(L, this.s + this.lookAhead);
        const [tx, ty] = this.path.tangentAt(ahead);
        const target = Math.atan2(ty, tx);
        if (this.heading === null) this.heading = target;
        else {
            const delta = wrapAngle(target - this.heading);
            const maxStep = this.maxYawRate * dtSeconds;
            this.heading = wrapAngle(this.heading + Math.max(-maxStep, Math.min(maxStep, delta)));
        }
        return { x, y, yaw: this.heading };
    }

    private advance(ds: number): void {
        if (ds <= 0) return;
        const L = this.path.lengthTotal;
        let s = this.s + ds;
        const last = this.path.stops.length - 1;
        while (this.nextStop <= last && s >= this.path.stopS[this.nextStop] - 1e-9) {
            const i = this.nextStop;
            this.events.arrived?.(this.path.stops[i], i);
            if (i === last && !this.loop) {
                this.s = L; this._finished = true; this.events.finished?.(); return;
            }
            this.nextStop++;
        }
        // Loop mode wraps on reaching the end of the path (lengthTotal), not on reaching the
        // last stop: on a closed RoutePath the last stop sits before lengthTotal (the closing
        // segment is real distance still to walk), so wrapping on the stop instead would skip
        // it and teleport across the seam. Stop 0 is the start and is not re-fired on wrap;
        // stops from index 1 fire again on the next lap.
        if (this.loop && L > 0) { while (s >= L) { s -= L; this.nextStop = 1; } }
        this.s = Math.max(0, Math.min(L, s));
    }
}
