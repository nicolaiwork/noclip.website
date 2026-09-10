// treadsim spike: manual treadmill-speed overlay. Moves the noclip camera
// forward along its horizontal view direction at a treadmill speed. Constant
// height for now (no terrain height query yet); steer with the mouse.
import { mat4, vec3 } from "gl-matrix";

const KMH_TO_MPS = 1000 / 3600;

export class TreadsimOverlay {
    private speedKmh = 0;
    private running = false;
    private distanceM = 0;
    private elapsedS = 0;
    private lastT: number | null = null;
    // 1 WoW unit ≈ 1 yard; treat 1 m on the treadmill as `worldScale` units.
    public worldScale = 1.0;
    private root: HTMLDivElement;
    private readout: HTMLDivElement;
    private slider: HTMLInputElement;
    private raf = 0;

    constructor() {
        const root = document.createElement("div");
        root.id = "treadsim";
        root.style.cssText = `position:fixed;left:50%;bottom:24px;transform:translateX(-50%);
            background:rgba(10,10,20,.78);color:#fff;font:14px/1.4 -apple-system,system-ui,sans-serif;
            padding:12px 18px;border-radius:12px;display:flex;gap:18px;align-items:center;z-index:9999;
            box-shadow:0 4px 24px rgba(0,0,0,.5);backdrop-filter:blur(6px)`;
        const btn = document.createElement("button");
        btn.textContent = "▶ Start";
        btn.style.cssText = "font:600 14px system-ui;padding:8px 14px;border-radius:8px;border:0;background:#3b82f6;color:#fff;cursor:pointer";
        btn.onclick = () => { this.running = !this.running; btn.textContent = this.running ? "❚❚ Pause" : "▶ Start"; this.lastT = null; };
        const sliderWrap = document.createElement("label");
        sliderWrap.style.cssText = "display:flex;flex-direction:column;gap:2px;font-size:12px;opacity:.9";
        sliderWrap.textContent = "Treadmill speed";
        const slider = document.createElement("input");
        slider.type = "range"; slider.min = "0"; slider.max = "20"; slider.step = "0.1"; slider.value = "0";
        slider.style.width = "260px";
        slider.oninput = () => { this.speedKmh = parseFloat(slider.value); this.updateReadout(); };
        sliderWrap.appendChild(slider);
        const readout = document.createElement("div");
        readout.style.cssText = "font-variant-numeric:tabular-nums;min-width:280px;white-space:pre";
        root.append(btn, sliderWrap, readout);
        document.body.appendChild(root);
        this.root = root; this.readout = readout; this.slider = slider;
        this.updateReadout();
        this.raf = requestAnimationFrame(this.tick);
        // keyboard: +/- adjusts speed so hands stay on the rail
        window.addEventListener("keydown", this.onKey);
    }

    private onKey = (e: KeyboardEvent) => {
        if (e.key === "+" || e.key === "=") this.setSpeed(this.speedKmh + 0.5);
        else if (e.key === "-") this.setSpeed(this.speedKmh - 0.5);
        else if (e.key === "Enter") { this.running = !this.running; this.lastT = null; }
    };

    public setSpeed(kmh: number) {
        this.speedKmh = Math.max(0, Math.min(20, kmh));
        this.slider.value = this.speedKmh.toFixed(1);
        this.updateReadout();
    }

    private updateReadout() {
        const pace = this.speedKmh > 0 ? 60 / this.speedKmh : 0;
        const paceStr = pace > 0 ? `${Math.floor(pace)}:${String(Math.round((pace % 1) * 60)).padStart(2, "0")} /km` : "—";
        const mins = Math.floor(this.elapsedS / 60), secs = Math.floor(this.elapsedS % 60);
        this.readout.textContent =
            `${this.speedKmh.toFixed(1)} km/h   ${paceStr}\n` +
            `${(this.distanceM / 1000).toFixed(2)} km   ${mins}:${String(secs).padStart(2, "0")}   ${this.running ? "running" : "paused"}`;
    }

    private tick = (t: number) => {
        this.raf = requestAnimationFrame(this.tick);
        if (!this.running) { this.lastT = t; return; }
        if (this.lastT === null) { this.lastT = t; return; }
        const dt = Math.min(0.1, (t - this.lastT) / 1000);
        this.lastT = t;
        const mps = this.speedKmh * KMH_TO_MPS;
        if (mps <= 0) return;
        const main = (window as any).main;
        const camera = main?.viewer?.camera;
        if (!camera) return;
        const m: mat4 = camera.worldMatrix;
        // camera forward is -Z of the world matrix; flatten to the horizontal plane (Y up)
        const fwd = vec3.fromValues(-m[8], 0, -m[10]);
        if (vec3.length(fwd) < 1e-4) return;
        vec3.normalize(fwd, fwd);
        const step = mps * dt * this.worldScale;
        m[12] += fwd[0] * step; m[13] += fwd[1] * step; m[14] += fwd[2] * step;
        camera.worldMatrixUpdated();
        this.distanceM += mps * dt;
        this.elapsedS += dt;
        this.updateReadout();
    };

    public destroy() {
        cancelAnimationFrame(this.raf);
        window.removeEventListener("keydown", this.onKey);
        this.root.remove();
    }
}

let current: TreadsimOverlay | null = null;
export function installTreadsimOverlay(): TreadsimOverlay {
    if (current) current.destroy();
    current = new TreadsimOverlay();
    (window as any).treadsim = current;
    return current;
}
