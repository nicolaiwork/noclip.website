/**
 * Mouse look on top of the route heading: drag to look around, release and the view
 * eases back onto the road. Radians. Sign convention matches noclip's FPS camera.
 */
export class LookOffset {
    public yaw = 0;
    public pitch = 0;

    constructor(
        private sensitivity = 1 / 500,
        private maxPitch = 60 * Math.PI / 180,
        private maxYaw = 150 * Math.PI / 180,
        private tauSeconds = 0.5,
    ) {}

    public update(dxPx: number, dyPx: number, dragging: boolean, dtSeconds: number): void {
        if (dragging) {
            this.yaw = clamp(this.yaw - dxPx * this.sensitivity, -this.maxYaw, this.maxYaw);
            this.pitch = clamp(this.pitch - dyPx * this.sensitivity, -this.maxPitch, this.maxPitch);
            return;
        }
        const alpha = 1 - Math.exp(-dtSeconds / this.tauSeconds);
        this.yaw -= alpha * this.yaw;
        this.pitch -= alpha * this.pitch;
    }

    public reset(): void { this.yaw = 0; this.pitch = 0; }
}

function clamp(v: number, lo: number, hi: number): number { return Math.max(lo, Math.min(hi, v)); }
