/** Low-pass on camera height so heightmap steps don't jitter the view; snaps on big jumps. */
export class HeightFilter {
    private v: number | null = null;

    constructor(private tauSeconds = 0.3, private snapDelta = 3) {}

    public reset(): void { this.v = null; }

    public update(target: number, dt: number): number {
        if (this.v === null || Math.abs(target - this.v) > this.snapDelta) { this.v = target; return target; }
        const alpha = 1 - Math.exp(-dt / this.tauSeconds);
        this.v += alpha * (target - this.v);
        return this.v;
    }
}
