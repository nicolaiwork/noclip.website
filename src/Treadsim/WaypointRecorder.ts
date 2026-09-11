import type { RouteFile, RouteStop, RouteWaypoint } from "./RouteFile.js";

/**
 * Console helper for authoring routes: free-roam along a road with the recorder active
 * and it drops a waypoint every `spacing` game units. `mark(name)` turns the current
 * position into a stop. `toRoute()` gives JSON for routes/*.json. (Phase 4's editor
 * grows out of this.)
 */
export class WaypointRecorder {
    public readonly waypoints: RouteWaypoint[] = [];
    public readonly stops: RouteStop[] = [];
    public active = false;

    constructor(private getPosition: () => [number, number], private spacing = 8) {}

    public start(): void { this.active = true; }
    public stop(): void { this.active = false; }

    public tick(): void {
        if (!this.active) return;
        const [x, y] = this.getPosition();
        const last = this.waypoints[this.waypoints.length - 1];
        if (!last || Math.hypot(x - last.x, y - last.y) >= this.spacing) this.waypoints.push({ x, y });
    }

    public mark(name: string): void {
        const [x, y] = this.getPosition();
        const last = this.waypoints[this.waypoints.length - 1];
        if (!last || Math.hypot(x - last.x, y - last.y) > 1e-6) this.waypoints.push({ x, y });
        const index = this.waypoints.length - 1;
        const existing = this.stops.findIndex((s) => s.index === index);
        if (existing >= 0) this.stops[existing] = { name, index }; else this.stops.push({ name, index });
    }

    public undo(): void {
        if (this.waypoints.length === 0) return;
        const index = this.waypoints.length - 1;
        this.waypoints.pop();
        const i = this.stops.findIndex((s) => s.index === index);
        if (i >= 0) this.stops.splice(i, 1);
    }

    public toRoute(id: string, name: string, wdtFileId = 775971, mapId = 0): RouteFile {
        const r2 = (v: number) => Math.round(v * 100) / 100;
        return {
            id, name, mapId, wdtFileId,
            stops: this.stops.map((s) => ({ ...s })),
            waypoints: this.waypoints.map((w) => ({ x: r2(w.x), y: r2(w.y) })),
        };
    }
}
