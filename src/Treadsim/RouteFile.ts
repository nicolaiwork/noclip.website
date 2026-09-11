export interface RouteStop { name: string; index: number }
export interface RouteWaypoint { x: number; y: number }

/** A route as stored in routes/*.json. Waypoints are game coordinates (x north, y west). */
export interface RouteFile {
    id: string;
    name: string;
    mapId: number;
    wdtFileId: number;
    stops: RouteStop[];
    waypoints: RouteWaypoint[];
}

function isNum(v: unknown): v is number { return typeof v === "number" && Number.isFinite(v); }

/** Validates untrusted JSON. Throws an Error naming the problem. Ensures first/last waypoints are stops. */
export function parseRouteFile(json: unknown): RouteFile {
    const o = json as Record<string, unknown>;
    if (!o || typeof o !== "object") throw new Error("route: not an object");
    if (typeof o.id !== "string" || !o.id) throw new Error("route: missing id");
    if (typeof o.name !== "string" || !o.name) throw new Error("route: missing name");
    if (!isNum(o.mapId)) throw new Error("route: missing mapId");
    if (!isNum(o.wdtFileId)) throw new Error("route: missing wdtFileId");
    if (!Array.isArray(o.waypoints) || o.waypoints.length < 2) throw new Error("route: needs at least two waypoints");
    const waypoints: RouteWaypoint[] = o.waypoints.map((w: any, i: number) => {
        if (!w || !isNum(w.x) || !isNum(w.y)) throw new Error(`route: waypoint ${i} needs numeric x and y`);
        return { x: w.x, y: w.y };
    });
    for (let i = 1; i < waypoints.length; i++) {
        if (Math.hypot(waypoints[i].x - waypoints[i - 1].x, waypoints[i].y - waypoints[i - 1].y) < 1e-6)
            throw new Error(`route: duplicate waypoint at ${i}`);
    }
    const rawStops = Array.isArray(o.stops) ? o.stops : [];
    const stops: RouteStop[] = rawStops.map((s: any, i: number) => {
        if (!s || typeof s.name !== "string" || !Number.isInteger(s.index)) throw new Error(`route: stop ${i} needs name and integer index`);
        if (s.index < 0 || s.index >= waypoints.length) throw new Error(`route: stop index ${s.index} out of range`);
        return { name: s.name, index: s.index };
    });
    for (let i = 1; i < stops.length; i++) {
        if (stops[i].index <= stops[i - 1].index) throw new Error("route: stop indices must be ascending");
    }
    const last = waypoints.length - 1;
    if (stops.length === 0 || stops[0].index !== 0) stops.unshift({ name: "Start", index: 0 });
    if (stops[stops.length - 1].index !== last) stops.push({ name: "End", index: last });
    return { id: o.id, name: o.name, mapId: o.mapId, wdtFileId: o.wdtFileId, stops, waypoints };
}
