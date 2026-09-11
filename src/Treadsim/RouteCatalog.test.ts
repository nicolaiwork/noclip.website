import { describe, expect, it } from "vitest";
import { loadCatalog, parseListing } from "./RouteCatalog.js";

describe("parseListing", () => {
    it("keeps only .json entries, sorted", () => {
        expect(parseListing("b.json\nREADME.md\na.json\n\n")).toEqual(["a.json", "b.json"]);
    });
});

describe("loadCatalog", () => {
    const good = { id: "r1", name: "Route 1", mapId: 0, wdtFileId: 775971, stops: [], waypoints: [{ x: 0, y: 0 }, { x: 1, y: 0 }] };
    const fetchFn = (async (url: string) => {
        if (url === "/routes/") return { ok: true, text: async () => "bad.json\nr1.json\n" };
        if (url === "/routes/r1.json") return { ok: true, json: async () => good };
        if (url === "/routes/bad.json") return { ok: true, json: async () => ({ id: "x" }) };
        return { ok: false, status: 404 };
    }) as any;
    it("returns parsed routes and skips invalid files", async () => {
        const cat = await loadCatalog(fetchFn);
        expect(cat.routes.map((c) => c.file)).toEqual(["r1.json"]);
        expect(cat.routes[0].route.stops.length).toBe(2); // Start/End added by parseRouteFile
    });
    it("reports invalid files as errors", async () => {
        const cat = await loadCatalog(fetchFn);
        expect(cat.errors).toEqual([{ file: "bad.json", message: expect.stringMatching(/route: /) }]);
    });
    it("returns an empty catalog when the listing is unavailable", async () => {
        expect(await loadCatalog((async () => ({ ok: false, status: 404 })) as any)).toEqual({ routes: [], errors: [] });
    });
});
