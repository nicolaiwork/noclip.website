import { loadCatalog, type RouteCatalogEntry, type RouteCatalogError } from "./RouteCatalog.js";
import type { RouteFile } from "./RouteFile.js";
import { clampVolume, clampWorldScale, saveSettings, WORLD_SCALE_RANGE, type Settings } from "./Settings.js";
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
    private statusText: HTMLSpanElement;
    private retryButton: HTMLButtonElement;
    private routeList: HTMLDivElement;
    private worldScaleInput: HTMLInputElement;
    private loopInput: HTMLInputElement;
    private soundInput: HTMLInputElement;
    private musicVolumeInput: HTMLInputElement;
    private ambienceVolumeInput: HTMLInputElement;
    private startButton: HTMLButtonElement;
    private resumeButton: HTMLButtonElement;
    private editButton: HTMLButtonElement;
    private progress: HTMLProgressElement;
    private progressLabel: HTMLDivElement;
    private errorLine: HTMLDivElement;
    private catalog: RouteCatalogEntry[] = [];
    private catalogErrors: RouteCatalogError[] = [];
    private catalogLoaded = false;
    private settings: Settings;
    private starting = false;
    private hasChosen = false;
    private resumable = false;

    constructor(private opts: { settings: Settings; onStart(choice: PickerChoice): Promise<void>; onResume(): void; onEdit(): void; serverUp: () => Promise<boolean>; onSoundChange?(settings: Settings): void }) {
        this.settings = opts.settings;

        this.overlay = document.createElement("div");
        this.overlay.id = "treadsim-route-picker";
        this.overlay.style.cssText = "position:fixed;inset:0;background:rgba(6,8,16,.88);z-index:10001;display:flex;align-items:center;justify-content:center;font:18px system-ui;color:#fff";

        const panel = document.createElement("div");
        panel.style.cssText = "width:520px;max-height:80vh;overflow-y:auto;background:rgba(20,22,32,.96);border-radius:16px;padding:28px;display:flex;flex-direction:column;gap:16px;box-shadow:0 8px 40px rgba(0,0,0,.6)";

        const title = document.createElement("div");
        title.textContent = "Treadsim";
        title.style.cssText = "font:700 26px system-ui";

        this.statusLine = document.createElement("div");
        this.statusLine.style.cssText = "display:flex;align-items:center;gap:10px;font-size:14px;opacity:.85";
        this.statusText = document.createElement("span");
        this.retryButton = document.createElement("button");
        this.retryButton.textContent = "Retry";
        this.retryButton.style.cssText = "font:600 12px system-ui;padding:4px 10px;border-radius:6px;border:0;background:#334155;color:#fff;cursor:pointer";
        this.retryButton.onclick = () => { void this.refreshStatus(); void this.loadCatalogAndRender(); this.retryButton.blur(); };
        this.statusLine.append(this.statusText, this.retryButton);

        this.routeList = document.createElement("div");
        this.routeList.style.cssText = "display:flex;flex-direction:column;gap:8px";

        const worldScaleWrap = document.createElement("label");
        worldScaleWrap.style.cssText = "display:flex;flex-direction:column;gap:4px;font-size:14px";
        worldScaleWrap.textContent = "World scale";
        this.worldScaleInput = document.createElement("input");
        this.worldScaleInput.type = "number";
        this.worldScaleInput.step = "0.0001"; this.worldScaleInput.min = String(WORLD_SCALE_RANGE.min); this.worldScaleInput.max = String(WORLD_SCALE_RANGE.max);
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

        const soundWrap = document.createElement("div");
        soundWrap.style.cssText = "display:flex;flex-direction:column;gap:8px;font-size:14px";
        const soundToggle = document.createElement("label");
        soundToggle.style.cssText = "display:flex;align-items:center;gap:8px";
        this.soundInput = document.createElement("input");
        this.soundInput.type = "checkbox";
        this.soundInput.checked = this.settings.sound;
        soundToggle.append(this.soundInput, document.createTextNode("Music and ambience (M toggles during a run)"));
        const slider = (label: string, value: number) => {
            const wrap = document.createElement("label");
            wrap.style.cssText = "display:flex;align-items:center;gap:8px";
            const input = document.createElement("input");
            input.type = "range"; input.min = "0"; input.max = "1"; input.step = "0.05"; input.value = String(value);
            input.style.width = "160px";
            const text = document.createElement("span"); text.style.cssText = "width:90px"; text.textContent = label;
            wrap.append(text, input);
            return { wrap, input };
        };
        const music = slider("Music", this.settings.musicVolume);
        const ambience = slider("Ambience", this.settings.ambienceVolume);
        this.musicVolumeInput = music.input; this.ambienceVolumeInput = ambience.input;
        soundWrap.append(soundToggle, music.wrap, ambience.wrap);
        const onSound = () => { this.settings = this.readSettings(); saveSettings(localStorage, this.settings); this.opts.onSoundChange?.(this.settings); };
        this.soundInput.oninput = onSound; this.musicVolumeInput.oninput = onSound; this.ambienceVolumeInput.oninput = onSound;

        this.startButton = document.createElement("button");
        this.startButton.textContent = "Start";
        this.startButton.style.cssText = "font:600 18px system-ui;padding:12px 20px;border-radius:10px;border:0;background:#3b82f6;color:#fff;cursor:pointer";
        this.startButton.onclick = () => void this.start();

        this.resumeButton = document.createElement("button");
        this.resumeButton.textContent = "Resume";
        this.resumeButton.style.cssText = "font:600 18px system-ui;padding:12px 20px;border-radius:10px;border:0;background:#334155;color:#fff;cursor:pointer;display:none";
        this.resumeButton.onclick = () => this.opts.onResume();

        this.editButton = document.createElement("button");
        this.editButton.textContent = "Edit routes…";
        this.editButton.style.cssText = "font:600 18px system-ui;padding:12px 20px;border-radius:10px;border:0;background:#475569;color:#fff;cursor:pointer;margin-left:auto";
        this.editButton.onclick = () => { this.editButton.blur(); this.opts.onEdit(); };

        const buttonRow = document.createElement("div");
        buttonRow.style.cssText = "display:flex;gap:12px";
        buttonRow.append(this.startButton, this.resumeButton, this.editButton);

        this.progress = document.createElement("progress");
        this.progress.style.cssText = "width:100%;display:none";
        this.progressLabel = document.createElement("div");
        this.progressLabel.style.cssText = "font-size:13px;opacity:.85;display:none";

        this.errorLine = document.createElement("div");
        this.errorLine.style.cssText = "font-size:14px;color:#f87171;min-height:18px";

        panel.append(title, this.statusLine, this.routeList, worldScaleWrap, loopWrap, soundWrap, buttonRow, this.progress, this.progressLabel, this.errorLine);
        this.overlay.appendChild(panel);
        document.body.appendChild(this.overlay);

        this.renderRouteList();
        void this.loadCatalogAndRender();
    }

    private async loadCatalogAndRender(): Promise<void> {
        const { routes, errors } = await loadCatalog();
        // Read the checked radio after the fetch, not before: capturing it up front would
        // discard a click that lands during the (possibly slow) network round trip.
        const preferId = (this.routeList.querySelector("input[type=radio]:checked") as HTMLInputElement | null)?.value || undefined;
        this.catalog = routes;
        this.catalogErrors = errors;
        this.catalogLoaded = true;
        this.renderRouteList(preferId);
    }

    private renderRouteList(preferId?: string): void {
        this.routeList.innerHTML = "";
        if (this.catalogLoaded && this.catalog.length === 0 && this.catalogErrors.length === 0) {
            const empty = document.createElement("div");
            empty.textContent = "No routes found in routes/";
            empty.style.cssText = "font-size:14px;opacity:.7";
            this.routeList.appendChild(empty);
        }
        const wantId = preferId ?? this.settings.lastRouteId;
        const matchIndex = this.catalog.findIndex((e) => e.route.id === wantId);
        const selectIndex = wantId !== null && matchIndex >= 0 ? matchIndex : (this.catalog.length > 0 ? 0 : -1);
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

        for (const err of this.catalogErrors) {
            const line = document.createElement("div");
            line.textContent = `${err.file}: ${err.message}`;
            line.style.cssText = "font-size:13px;color:#f87171";
            this.routeList.appendChild(line);
        }
    }

    /** Current inputs as Settings (lastRouteId from the current settings; start() overrides it). */
    private readSettings(): Settings {
        return {
            worldScale: clampWorldScale(parseFloat(this.worldScaleInput.value)),
            loop: this.loopInput.checked,
            lastRouteId: this.settings.lastRouteId,
            sound: this.soundInput.checked,
            musicVolume: clampVolume(parseFloat(this.musicVolumeInput.value)),
            ambienceVolume: clampVolume(parseFloat(this.ambienceVolumeInput.value)),
        };
    }

    /** Keeps the checkbox in step when `M` toggles sound during a run. */
    public setSound(on: boolean): void { this.soundInput.checked = on; this.settings = { ...this.settings, sound: on }; }

    private async refreshStatus(): Promise<void> {
        this.statusText.textContent = "Data server: checking…";
        const up = await this.opts.serverUp();
        const host = DATA_SERVER.replace(/^https?:\/\//, "");
        this.statusText.textContent = up ? "Data server: running" : `Data server: not reachable at ${host} — run pnpm run server`;
    }

    private async start(): Promise<void> {
        if (this.starting) return;
        this.starting = true;
        this.startButton.disabled = true;
        this.errorLine.textContent = "";
        const selected = this.routeList.querySelector("input[type=radio]:checked") as HTMLInputElement | null;
        const routeId = selected?.value || null;
        const route = routeId ? this.catalog.find((e) => e.route.id === routeId)?.route ?? null : null;
        const settings: Settings = { ...this.readSettings(), lastRouteId: route ? route.id : null };
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

    public get visible(): boolean { return this.overlay.style.display !== "none"; }

    public get canResume(): boolean { return this.resumable; }

    /** Feedback line for input that has no other visible effect (e.g. Escape with nothing to resume). */
    public setError(text: string): void { this.errorLine.textContent = text; }

    public show(opts: { canResume?: boolean } = {}): void {
        this.resumable = opts.canResume ?? this.hasChosen;
        this.resumeButton.style.display = this.resumable ? "" : "none";
        this.overlay.style.display = "flex";
        void this.refreshStatus();
        void this.loadCatalogAndRender();     // a route saved from the editor shows up without a reload
    }

    public hide(): void {
        this.overlay.style.display = "none";
        this.hasChosen = true;
    }

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
