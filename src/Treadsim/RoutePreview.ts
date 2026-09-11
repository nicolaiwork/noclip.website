import { vec3 } from "gl-matrix";
import { DebugDrawFlags, type DebugDraw } from "../gfx/helpers/DebugDraw.js";
import { colorNewFromRGBA } from "../Color.js";
import type { RouteDraft } from "./RouteDraft.js";
import { noclipFromAdt } from "./coords.js";
import { pointHeights, samplePreview, type PreviewSample } from "./RoutePreviewSamples.js";

const PATH = colorNewFromRGBA(0.3, 0.9, 1.0, 1);
const POINT = colorNewFromRGBA(1.0, 0.9, 0.2, 1);
const STOP = colorNewFromRGBA(1.0, 0.55, 0.1, 1);
const SELECTED = colorNewFromRGBA(0.3, 1.0, 0.3, 1);
const WARN = colorNewFromRGBA(1.0, 0.25, 0.2, 1);
const MARKER = colorNewFromRGBA(1, 1, 1, 1);
const LIFT = 0.4;              // draw slightly above the terrain so lines are not z-fought away
const MAX_SEGMENTS = 20000;
const UP = vec3.fromValues(0, 1, 0);   // noclip up

/**
 * Draws the editor's route through noclip's DebugDraw (noclip world space): the spline as a
 * line strip on the terrain, a locator per waypoint (stops larger and labelled, the selected
 * one green, ones with a quality warning red) and a disc under the camera where Space drops.
 * Samples and heights are cached per draft version and per loaded-tile count.
 */
export class RoutePreview {
    private cache: { version: number; adtCount: number; samples: PreviewSample[]; heights: (number | undefined)[] } | null = null;

    constructor(private heightAt: (x: number, y: number) => number | undefined) {}

    public draw(dd: DebugDraw, draft: RouteDraft, adtCount: number, warnings: ReadonlySet<number>, marker?: [number, number, number]): void {
        if (!this.cache || this.cache.version !== draft.version || this.cache.adtCount !== adtCount) {
            this.cache = { version: draft.version, adtCount, samples: samplePreview(draft.points, this.heightAt), heights: pointHeights(draft.points, this.heightAt) };
        }
        const { samples, heights } = this.cache;
        const p = (s: { x: number; y: number }, z: number) => noclipFromAdt([s.x, s.y, z + LIFT]);

        let segments = 0;
        for (let i = 1; i < samples.length && segments < MAX_SEGMENTS; i++) if (samples[i - 1].z !== undefined && samples[i].z !== undefined) segments++;
        if (segments > 0) {
            dd.beginBatchLine(segments);
            let drawn = 0;
            for (let i = 1; i < samples.length && drawn < segments; i++) {
                const a = samples[i - 1], b = samples[i];
                if (a.z === undefined || b.z === undefined) continue;
                dd.drawLine(p(a, a.z), p(b, b.z), PATH);
                drawn++;
            }
            dd.endBatch();
        }

        for (let i = 0; i < draft.points.length; i++) {
            const z = heights[i];
            if (z === undefined) continue;
            const pt = draft.points[i];
            const color = i === draft.selected ? SELECTED : warnings.has(i) ? WARN : pt.stop !== null ? STOP : POINT;
            const pos = p(pt, z);
            dd.drawLocator(pos, pt.stop !== null ? 1.5 : 0.7, color);
            if (pt.stop !== null) {
                const label = vec3.fromValues(pos[0], pos[1] + 2.5, pos[2]);
                dd.drawWorldText(pt.stop, label, STOP, { flags: DebugDrawFlags.Default, fontSize: 24 });
            }
        }

        if (marker) dd.drawDiscLineN(noclipFromAdt([marker[0], marker[1], marker[2] + LIFT]), UP, 1.0, MARKER, 24);
    }
}
