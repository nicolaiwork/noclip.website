import { mat4, type ReadonlyMat4 } from "gl-matrix";
import type { DebugDraw } from "../gfx/helpers/DebugDraw.js";
import { RouteDraft, loadDraft, saveDraft } from "./RouteDraft.js";
import { RoutePreview } from "./RoutePreview.js";
import { pickGround } from "./GroundPick.js";
import { reportRoute } from "./RouteQuality.js";
import { parseRouteFile, type RouteFile } from "./RouteFile.js";
import { ROUTE_ID_RE, type RouteCatalogResult } from "./RouteCatalog.js";
import { adtFromNoclip, noclipFromAdt } from "./coords.js";
import type { CameraLike } from "./TreadsimController.js";

export interface RouteEditorDeps {
    camera: CameraLike;
    heightAt(x: number, y: number): number | undefined;
    adtCount(): number;
    clipFromWorld(): ReadonlyMat4;
    toplevel: HTMLElement;
    loadCatalog(): Promise<RouteCatalogResult>;
    saveRoute(route: RouteFile): Promise<string>;
    preload(route: RouteFile, progress: (done: number, total: number) => void): Promise<void>;
    onExit(): void;
    setHideDoodads(v: boolean): void;
    setDaylight(v: boolean): void;
    afterTeleport(): void;
    storage?: Pick<Storage, "getItem" | "setItem">;
}

export const FLY_HEIGHT = 12;
export const LOOK_DOWN_HEIGHT = 40;
const CLICK_MAX_PX = 4;
const CLICK_MAX_MS = 400;
const TOO_CLOSE_STATUS = "Not changed: two waypoints would be closer than 0.05 u — delete one of them first";

const BTN = "font:600 13px system-ui;padding:6px 10px;border-radius:8px;border:0;color:#fff;cursor:pointer;background:#334155";
const SMALL = "font:12px system-ui;padding:2px 7px;border-radius:6px;border:0;color:#fff;cursor:pointer;background:#334155";

function isTyping(): boolean {
    const t = document.activeElement?.tagName;
    return t === "INPUT" || t === "TEXTAREA" || t === "SELECT";
}

/**
 * Route editor (spec §6). Fly with noclip's controls; Space or a click on the canvas drops a
 * waypoint at the camera's ground position / the clicked terrain point, inserted after the
 * selected point. The side panel lists waypoints with reorder, delete and stop controls and
 * quality warnings, and saves into routes/ (or downloads). The draft survives reloads via
 * localStorage. The camera is noclip's; `RouteDraft` and `GroundPick` hold the tested logic.
 */
export class RouteEditor {
    public draft: RouteDraft;
    public active = false;
    public recording = false;
    private preview: RoutePreview;
    private storage: Pick<Storage, "getItem" | "setItem">;
    private warnings = new Map<number, string>();
    private warningIndices = new Set<number>();
    public jitter: { median: number; p90: number; max: number } = { median: 0, p90: 0, max: 0 };
    private catalog: RouteCatalogResult = { routes: [], errors: [] };
    private mouseDown: { x: number; y: number; t: number; moved: number } | null = null;

    private panel!: HTMLDivElement;
    private idInput!: HTMLInputElement;
    private nameInput!: HTMLInputElement;
    private list!: HTMLDivElement;
    private status!: HTMLDivElement;
    private recordButton!: HTMLButtonElement;
    private openSelect!: HTMLSelectElement;
    private summary!: HTMLDivElement;
    private hideTreesCheckbox!: HTMLInputElement;
    private daylightCheckbox!: HTMLInputElement;

    constructor(private deps: RouteEditorDeps) {
        this.storage = deps.storage ?? localStorage;
        this.draft = loadDraft(this.storage) ?? new RouteDraft();
        this.preview = new RoutePreview(deps.heightAt);
        this.buildPanel();
        this.adoptDraft(this.draft);
    }

    // ---- lifecycle -------------------------------------------------------------------------

    public open(): void {
        if (this.active) return;
        this.active = true;
        this.panel.style.display = "flex";
        window.addEventListener("keydown", this.onKey, { capture: true });
        window.addEventListener("mousedown", this.onMouseDown, { capture: true });
        window.addEventListener("mousemove", this.onMouseMove, { capture: true });
        window.addEventListener("mouseup", this.onMouseUp, { capture: true });
        void this.refreshCatalog();
        this.hideTreesCheckbox.checked = true; this.deps.setHideDoodads(true);
        this.daylightCheckbox.checked = true; this.deps.setDaylight(true);
        if (this.draft.length > 0) this.flyTo(this.draft.selected >= 0 ? this.draft.selected : this.draft.length - 1);
        this.setStatus("Space: drop waypoint here · click the road: drop there · Backspace: delete · Z: undo · R: record · Esc: exit");
    }

    public close(): void {
        if (!this.active) return;
        this.active = false;
        this.recording = false;
        this.recordButton.textContent = "● Record";
        this.panel.style.display = "none";
        window.removeEventListener("keydown", this.onKey, { capture: true });
        window.removeEventListener("mousedown", this.onMouseDown, { capture: true });
        window.removeEventListener("mousemove", this.onMouseMove, { capture: true });
        window.removeEventListener("mouseup", this.onMouseUp, { capture: true });
        this.hideTreesCheckbox.checked = false; this.deps.setHideDoodads(false);
        this.daylightCheckbox.checked = false; this.deps.setDaylight(false);
    }

    public destroy(): void { this.close(); this.panel.remove(); }

    private adoptDraft(d: RouteDraft): void {
        this.draft = d;
        this.preview = new RoutePreview(this.deps.heightAt);   // RoutePreview caches on draft.version; a fresh draft starts at 0, so drop the old cache
        d.onChange = () => this.onDraftChange();
        this.idInput.value = d.id; this.nameInput.value = d.name;
        this.onDraftChange();
    }

    private onDraftChange(): void {
        saveDraft(this.storage, this.draft);
        const pts = this.draft.points;
        const report = reportRoute(pts, pts.flatMap((p, index) => (p.stop !== null ? [{ name: p.stop, index }] : [])));
        this.jitter = report.jitter;
        this.warnings.clear();
        for (const s of report.spikes) this.warnings.set(s.waypoint, `heading spike ${s.degPerUnit.toFixed(0)}°/u${s.atStop ? " (at stop)" : ""}`);
        for (const g of report.gaps) this.warnings.set(g.to, `gap ${g.gap} u from #${g.from}`);
        this.warningIndices = new Set(this.warnings.keys());
        this.renderList();
    }

    // ---- camera helpers --------------------------------------------------------------------

    public cameraAdt(): [number, number, number] {
        const m = this.deps.camera.worldMatrix;
        return adtFromNoclip([m[12], m[13], m[14]]);
    }

    private setCameraPosition(x: number, y: number, z: number): void {
        const m = this.deps.camera.worldMatrix;
        const [nx, ny, nz] = noclipFromAdt([x, y, z]);
        m[12] = nx; m[13] = ny; m[14] = nz;
        this.deps.camera.worldMatrixUpdated();
    }

    public flyTo(i: number): void {
        const p = this.draft.points[i];
        if (!p) return;
        const g = this.deps.heightAt(p.x, p.y);
        this.setCameraPosition(p.x, p.y, (g ?? this.cameraAdt()[2] - FLY_HEIGHT) + FLY_HEIGHT);
        this.deps.afterTeleport();
    }

    /** Top-down view with north up (authoring helper; also handy for a quick look at a stretch). */
    public lookDown(x: number, y: number, height = LOOK_DOWN_HEIGHT): void {
        const m = this.deps.camera.worldMatrix as unknown as mat4;
        // columns: right = noclip +x (east), up on screen = noclip -z (north), back = noclip +y (so forward looks down)
        mat4.set(m, 1, 0, 0, 0,  0, 0, -1, 0,  0, 1, 0, 0,  0, 0, 0, 1);
        const g = this.deps.heightAt(x, y);
        this.setCameraPosition(x, y, (g ?? this.cameraAdt()[2]) + height);
        this.deps.afterTeleport();
    }

    // ---- dropping --------------------------------------------------------------------------

    public dropHere(): number {
        const [x, y] = this.cameraAdt();
        return this.dropAt(x, y);
    }

    public dropAt(x: number, y: number): number {
        const i = this.draft.insert(x, y);
        if (i < 0) this.setStatus("Not dropped: too close to a neighbouring waypoint");
        else { this.setStatus(`Waypoint #${i} at ${x.toFixed(1)}, ${y.toFixed(1)}`); this.scrollTo(i); }
        return i;
    }

    public pickAndDrop(clientX: number, clientY: number): boolean {
        const rect = this.deps.toplevel.getBoundingClientRect();
        const m = this.deps.camera.worldMatrix;
        const hit = pickGround(this.deps.clipFromWorld(), [m[12], m[13], m[14]], clientX - rect.left, clientY - rect.top, rect.width, rect.height, this.deps.heightAt);
        if (!hit) { this.setStatus("No terrain under the cursor (tile not loaded, or sky)"); return false; }
        return this.dropAt(hit[0], hit[1]) >= 0;
    }

    public tick(): void {
        if (!this.active || !this.recording) return;
        const [x, y] = this.cameraAdt();
        if (this.draft.recordTick(x, y)) this.scrollTo(this.draft.length - 1);
    }

    public drawPreview(dd: DebugDraw): void {
        const [x, y] = this.cameraAdt();
        const g = this.deps.heightAt(x, y);
        this.preview.draw(dd, this.draft, this.deps.adtCount(), this.warningIndices, g === undefined ? undefined : [x, y, g]);
    }

    // ---- input -----------------------------------------------------------------------------

    private onKey = (e: KeyboardEvent): void => {
        if (!this.active || e.metaKey || e.ctrlKey || e.altKey) return;
        if (e.key === "Escape") { e.stopPropagation(); if (isTyping()) (document.activeElement as HTMLElement).blur(); else this.deps.onExit(); return; }
        if (isTyping()) { if (e.key === "Enter") (document.activeElement as HTMLElement).blur(); return; }
        switch (e.code) {
            case "Space": e.preventDefault(); e.stopPropagation(); if (!e.repeat) this.dropHere(); break;   // hide from noclip's fly-up
            case "Backspace": case "Delete":
                e.preventDefault(); e.stopPropagation();
                if (this.draft.selected >= 0 && !this.draft.remove(this.draft.selected)) this.setStatus(TOO_CLOSE_STATUS);
                break;
            case "KeyZ": e.stopPropagation(); if (!e.repeat && !this.draft.undo()) this.setStatus("Nothing to undo"); break; // noclip's Z toggles its UI
            case "KeyR": e.stopPropagation(); if (!e.repeat) this.toggleRecording(); break;
            case "Enter": e.stopPropagation(); break;   // never start the treadmill from the editor
        }
    };

    private onMouseDown = (e: MouseEvent): void => {
        if (!this.active || e.button !== 0 || e.target !== this.deps.toplevel) { this.mouseDown = null; return; }
        this.mouseDown = { x: e.clientX, y: e.clientY, t: performance.now(), moved: 0 };
    };

    // Pointer lock (noclip's InputManager requests it on canvas mousedown) freezes clientX/Y for
    // the duration of the drag, so the click-vs-drag distance has to come from movementX/Y instead.
    private onMouseMove = (e: MouseEvent): void => {
        if (!this.mouseDown) return;
        this.mouseDown.moved += Math.abs(e.movementX) + Math.abs(e.movementY);
    };

    private onMouseUp = (e: MouseEvent): void => {
        const d = this.mouseDown; this.mouseDown = null;
        if (!this.active || !d || e.button !== 0 || e.target !== this.deps.toplevel) return;
        if (d.moved > CLICK_MAX_PX || performance.now() - d.t > CLICK_MAX_MS) return; // a drag: noclip's look
        this.pickAndDrop(d.x, d.y);
    };

    private toggleRecording(): void {
        this.recording = !this.recording;
        this.recordButton.textContent = this.recording ? "■ Stop recording" : "● Record";
        this.recordButton.style.background = this.recording ? "#b91c1c" : "#334155";
        this.setStatus(this.recording ? "Recording: a waypoint every 8 u while you fly" : "Recording stopped");
    }

    // ---- open / save -----------------------------------------------------------------------

    private async refreshCatalog(): Promise<void> {
        this.catalog = await this.deps.loadCatalog();
        this.openSelect.innerHTML = "";
        for (const e of this.catalog.routes) {
            const o = document.createElement("option"); o.value = e.route.id; o.textContent = `${e.route.name} (${e.route.waypoints.length} wp)`;
            this.openSelect.appendChild(o);
        }
        this.openSelect.disabled = this.catalog.routes.length === 0;
    }

    public async openRoute(route: RouteFile): Promise<void> {
        this.setStatus(`Loading tiles for ${route.name}…`);
        try { await this.deps.preload(route, (d, t) => this.setStatus(`Loading tiles ${d} / ${t}`)); }
        catch (e) { this.setStatus(`Preload failed: ${e instanceof Error ? e.message : String(e)}`); }
        this.adoptDraft(RouteDraft.fromRoute(route));
        this.flyTo(0);
        this.setStatus(`Opened ${route.id} (${route.waypoints.length} waypoints)`);
    }

    private newRoute(): void {
        this.adoptDraft(new RouteDraft());
        this.setStatus("New empty route");
    }

    private validated(): RouteFile {
        this.draft.id = this.idInput.value.trim(); this.draft.name = this.nameInput.value.trim();
        if (!ROUTE_ID_RE.test(this.draft.id)) throw new Error("id must be a lowercase slug (a-z, 0-9, -)");
        if (!this.draft.name) throw new Error("name is required");
        return parseRouteFile(this.draft.toRoute());
    }

    public async save(): Promise<void> {
        try {
            const route = this.validated();
            const file = await this.deps.saveRoute(route);
            saveDraft(this.storage, this.draft);
            this.setStatus(`Saved routes/${file} — it is in the start screen's list now`);
            void this.refreshCatalog();
        } catch (e) { this.setStatus(`Not saved: ${e instanceof Error ? e.message : String(e)}`); }
    }

    public download(): void {
        try {
            const route = this.validated();
            const blob = new Blob([JSON.stringify(route, null, 2) + "\n"], { type: "application/json" });
            const a = document.createElement("a");
            a.href = URL.createObjectURL(blob); a.download = `${route.id}.json`;
            document.body.appendChild(a); a.click(); a.remove();
            setTimeout(() => URL.revokeObjectURL(a.href), 1000);
            this.setStatus(`Downloaded ${a.download}`);
        } catch (e) { this.setStatus(`Not exported: ${e instanceof Error ? e.message : String(e)}`); }
    }

    // ---- panel -----------------------------------------------------------------------------

    private setStatus(text: string): void { this.status.textContent = text; }

    private button(label: string, onClick: (e: MouseEvent) => void, css = BTN): HTMLButtonElement {
        const b = document.createElement("button");
        b.textContent = label; b.style.cssText = css;
        b.onmousedown = (e) => e.preventDefault();   // keep focus on the canvas so noclip's fly keys keep working
        b.onclick = (e) => { e.stopPropagation(); onClick(e); };   // don't let it bubble into the row's onclick (select + fly)
        return b;
    }

    private confirmDiscard(): boolean {
        return this.draft.length === 0 || window.confirm(`Discard the current draft (${this.draft.length} waypoints)?`);
    }

    private setDisabled(b: HTMLButtonElement, disabled: boolean): void {
        b.disabled = disabled;
        b.style.opacity = disabled ? "0.35" : "1";
        b.style.cursor = disabled ? "default" : "pointer";
    }

    private buildPanel(): void {
        this.panel = document.createElement("div");
        this.panel.id = "treadsim-route-editor";
        this.panel.style.cssText = "position:fixed;top:0;right:0;bottom:0;width:360px;background:rgba(12,14,24,.92);color:#fff;font:14px system-ui;padding:14px;display:none;flex-direction:column;gap:10px;z-index:10000;box-shadow:-4px 0 24px rgba(0,0,0,.5)";

        const title = document.createElement("div");
        title.textContent = "Route editor"; title.style.cssText = "font:700 20px system-ui";

        const field = (label: string, input: HTMLInputElement) => {
            const wrap = document.createElement("label"); wrap.style.cssText = "display:flex;flex-direction:column;gap:2px;font-size:12px;opacity:.9";
            wrap.textContent = label; input.style.cssText = "font:14px system-ui;padding:5px 8px;border-radius:6px;border:0"; wrap.appendChild(input); return wrap;
        };
        this.idInput = document.createElement("input"); this.idInput.placeholder = "goldshire-to-westbrook";
        this.idInput.onchange = () => { this.draft.id = this.idInput.value.trim(); saveDraft(this.storage, this.draft); };
        this.nameInput = document.createElement("input"); this.nameInput.placeholder = "Goldshire → Westbrook Garrison";
        this.nameInput.onchange = () => { this.draft.name = this.nameInput.value.trim(); saveDraft(this.storage, this.draft); };

        this.summary = document.createElement("div"); this.summary.style.cssText = "font-size:12px;opacity:.8";

        this.list = document.createElement("div");
        this.list.style.cssText = "flex:1;overflow-y:auto;display:flex;flex-direction:column;gap:2px;font-variant-numeric:tabular-nums;font-size:12px";

        const check = (label: string, onChange: (v: boolean) => void): [HTMLInputElement, HTMLLabelElement] => {
            const input = document.createElement("input"); input.type = "checkbox";
            input.onchange = () => { onChange(input.checked); input.blur(); };   // keep focus on the canvas so noclip's fly keys keep working
            const wrap = document.createElement("label"); wrap.style.cssText = "display:flex;align-items:center;gap:5px;font:13px system-ui";
            wrap.append(input, label);
            return [input, wrap];
        };
        const [hideTreesInput, hideTreesLabel] = check("Hide trees", (v) => this.deps.setHideDoodads(v));
        this.hideTreesCheckbox = hideTreesInput;
        const [daylightInput, daylightLabel] = check("Daylight", (v) => this.deps.setDaylight(v));
        this.daylightCheckbox = daylightInput;
        const row0 = document.createElement("div"); row0.style.cssText = "display:flex;gap:14px;flex-wrap:wrap";
        row0.append(hideTreesLabel, daylightLabel);

        const row1 = document.createElement("div"); row1.style.cssText = "display:flex;gap:6px;flex-wrap:wrap";
        this.recordButton = this.button("● Record", () => this.toggleRecording());
        row1.append(this.button("Undo (Z)", () => { if (!this.draft.undo()) this.setStatus("Nothing to undo"); }), this.recordButton, this.button("New", () => { if (this.confirmDiscard()) this.newRoute(); }));

        const row2 = document.createElement("div"); row2.style.cssText = "display:flex;gap:6px;align-items:center";
        this.openSelect = document.createElement("select"); this.openSelect.style.cssText = "flex:1;font:13px system-ui;padding:5px;border-radius:6px;border:0";
        row2.append(this.openSelect, this.button("Open", () => {
            const entry = this.catalog.routes.find((e) => e.route.id === this.openSelect.value);
            if (entry && this.confirmDiscard()) void this.openRoute(entry.route);
            this.openSelect.blur();
        }));

        const row3 = document.createElement("div"); row3.style.cssText = "display:flex;gap:6px;flex-wrap:wrap";
        row3.append(
            this.button("Save to routes/", () => void this.save(), BTN + ";background:#3b82f6"),
            this.button("Download JSON", () => this.download()),
            this.button("Exit (Esc)", () => this.deps.onExit(), BTN + ";margin-left:auto"),
        );

        this.status = document.createElement("div"); this.status.style.cssText = "font-size:12px;opacity:.85;min-height:32px";

        this.panel.append(title, field("id (file name)", this.idInput), field("name", this.nameInput), this.summary, this.list, row0, row1, row2, row3, this.status);
        document.body.appendChild(this.panel);
    }

    private renderList(): void {
        const d = this.draft;
        const stops = d.points.filter((p) => p.stop !== null).length;
        this.summary.textContent = `${d.length} waypoints · ${stops} stops · ${this.warnings.size} warnings · jitter ${this.jitter.median.toFixed(2)} u · drops go ${d.selected < 0 ? "at the end" : `after #${d.selected}`}`;
        this.list.innerHTML = "";
        d.points.forEach((p, i) => {
            const row = document.createElement("div");
            row.dataset.index = String(i);
            row.style.cssText = `display:flex;align-items:center;gap:6px;padding:3px 6px;border-radius:6px;cursor:pointer;background:${i === d.selected ? "rgba(74,222,128,.25)" : "transparent"}`;
            const warn = this.warnings.get(i);
            const text = document.createElement("span");
            text.style.cssText = "flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis";
            text.textContent = `#${i}  ${p.x.toFixed(1)}, ${p.y.toFixed(1)}${p.stop !== null ? `  ★ ${p.stop}` : ""}${warn ? "  ⚠" : ""}`;
            if (warn) { text.title = warn; text.style.color = "#fca5a5"; }
            row.onclick = () => { d.select(i); this.flyTo(i); };
            const stopLabel = p.stop !== null ? "★" : "☆";
            const up = this.button("↑", () => { if (!d.move(i, i - 1)) this.setStatus(TOO_CLOSE_STATUS); }, SMALL);
            this.setDisabled(up, i === 0);
            const down = this.button("↓", () => { if (!d.move(i, i + 1)) this.setStatus(TOO_CLOSE_STATUS); }, SMALL);
            this.setDisabled(down, i === d.length - 1);
            row.append(text,
                up, down,
                this.button(stopLabel, () => {
                    const name = window.prompt("Stop name (empty removes the stop)", p.stop ?? "");
                    if (name !== null) d.setStop(i, name);
                }, SMALL),
                this.button("✕", () => { if (!d.remove(i)) this.setStatus(TOO_CLOSE_STATUS); }, SMALL + ";background:#7f1d1d"),
            );
            this.list.appendChild(row);
        });
    }

    private scrollTo(i: number): void {
        const row = this.list.querySelector<HTMLElement>(`[data-index="${i}"]`);
        row?.scrollIntoView({ block: "nearest" });
    }
}
