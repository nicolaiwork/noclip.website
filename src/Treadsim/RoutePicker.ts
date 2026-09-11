import { loadCatalog } from "./RouteCatalog.js";
import type { RouteFile } from "./RouteFile.js";
import { DEFAULT_SETTINGS, loadSettings, saveSettings, type Settings } from "./Settings.js";
import { DATA_SERVER } from "./ServerStatus.js";

export interface PickerChoice { route: RouteFile | null /* null = free roam */; settings: Settings }

/**
 * Full-screen route picker shown on load, on Escape and on the HUD's Routes button.
 * Lets the runner pick a route (or free roam), world scale and looping, then hands the
 * choice to `onStart`, which preloads tiles and reports progress via `setProgress`.
 */
export class RoutePicker {
    private overlay: HTMLDivElement;
    private statusLine: HTMLDivElement;
    private routeList: HTMLDivElement;
    private worldScaleInput: HTMLInputElement;
    private loopInput: HTMLInputElement;
    private startButton: HTMLButtonElement;
    private progress: HTMLProgressElement;
    private progressLabel: HTMLDivElement;
    private errorLine: HTMLDivElement;
    private catalog: { file: string; route: RouteFile }[] = [];
    private catalogLoaded = false;
    private settings: Settings;
    private starting = false;

    constructor(private opts: { onStart(choice: PickerChoice): Promise<void>; serverUp: () => Promise<boolean> }) {
        this.settings = loadSettings(localStorage);

        this.overlay = document.createElement("div");
        this.overlay.id = "treadsim-route-picker";
        this.overlay.style.cssText = "position:fixed;inset:0;background:rgba(6,8,16,.88);z-index:10001;display:flex;align-items:center;justify-content:center;font:18px system-ui;color:#fff";

        const panel = document.createElement("div");
        panel.style.cssText = "width:520px;max-height:80vh;overflow-y:auto;background:rgba(20,22,32,.96);border-radius:16px;padding:28px;display:flex;flex-direction:column;gap:16px;box-shadow:0 8px 40px rgba(0,0,0,.6)";

        const title = document.createElement("div");
        title.textContent = "Treadsim";
        title.style.cssText = "font:700 26px system-ui";

        this.statusLine = document.createElement("div");
        this.statusLine.style.cssText = "font-size:14px;opacity:.85";

        this.routeList = document.createElement("div");
        this.routeList.style.cssText = "display:flex;flex-direction:column;gap:8px";

        const worldScaleWrap = document.createElement("label");
        worldScaleWrap.style.cssText = "display:flex;flex-direction:column;gap:4px;font-size:14px";
        worldScaleWrap.textContent = "World scale";
        this.worldScaleInput = document.createElement("input");
        this.worldScaleInput.type = "number";
        this.worldScaleInput.step = "0.0001"; this.worldScaleInput.min = "0.5"; this.worldScaleInput.max = "2";
        this.worldScaleInput.value = String(this.settings.worldScale);
        this.worldScaleInput.style.cssText = "font:16px system-ui;padding:6px 10px;border-radius:8px;border:0;width:120px";
        const worldScaleHelp = document.createElement("div");
        worldScaleHelp.textContent = "game units per treadmill metre; 1.0936 = one game unit is one yard";
        worldScaleHelp.style.cssText = "font-size:12px;opacity:.7";
        worldScaleWrap.append(this.worldScaleInput, worldScaleHelp);

        const loopWrap = document.createElement("label");
        loopWrap.style.cssText = "display:flex;align-items:center;gap:8px;font-size:14px";
        this.loopInput = document.createElement("input");
        this.loopInput.type = "checkbox";
        this.loopInput.checked = this.settings.loop;
        loopWrap.append(this.loopInput, document.createTextNode("Loop route"));

        this.startButton = document.createElement("button");
        this.startButton.textContent = "Start";
        this.startButton.style.cssText = "font:600 18px system-ui;padding:12px 20px;border-radius:10px;border:0;background:#3b82f6;color:#fff;cursor:pointer";
        this.startButton.onclick = () => void this.start();

        this.progress = document.createElement("progress");
        this.progress.style.cssText = "width:100%;display:none";
        this.progressLabel = document.createElement("div");
        this.progressLabel.style.cssText = "font-size:13px;opacity:.85;display:none";

        this.errorLine = document.createElement("div");
        this.errorLine.style.cssText = "font-size:14px;color:#f87171;min-height:18px";

        panel.append(title, this.statusLine, this.routeList, worldScaleWrap, loopWrap, this.startButton, this.progress, this.progressLabel, this.errorLine);
        this.overlay.appendChild(panel);
        document.body.appendChild(this.overlay);

        this.renderRouteList();
        void this.loadCatalogAndRender();
    }

    private async loadCatalogAndRender(): Promise<void> {
        this.catalog = await loadCatalog();
        this.catalogLoaded = true;
        this.renderRouteList();
    }

    private renderRouteList(): void {
        this.routeList.innerHTML = "";
        if (this.catalogLoaded && this.catalog.length === 0) {
            const empty = document.createElement("div");
            empty.textContent = "No routes found in routes/";
            empty.style.cssText = "font-size:14px;opacity:.7";
            this.routeList.appendChild(empty);
        }
        const matchIndex = this.catalog.findIndex((e) => e.route.id === this.settings.lastRouteId);
        const selectIndex = this.settings.lastRouteId !== null && matchIndex >= 0 ? matchIndex : (this.catalog.length > 0 ? 0 : -1);
        this.catalog.forEach((entry, i) => {
            const label = document.createElement("label");
            label.style.cssText = "display:flex;align-items:center;gap:8px;font-size:15px";
            const input = document.createElement("input");
            input.type = "radio"; input.name = "route"; input.value = entry.route.id;
            input.checked = i === selectIndex;
            label.append(input, document.createTextNode(`${entry.route.name} (${entry.route.stops.length} stops)`));
            this.routeList.appendChild(label);
        });
        const freeRoamLabel = document.createElement("label");
        freeRoamLabel.style.cssText = "display:flex;align-items:center;gap:8px;font-size:15px";
        const freeRoamInput = document.createElement("input");
        freeRoamInput.type = "radio"; freeRoamInput.name = "route"; freeRoamInput.value = "";
        freeRoamInput.checked = selectIndex === -1;
        freeRoamLabel.append(freeRoamInput, document.createTextNode("Free roam (steer with the mouse)"));
        this.routeList.appendChild(freeRoamLabel);
    }

    private async refreshStatus(): Promise<void> {
        this.statusLine.textContent = "Data server: checking…";
        const up = await this.opts.serverUp();
        const host = DATA_SERVER.replace(/^https?:\/\//, "");
        this.statusLine.textContent = up ? "Data server: running" : `Data server: not reachable at ${host} — run pnpm run server`;
    }

    private async start(): Promise<void> {
        if (this.starting) return;
        this.starting = true;
        this.startButton.disabled = true;
        this.errorLine.textContent = "";
        const selected = this.routeList.querySelector("input[type=radio]:checked") as HTMLInputElement | null;
        const routeId = selected?.value || null;
        const route = routeId ? this.catalog.find((e) => e.route.id === routeId)?.route ?? null : null;
        const worldScale = Math.max(0.5, Math.min(2, parseFloat(this.worldScaleInput.value) || DEFAULT_SETTINGS.worldScale));
        const settings: Settings = { worldScale, loop: this.loopInput.checked, lastRouteId: route ? route.id : null };
        this.settings = settings;
        saveSettings(localStorage, settings);
        try {
            await this.opts.onStart({ route, settings });
            this.hide();
        } catch (e) {
            this.errorLine.textContent = e instanceof Error ? e.message : String(e);
        } finally {
            this.starting = false;
            this.startButton.disabled = false;
            this.setProgress(0, 0);
        }
    }

    public show(): void {
        this.overlay.style.display = "flex";
        void this.refreshStatus();
    }

    public hide(): void { this.overlay.style.display = "none"; }

    /** Shows the progress bar while preloading; a total of 0 hides it again. */
    public setProgress(done: number, total: number): void {
        if (total <= 0) {
            this.progress.style.display = "none";
            this.progressLabel.style.display = "none";
            return;
        }
        this.progress.style.display = "block";
        this.progress.max = total;
        this.progress.value = done;
        this.progressLabel.style.display = "block";
        this.progressLabel.textContent = `Loading tiles ${done} / ${total}`;
    }

    public destroy(): void { this.overlay.remove(); }
}
