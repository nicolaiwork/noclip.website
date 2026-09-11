import { describe, expect, it } from "vitest";
import { parseRouteFile } from "./RouteFile.js";

const good = {
    id: "r", name: "R", mapId: 0, wdtFileId: 775971,
    stops: [{ name: "A", index: 0 }, { name: "B", index: 2 }],
    waypoints: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 20, y: 5 }],
};

describe("parseRouteFile", () => {
    it("accepts a valid file", () => {
        expect(parseRouteFile(good).stops[1].name).toBe("B");
    });
    it("adds the first and last waypoints as stops when missing", () => {
        const r = parseRouteFile({ ...good, stops: [{ name: "Mid", index: 1 }] });
        expect(r.stops.map((s) => s.index)).toEqual([0, 1, 2]);
        expect(r.stops[0].name).toBe("Start");
        expect(r.stops[2].name).toBe("End");
    });
    it("rejects fewer than two waypoints", () => {
        expect(() => parseRouteFile({ ...good, waypoints: [{ x: 0, y: 0 }] })).toThrow(/at least two waypoints/);
    });
    it("rejects consecutive duplicate waypoints", () => {
        expect(() => parseRouteFile({ ...good, waypoints: [{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 1, y: 1 }] })).toThrow(/duplicate/);
    });
    it("rejects stops pointing outside the waypoint list and unsorted stops", () => {
        expect(() => parseRouteFile({ ...good, stops: [{ name: "X", index: 7 }] })).toThrow(/stop index/);
        expect(() => parseRouteFile({ ...good, stops: [{ name: "B", index: 2 }, { name: "A", index: 1 }] })).toThrow(/ascending/);
    });
    it("rejects missing or non-numeric fields", () => {
        expect(() => parseRouteFile({ ...good, waypoints: [{ x: 0, y: "a" }, { x: 1, y: 1 }] })).toThrow(/waypoint/);
        expect(() => parseRouteFile({ ...good, id: undefined })).toThrow(/id/);
    });
});
