import type { ManualSpeedModel } from "./ManualSpeed.js";
import type { TreadsimController } from "./TreadsimController.js";

function fmtPace(kmh: number): string {
    if (kmh <= 0) return "—";
    const pace = 60 / kmh;
    return `${Math.floor(pace)}:${String(Math.round((pace % 1) * 60)).padStart(2, "0")} /km`;
}
function fmtClock(s: number): string {
    return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
}

/** Bottom-centre panel: start/pause, slider, big readout. Readable from two metres. */
export class Hud {
    private root: HTMLDivElement;
    private readout: HTMLDivElement;
    private slider: HTMLInputElement;
    private button: HTMLButtonElement;
    private routesButton: HTMLButtonElement;
    private toast: HTMLDivElement | null = null;
    private toastTimer: ReturnType<typeof setTimeout> | null = null;

    constructor(private model: ManualSpeedModel, private controller: TreadsimController, opts: { onRoutes(): void }) {
        this.root = document.createElement("div");
        this.root.id = "treadsim-hud";
        this.root.style.cssText = `position:fixed;left:50%;bottom:24px;transform:translateX(-50%);
            background:rgba(10,10,20,.78);color:#fff;font:18px/1.35 -apple-system,system-ui,sans-serif;
            padding:14px 22px;border-radius:14px;display:flex;gap:22px;align-items:center;z-index:9999;
            box-shadow:0 4px 24px rgba(0,0,0,.5);backdrop-filter:blur(6px)`;
        this.routesButton = document.createElement("button");
        this.routesButton.textContent = "⋯ Routes";
        this.routesButton.style.cssText = "font:600 16px system-ui;padding:10px 16px;border-radius:10px;border:0;background:#334155;color:#fff;cursor:pointer";
        this.routesButton.onclick = () => { opts.onRoutes(); this.routesButton.blur(); };
        this.button = document.createElement("button");
        this.button.style.cssText = "font:600 18px system-ui;padding:10px 18px;border-radius:10px;border:0;background:#3b82f6;color:#fff;cursor:pointer";
        // blur after clicking, or the button keeps focus and a later Enter both bubbles to
        // bindKeys and re-fires this click — two toggles, i.e. no visible change.
        this.button.onclick = () => { model.toggleRunning(); this.button.blur(); };
        const wrap = document.createElement("label");
        wrap.style.cssText = "display:flex;flex-direction:column;gap:4px;font-size:13px;opacity:.9";
        wrap.textContent = "Treadmill speed";
        this.slider = document.createElement("input");
        this.slider.type = "range"; this.slider.min = "0"; this.slider.max = "20"; this.slider.step = "0.1";
        this.slider.style.width = "280px";
        this.slider.oninput = () => model.setSpeedKmh(parseFloat(this.slider.value));
        wrap.appendChild(this.slider);
        this.readout = document.createElement("div");
        this.readout.style.cssText = "font-variant-numeric:tabular-nums;min-width:320px;white-space:pre;font-size:26px";
        this.root.append(this.routesButton, this.button, wrap, this.readout);
        document.body.appendChild(this.root);
        model.onChange(() => this.render());
        this.render();
    }

    /** Called once per frame by the install loop. */
    public render(): void {
        const m = this.model, c = this.controller;
        this.button.textContent = m.running ? "❚❚ Pause" : "▶ Start";
        this.slider.value = m.speedKmh.toFixed(1);
        this.readout.textContent =
            `${m.speedKmh.toFixed(1)} km/h   ${fmtPace(m.speedKmh)}\n` +
            `${(c.distanceM / 1000).toFixed(2)} km   ${fmtClock(c.elapsedS)}   ${m.running ? "running" : "paused"}` +
            this.thirdLine();
    }

    /** Route-mode stop info: next stop and distance, or "Finished — <last stop>". Empty in free roam. */
    private thirdLine(): string {
        const f = this.controller.follower;
        if (!f) return "";
        if (f.finished) {
            const last = f.path.stops[f.path.stops.length - 1];
            return `\nFinished — ${last.name}`;
        }
        const i = f.nextStopIndex;
        const dist = f.distanceToNextStop();
        if (i === undefined || dist === undefined) return "";
        const stop = f.path.stops[i];
        return `\n→ ${stop.name}  ${(dist / this.controller.worldScale / 1000).toFixed(2)} km`;
    }

    /**
     * Centred top banner that fades out after `ms`. Reuses a single element so two
     * toasts firing close together (e.g. the last stop's arrival and route-finished)
     * replace each other's text instead of stacking.
     */
    public showToast(text: string, ms = 4000): void {
        if (!this.toast) {
            this.toast = document.createElement("div");
            this.toast.style.cssText = "position:fixed;top:12%;left:50%;transform:translateX(-50%);font:600 34px system-ui;padding:16px 28px;border-radius:14px;background:rgba(10,10,20,.8);color:#fff;z-index:10002;transition:opacity .6s";
            document.body.appendChild(this.toast);
        }
        if (this.toastTimer !== null) clearTimeout(this.toastTimer);
        this.toast.textContent = text;
        this.toast.style.opacity = "1";
        this.toastTimer = setTimeout(() => { this.toast!.style.opacity = "0"; }, ms);
    }

    public destroy(): void {
        this.root.remove();
        if (this.toastTimer !== null) clearTimeout(this.toastTimer);
        this.toast?.remove();
    }
}

/** +/- adjust speed in 0.5 km/h steps, Enter toggles start/pause, Escape opens the route picker. */
export function bindKeys(model: ManualSpeedModel, handlers: { onEscape(): void }): () => void {
    const onKey = (e: KeyboardEvent) => {
        if (e.metaKey || e.ctrlKey || e.altKey) return;
        if (e.key === "+" || e.key === "=") model.step(0.5);
        else if (e.key === "-") model.step(-0.5);
        else if (e.key === "Enter") {
            // a focused button turns Enter into a native click too; let that be the only toggle
            if ((e.target as HTMLElement | null)?.tagName === "BUTTON") return;
            model.toggleRunning();
        } else if (e.key === "Escape") handlers.onEscape();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
}
