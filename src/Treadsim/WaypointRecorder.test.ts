import { describe, expect, it } from "vitest";
import { WaypointRecorder } from "./WaypointRecorder.js";

describe("WaypointRecorder", () => {
    it("samples a waypoint every `spacing` units of movement while active", () => {
        let pos: [number, number] = [0, 0];
        const r = new WaypointRecorder(() => pos, 8);
        r.tick(); // inactive: nothing
        r.start();
        r.tick();               // first sample at start
        pos = [5, 0]; r.tick(); // < 8: skipped
        pos = [9, 0]; r.tick(); // >= 8 from (0,0)
        pos = [9, 7]; r.tick(); // 7 from (9,0): skipped
        pos = [9, 9]; r.tick();
        expect(r.waypoints).toEqual([{ x: 0, y: 0 }, { x: 9, y: 0 }, { x: 9, y: 9 }]);
    });
    it("mark() adds the current position if moved and records a stop at the last index; undo drops the last waypoint", () => {
        let pos: [number, number] = [0, 0];
        const r = new WaypointRecorder(() => pos, 8);
        r.start(); r.tick();
        r.mark("Start");
        pos = [3, 0]; r.mark("Near");
        expect(r.waypoints).toEqual([{ x: 0, y: 0 }, { x: 3, y: 0 }]);
        expect(r.stops).toEqual([{ name: "Start", index: 0 }, { name: "Near", index: 1 }]);
        r.undo();
        expect(r.waypoints.length).toBe(1);
        expect(r.stops).toEqual([{ name: "Start", index: 0 }]);
    });
    it("toRoute produces a file that parses, rounding coordinates to 2 decimals", () => {
        let pos: [number, number] = [-8913.123456, -137.98765];
        const r = new WaypointRecorder(() => pos, 8);
        r.start(); r.tick(); r.mark("Abbey");
        pos = [-8930, -140]; r.tick(); r.mark("End");
        const route = r.toRoute("test", "Test");
        expect(route.waypoints[0]).toEqual({ x: -8913.12, y: -137.99 });
        expect(route.stops.map((s) => s.name)).toEqual(["Abbey", "End"]);
        expect(route.wdtFileId).toBe(775971);
    });
});
