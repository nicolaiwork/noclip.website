import { describe, expect, it } from "vitest";
import { RouteDraft, loadDraft, saveDraft, MIN_POINT_SPACING } from "./RouteDraft.js";
import { parseRouteFile } from "./RouteFile.js";

function memStorage() {
    const m = new Map<string, string>();
    return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); } };
}

describe("RouteDraft", () => {
    it("insert appends when nothing is selected, then inserts after the selection and selects the new point", () => {
        const d = new RouteDraft();
        expect(d.insert(0, 0)).toBe(0);
        expect(d.insert(10, 0)).toBe(1);
        expect(d.selected).toBe(1);
        d.select(0);
        expect(d.insert(5, 0)).toBe(1);              // between 0 and the old 1
        expect(d.points.map((p) => p.x)).toEqual([0, 5, 10]);
        expect(d.selected).toBe(1);
        expect(d.version).toBe(3);
    });
    it("rejects points closer than MIN_POINT_SPACING to a neighbour without mutating", () => {
        const d = new RouteDraft();
        d.insert(0, 0); d.insert(10, 0);
        const v = d.version;
        expect(d.insert(10 + MIN_POINT_SPACING / 2, 0)).toBe(-1);
        d.select(0);
        expect(d.insert(0.01, 0.01)).toBe(-1);
        expect(d.length).toBe(2);
        expect(d.version).toBe(v);
    });
    it("remove selects the previous point; move carries the selection and the stop name along", () => {
        const d = new RouteDraft();
        for (let i = 0; i < 4; i++) d.insert(i * 10, 0);
        d.setStop(3, "End");
        expect(d.move(3, 1)).toBe(true);
        expect(d.points.map((p) => p.x)).toEqual([0, 30, 10, 20]);
        expect(d.points[1].stop).toBe("End");
        expect(d.selected).toBe(1);
        expect(d.remove(1)).toBe(true);
        expect(d.points.map((p) => p.x)).toEqual([0, 10, 20]);
        expect(d.selected).toBe(0);
        expect(d.remove(0)).toBe(true); expect(d.remove(0)).toBe(true); expect(d.remove(0)).toBe(true);
        expect(d.length).toBe(0);
        expect(d.selected).toBe(-1);
    });
    it("undo restores points, stops and selection; version still bumps", () => {
        const d = new RouteDraft();
        d.insert(0, 0); d.insert(10, 0);
        d.setStop(1, "B");
        d.setStop(1, "C");
        const v = d.version;
        expect(d.undo()).toBe(true);
        expect(d.points[1]).toEqual({ x: 10, y: 0, stop: "B" });
        expect(d.undo()).toBe(true);
        expect(d.points[1].stop).toBeNull();
        expect(d.version).toBe(v + 2);
        d.undo(); d.undo();
        expect(d.undo()).toBe(false);
        expect(d.length).toBe(0);
    });
    it("recordTick appends only after moving `spacing` units from the last point", () => {
        const d = new RouteDraft();
        expect(d.recordTick(0, 0)).toBe(true);
        expect(d.recordTick(5, 0)).toBe(false);
        expect(d.recordTick(9, 0)).toBe(true);
        d.select(0);                                   // recording ignores the selection: always appends
        expect(d.recordTick(9, 9)).toBe(true);
        expect(d.points.map((p) => [p.x, p.y])).toEqual([[0, 0], [9, 0], [9, 9]]);
    });
    it("toRoute rounds to 2 decimals, emits named stops in order, and parses", () => {
        const d = new RouteDraft();
        d.id = "test-route"; d.name = "Test";
        d.insert(-8913.123456, -137.98765); d.setStop(0, "Abbey");
        d.insert(-8930, -140);
        d.insert(-8950, -150); d.setStop(2, "End");
        const r = d.toRoute();
        expect(r.waypoints[0]).toEqual({ x: -8913.12, y: -137.99 });
        expect(r.stops).toEqual([{ name: "Abbey", index: 0 }, { name: "End", index: 2 }]);
        expect(r.wdtFileId).toBe(775971); expect(r.mapId).toBe(0);
        expect(parseRouteFile(r).stops.length).toBe(2);
        const noStops = new RouteDraft(); noStops.id = "x"; noStops.name = "x"; noStops.insert(0, 0); noStops.insert(1, 1);
        expect(parseRouteFile(noStops.toRoute()).stops.map((s) => s.name)).toEqual(["Start", "End"]);
    });
    it("fromRoute attaches stop names to points and selects the last point", () => {
        const d = RouteDraft.fromRoute({ id: "r", name: "R", mapId: 0, wdtFileId: 775971,
            stops: [{ name: "A", index: 0 }, { name: "C", index: 2 }], waypoints: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }] });
        expect(d.points.map((p) => p.stop)).toEqual(["A", null, "C"]);
        expect(d.selected).toBe(2);
        expect(d.id).toBe("r");
    });
    it("fromRoute carries mapId and wdtFileId through toRoute unchanged", () => {
        const d = RouteDraft.fromRoute({ id: "r", name: "R", mapId: 1, wdtFileId: 1234,
            stops: [], waypoints: [{ x: 0, y: 0 }, { x: 1, y: 0 }] });
        const r = d.toRoute();
        expect(r.mapId).toBe(1);
        expect(r.wdtFileId).toBe(1234);
    });
    it("loadDraft(saveDraft(...)) round-trips mapId and wdtFileId", () => {
        const s = memStorage();
        const d = RouteDraft.fromRoute({ id: "r", name: "R", mapId: 1, wdtFileId: 1234,
            stops: [], waypoints: [{ x: 0, y: 0 }, { x: 1, y: 0 }] });
        saveDraft(s, d);
        const back = loadDraft(s)!;
        const r = back.toRoute();
        expect(r.mapId).toBe(1);
        expect(r.wdtFileId).toBe(1234);
    });
    it("round-trips through localStorage and rejects garbage", () => {
        const s = memStorage();
        const d = new RouteDraft(); d.id = "abc"; d.insert(1, 2); d.setStop(0, "S"); d.select(-1);
        saveDraft(s, d);
        const back = loadDraft(s)!;
        expect(back.toJSON()).toEqual({ id: "abc", name: "New route", mapId: 0, wdtFileId: 775971, points: [{ x: 1, y: 2, stop: "S" }], selected: -1 });
        expect(loadDraft(memStorage())).toBeNull();
        const bad = memStorage(); bad.setItem("treadsim.editorDraft", JSON.stringify({ id: 1, points: [{ x: "a" }] }));
        expect(loadDraft(bad)).toBeNull();
    });
    it("move rejects when the moved point would be too close to its new neighbors", () => {
        const d = new RouteDraft();
        d.insert(0, 0);          // A = (0, 0)
        d.insert(1000, 0);       // B = (1000, 0)
        d.insert(2000, 0);       // C = (2000, 0)
        d.insert(0.001, 0.001);  // D = (0.001, 0.001) - appended after C
        const v = d.version;
        const origPoints = d.points.map((p) => ({ ...p }));
        expect(d.move(3, 1)).toBe(false);  // Try to move D between A and B
        expect(d.version).toBe(v);  // Version unchanged
        expect(d.points).toEqual(origPoints);  // Order unchanged
        // Verify that toRoute still produces a valid file
        const route = d.toRoute();
        expect(parseRouteFile(route).stops.length).toBeGreaterThanOrEqual(2);
    });
    it("remove rejects when it would make adjacent points closer than MIN_POINT_SPACING", () => {
        const d = RouteDraft.fromJSON({
            id: "test",
            name: "Test",
            points: [
                { x: 0, y: 0, stop: null },
                { x: 0.02, y: 0, stop: null },
                { x: 0.03, y: 0, stop: null }
            ],
            selected: 2
        })!;
        const v = d.version;
        expect(d.remove(1)).toBe(false);
        expect(d.length).toBe(3);
        expect(d.version).toBe(v);
    });
    it("move and remove return true for valid operations", () => {
        const d = new RouteDraft();
        for (let i = 0; i < 4; i++) d.insert(i * 10, 0);
        const v1 = d.version;
        expect(d.move(3, 0)).toBe(true);
        expect(d.version).toBe(v1 + 1);
        expect(d.points.map((p) => p.x)).toEqual([30, 0, 10, 20]);
        const v2 = d.version;
        expect(d.remove(1)).toBe(true);
        expect(d.version).toBe(v2 + 1);
        expect(d.length).toBe(3);
    });
});
