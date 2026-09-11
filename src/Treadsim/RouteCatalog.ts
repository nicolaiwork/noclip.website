import { parseRouteFile, type RouteFile } from "./RouteFile.js";

/** Served by the rsbuild dev server from the repo's routes/ directory (see rsbuild.config.ts). */
export const ROUTES_URL = "/routes/";

export function parseListing(text: string): string[] {
    return text.split("\n").map((l) => l.trim()).filter((l) => l.endsWith(".json")).sort();
}

export async function loadCatalog(fetchFn: typeof fetch = fetch): Promise<{ file: string; route: RouteFile }[]> {
    let files: string[];
    try {
        const r = await fetchFn(ROUTES_URL);
        if (!r.ok) return [];
        files = parseListing(await r.text());
    } catch (e) { console.warn("treadsim: route listing unavailable", e); return []; }
    const out: { file: string; route: RouteFile }[] = [];
    for (const file of files) {
        try {
            const r = await fetchFn(ROUTES_URL + file);
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            out.push({ file, route: parseRouteFile(await r.json()) });
        } catch (e) { console.warn(`treadsim: skipping route ${file}:`, e); }
    }
    return out;
}
