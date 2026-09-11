import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseRouteFile } from "./RouteFile.js";
import { reportRoute } from "./RouteQuality.js";

// The repo's routes/ directory (renderer is a submodule at <root>/renderer).
const dir = fileURLToPath(new URL("../../../routes/", import.meta.url));
const files = readdirSync(dir).filter((f) => f.endsWith(".json")).sort();

describe("routes/*.json", () => {
    it("contains at least one route", () => { expect(files.length).toBeGreaterThan(0); });
    for (const file of files) {
        it(`${file}: parses, id matches the file name, no waypoint gaps, no heading spikes off-stop`, () => {
            const route = parseRouteFile(JSON.parse(readFileSync(dir + file, "utf8")));
            expect(`${route.id}.json`).toBe(file);
            const report = reportRoute(route.waypoints, route.stops);
            expect(report.gaps).toEqual([]);
            // spikes at declared stops are genuine corners (Goldshire crossroads: 85 deg/u)
            expect(report.spikes.filter((s) => !s.atStop)).toEqual([]);
        });
    }
});
