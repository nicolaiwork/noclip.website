/**
 * First-order low-pass on speed samples with an acceleration clamp, so a noisy
 * source (a future watch) can't make the camera lurch.
 */
export class SpeedSmoother {
    private v = 0;

    constructor(private tauSeconds = 1.5, private maxAccelMps2 = 1.5) {}

    public get value(): number { return this.v; }

    public reset(v = 0): void { this.v = v; }

    public update(sampleMps: number, dtSeconds: number): number {
        const alpha = 1 - Math.exp(-dtSeconds / this.tauSeconds);
        let next = this.v + alpha * (sampleMps - this.v);
        const maxDelta = this.maxAccelMps2 * dtSeconds;
        next = Math.max(this.v - maxDelta, Math.min(this.v + maxDelta, next));
        this.v = next;
        return next;
    }
}
