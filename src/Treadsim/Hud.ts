import { ManualSpeedModel } from "./ManualSpeed.js";
import { TreadsimController } from "./TreadsimController.js";

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

    constructor(private model: ManualSpeedModel, private controller: TreadsimController) {
        this.root = document.createElement("div");
        this.root.id = "treadsim-hud";
        this.root.style.cssText = `position:fixed;left:50%;bottom:24px;transform:translateX(-50%);
            background:rgba(10,10,20,.78);color:#fff;font:18px/1.35 -apple-system,system-ui,sans-serif;
            padding:14px 22px;border-radius:14px;display:flex;gap:22px;align-items:center;z-index:9999;
            box-shadow:0 4px 24px rgba(0,0,0,.5);backdrop-filter:blur(6px)`;
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
        this.readout.style.cssText = "font-variant-numeric:tabular-nums;min-width:320px;white-space:pre;font-size:22px";
        this.root.append(this.button, wrap, this.readout);
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
            `${(c.distanceM / 1000).toFixed(2)} km   ${fmtClock(c.elapsedS)}   ${m.running ? "running" : "paused"}`;
    }

    public destroy(): void { this.root.remove(); }
}

/** +/- adjust speed in 0.5 km/h steps, Enter toggles start/pause. */
export function bindKeys(model: ManualSpeedModel): () => void {
    const onKey = (e: KeyboardEvent) => {
        if (e.key === "+" || e.key === "=") model.step(0.5);
        else if (e.key === "-") model.step(-0.5);
        else if (e.key === "Enter") {
            // a focused button turns Enter into a native click too; let that be the only toggle
            if ((e.target as HTMLElement | null)?.tagName === "BUTTON") return;
            model.toggleRunning();
        }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
}
