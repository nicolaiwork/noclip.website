import { parseRouteFile, type RouteFile } from "./RouteFile.js";

/** Served by the rsbuild dev server from the repo's routes/ directory (see rsbuild.config.ts). */
export const ROUTES_URL = "/routes/";

export function parseListing(text: string): string[] {
    return text.split("\n").map((l) => l.trim()).filter((l) => l.endsWith(".json")).sort();
}

export interface RouteCatalogEntry { file: string; route: RouteFile }
export interface RouteCatalogError { file: string; message: string }
export interface RouteCatalogResult { routes: RouteCatalogEntry[]; errors: RouteCatalogError[] }

export async function loadCatalog(fetchFn: typeof fetch = fetch): Promise<RouteCatalogResult> {
    let files: string[];
    try {
        const r = await fetchFn(ROUTES_URL);
        if (!r.ok) return { routes: [], errors: [] };
        files = parseListing(await r.text());
    } catch (e) { console.warn("treadsim: route listing unavailable", e); return { routes: [], errors: [] }; }
    const routes: RouteCatalogEntry[] = [];
    const errors: RouteCatalogError[] = [];
    for (const file of files) {
        try {
            const r = await fetchFn(ROUTES_URL + file);
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            routes.push({ file, route: parseRouteFile(await r.json()) });
        } catch (e) {
            console.warn(`treadsim: skipping route ${file}:`, e);
            errors.push({ file, message: e instanceof Error ? e.message : String(e) });
        }
    }
    return { routes, errors };
}

/** Route ids double as file names under routes/: lowercase slugs only. */
export const ROUTE_ID_RE = /^[a-z0-9][a-z0-9-]*$/;
export function routeFileName(id: string): string { return `${id}.json`; }

/** Writes the route into the repo's routes/ directory through the dev server (PUT /routes/<id>.json). */
export async function saveRoute(route: RouteFile, fetchFn: typeof fetch = fetch): Promise<string> {
    if (!ROUTE_ID_RE.test(route.id)) throw new Error(`route id must match ${ROUTE_ID_RE} (got "${route.id}")`);
    const file = routeFileName(route.id);
    const r = await fetchFn(ROUTES_URL + file, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(route, null, 2) + "\n" });
    if (!r.ok) throw new Error(`save failed: HTTP ${r.status}`);
    return file;
}
