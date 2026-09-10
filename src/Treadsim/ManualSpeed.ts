import { KMH_TO_MPS, SpeedSource } from "./SpeedSource.js";

export const MAX_MANUAL_KMH = 20;

/** DOM-free state for the manual slider. The panel in Hud.ts renders it. */
export class ManualSpeedModel implements SpeedSource {
    public readonly id = "manual";
    private _speedKmh = 0;
    private _running = false;
    private speedListeners: Array<(speedMps: number, at: number) => void> = [];
    private changeListeners: Array<() => void> = [];

    public get speedKmh(): number { return this._speedKmh; }
    public get running(): boolean { return this._running; }
    /** Speed actually fed to the follower: zero while paused. */
    public get speedMps(): number { return this._speedKmh * KMH_TO_MPS; }

    public setSpeedKmh(v: number): void {
        const clamped = Math.max(0, Math.min(MAX_MANUAL_KMH, Math.round(v * 10) / 10));
        if (clamped === this._speedKmh) return;
        this._speedKmh = clamped;
        this.emit();
    }

    public step(deltaKmh: number): void { this.setSpeedKmh(this._speedKmh + deltaKmh); }

    public toggleRunning(): void { this._running = !this._running; this.emit(); }

    public async start(): Promise<void> { this.emit(); }
    public stop(): void { this._running = false; this.emit(); }

    public onSpeed(cb: (speedMps: number, at: number) => void): () => void {
        this.speedListeners.push(cb);
        return () => { this.speedListeners = this.speedListeners.filter((l) => l !== cb); };
    }

    public onChange(cb: () => void): () => void {
        this.changeListeners.push(cb);
        return () => { this.changeListeners = this.changeListeners.filter((l) => l !== cb); };
    }

    private emit(): void {
        const v = this._running ? this.speedMps : 0;
        const at = Date.now();
        for (const l of this.speedListeners) l(v, at);
        for (const l of this.changeListeners) l();
    }
}
