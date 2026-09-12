import type { RouteFile, RouteStop, RouteWaypoint } from "./RouteFile.js";

export interface DraftPoint { x: number; y: number; stop: string | null }
export interface DraftState { id: string; name: string; mapId: number; wdtFileId: number; points: DraftPoint[]; selected: number }

/** Every pair of consecutive points created through insert/insertAt/move/update is at least this far apart. */
export const MIN_POINT_SPACING = 0.05;
/** Distance between waypoints when recording while flying (same as the Phase 3 recorder). */
export const RECORD_SPACING = 8;
export const DRAFT_KEY = "treadsim.editorDraft";
const MAX_HISTORY = 100;

const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);

/**
 * The route editor's model: an ordered list of points, each optionally a named stop, a
 * selection that says where the next dropped point goes, and an undo history. Points created
 * through insert/insertAt/move/remove maintain the invariant that every pair of consecutive
 * points is at least MIN_POINT_SPACING apart; fromJSON/fromRoute accept whatever points they
 * are given, and Save is what actually enforces validity, by re-validating through parseRouteFile.
 * Pure and DOM-free; the panel and the preview re-render whenever `version` changes.
 */
export class RouteDraft {
    public id = "new-route";
    public name = "New route";
    public mapId = 0;
    public wdtFileId = 775971;
    public points: DraftPoint[] = [];
    /** New points are inserted after this index; -1 means "append". */
    public selected = -1;
    /** Increments on every point mutation and on undo (not on select). */
    public version = 0;
    public onChange: (() => void) | null = null;
    private history: DraftState[] = [];

    public get length(): number { return this.points.length; }

    private snapshot(): DraftState {
        return { id: this.id, name: this.name, mapId: this.mapId, wdtFileId: this.wdtFileId, points: this.points.map((p) => ({ ...p })), selected: this.selected };
    }

    private restore(s: DraftState): void {
        this.id = s.id; this.name = s.name;
        this.mapId = s.mapId; this.wdtFileId = s.wdtFileId;
        this.points = s.points.map((p) => ({ ...p }));
        this.selected = s.selected;
    }

    private mutate<T>(fn: () => T): T {
        this.history.push(this.snapshot());
        if (this.history.length > MAX_HISTORY) this.history.shift();
        const r = fn();
        this.selected = Math.max(-1, Math.min(this.selected, this.points.length - 1));
        this.version++;
        this.onChange?.();
        return r;
    }

    /** True if (x, y) is within MIN_POINT_SPACING of the points that would neighbour index i (excluding `skip`). */
    private tooClose(i: number, x: number, y: number, skip = -1): boolean {
        for (const j of [i - 1, i]) {
            if (j === skip || j < 0 || j >= this.points.length) continue;
            if (dist(this.points[j], { x, y }) < MIN_POINT_SPACING) return true;
        }
        return false;
    }

    public insertAt(i: number, x: number, y: number): number {
        i = Math.max(0, Math.min(this.points.length, i));
        if (this.tooClose(i, x, y)) return -1;
        return this.mutate(() => { this.points.splice(i, 0, { x, y, stop: null }); this.selected = i; return i; });
    }

    public insert(x: number, y: number): number {
        return this.insertAt(this.selected < 0 ? this.points.length : this.selected + 1, x, y);
    }

    public remove(i: number): boolean {
        if (i < 0 || i >= this.points.length) return false;
        // Check if removing i would make i-1 and i+1 too close to each other
        if (i > 0 && i < this.points.length - 1) {
            if (dist(this.points[i - 1], this.points[i + 1]) < MIN_POINT_SPACING) {
                return false;
            }
        }
        this.mutate(() => {
            this.points.splice(i, 1);
            this.selected = this.points.length === 0 ? -1 : Math.max(0, i - 1);
        });
        return true;
    }

    /** Moves point i to index j (both in [0, length)); the selection follows the moved point. Returns false if the move would violate MIN_POINT_SPACING. */
    public move(i: number, j: number): boolean {
        const n = this.points.length;
        if (i < 0 || i >= n || j < 0 || j >= n || i === j) return false;

        // Check if removing i would make i-1 and i+1 too close
        if (i > 0 && i < n - 1) {
            if (dist(this.points[i - 1], this.points[i + 1]) < MIN_POINT_SPACING) {
                return false;
            }
        }

        // Check if the moved point would be too close to its new neighbors
        // Create a list without point i to see what neighbors it would have
        const withoutI = this.points.filter((_, idx) => idx !== i);
        // After removing i, the moved point will be at position j in the new list
        // Its neighbors would be at j-1 and j (in the list without i)
        if (j > 0 && dist(this.points[i], withoutI[j - 1]) < MIN_POINT_SPACING) {
            return false;
        }
        if (j < withoutI.length && dist(this.points[i], withoutI[j]) < MIN_POINT_SPACING) {
            return false;
        }

        this.mutate(() => {
            const [p] = this.points.splice(i, 1);
            this.points.splice(j, 0, p);
            this.selected = j;
        });
        return true;
    }

    public setStop(i: number, name: string | null): void {
        if (i < 0 || i >= this.points.length) return;
        this.mutate(() => { this.points[i].stop = name && name.trim() ? name.trim() : null; });
    }

    public clear(): void {
        if (this.points.length === 0) return;
        this.mutate(() => { this.points = []; this.selected = -1; });
    }

    public undo(): boolean {
        const s = this.history.pop();
        if (!s) return false;
        this.restore(s);
        this.version++;
        this.onChange?.();
        return true;
    }

    public select(i: number): void {
        this.selected = Math.max(-1, Math.min(this.points.length - 1, i));
        this.onChange?.();
    }

    /** Recording while flying: append the position once it is `spacing` units from the last point. */
    public recordTick(x: number, y: number, spacing = RECORD_SPACING): boolean {
        const last = this.points[this.points.length - 1];
        if (last && dist(last, { x, y }) < spacing) return false;
        return this.insertAt(this.points.length, x, y) >= 0;
    }

    public toRoute(wdtFileId = this.wdtFileId, mapId = this.mapId): RouteFile {
        const r2 = (v: number) => Math.round(v * 100) / 100;
        const stops: RouteStop[] = [];
        const waypoints: RouteWaypoint[] = this.points.map((p, index) => {
            if (p.stop !== null) stops.push({ name: p.stop, index });
            return { x: r2(p.x), y: r2(p.y) };
        });
        return { id: this.id, name: this.name, mapId, wdtFileId, stops, waypoints };
    }

    public toJSON(): DraftState { return this.snapshot(); }

    public static fromRoute(route: RouteFile): RouteDraft {
        const d = new RouteDraft();
        d.id = route.id; d.name = route.name;
        d.mapId = route.mapId; d.wdtFileId = route.wdtFileId;
        d.points = route.waypoints.map((w) => ({ x: w.x, y: w.y, stop: null }));
        for (const s of route.stops) if (d.points[s.index]) d.points[s.index].stop = s.name;
        d.selected = d.points.length - 1;
        return d;
    }

    public static fromJSON(json: unknown): RouteDraft | null {
        const o = json as Record<string, unknown> | null;
        if (!o || typeof o !== "object" || typeof o.id !== "string" || typeof o.name !== "string" || !Array.isArray(o.points)) return null;
        const points: DraftPoint[] = [];
        for (const p of o.points as unknown[]) {
            const q = p as Record<string, unknown> | null;
            if (!q || typeof q.x !== "number" || typeof q.y !== "number" || !Number.isFinite(q.x) || !Number.isFinite(q.y)) return null;
            if (q.stop !== null && q.stop !== undefined && typeof q.stop !== "string") return null;
            points.push({ x: q.x, y: q.y, stop: typeof q.stop === "string" ? q.stop : null });
        }
        const d = new RouteDraft();
        d.id = o.id; d.name = o.name; d.points = points;
        d.mapId = typeof o.mapId === "number" ? o.mapId : 0;
        d.wdtFileId = typeof o.wdtFileId === "number" ? o.wdtFileId : 775971;
        d.selected = Number.isInteger(o.selected) ? Math.max(-1, Math.min(points.length - 1, o.selected as number)) : points.length - 1;
        return d;
    }
}

export function saveDraft(storage: Pick<Storage, "setItem">, draft: RouteDraft): void {
    try { storage.setItem(DRAFT_KEY, JSON.stringify(draft.toJSON())); } catch { /* private mode: ignore */ }
}

export function loadDraft(storage: Pick<Storage, "getItem">): RouteDraft | null {
    try {
        const raw = storage.getItem(DRAFT_KEY);
        return raw ? RouteDraft.fromJSON(JSON.parse(raw)) : null;
    } catch { return null; }
}
