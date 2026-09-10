import { vec3 } from "gl-matrix";
import { SpeedSmoother } from "./SpeedSmoother.js";
import { SpeedSource } from "./SpeedSource.js";
import type { GroundSampler } from "./GroundSampler.js";

export interface CameraLike {
    worldMatrix: Float32Array | number[];
    worldMatrixUpdated(): void;
}

export const DEFAULT_EYE_HEIGHT = 1.8;

/**
 * Advances the camera each frame by the smoothed treadmill speed along the
 * camera's horizontal forward direction (noclip space: Y up, forward = -Z).
 * Phase 2 sets `groundSampler`, which pins the camera to ground + eye height.
 */
export class TreadsimController {
    public worldScale: number;
    public eyeHeight: number;
    public groundSampler: GroundSampler | null = null;
    private camera: CameraLike | null = null;
    private smoother = new SpeedSmoother();
    private rawSpeedMps = 0;
    private _distanceM = 0;
    private _elapsedS = 0;
    private unsubscribe: (() => void) | null = null;

    constructor(source: SpeedSource, opts: { worldScale?: number; eyeHeight?: number } = {}) {
        this.worldScale = opts.worldScale ?? 1;
        this.eyeHeight = opts.eyeHeight ?? DEFAULT_EYE_HEIGHT;
        this.unsubscribe = source.onSpeed((mps) => { this.rawSpeedMps = mps; });
    }

    public get distanceM(): number { return this._distanceM; }
    public get elapsedS(): number { return this._elapsedS; }
    public get speedMps(): number { return this.smoother.value; }

    public attachCamera(cam: CameraLike): void { this.camera = cam; }

    public tick(dtSeconds: number): void {
        const dt = Math.min(0.1, Math.max(0, dtSeconds));
        const mps = this.smoother.update(this.rawSpeedMps, dt);
        const moving = this.rawSpeedMps > 0 || mps > 0.01;
        if (moving) this._elapsedS += dt;
        if (!this.camera) return;
        const m = this.camera.worldMatrix;
        if (mps > 0.01) {
            const fwd = vec3.fromValues(-m[8], 0, -m[10]);
            if (vec3.length(fwd) > 1e-4) {
                vec3.normalize(fwd, fwd);
                const step = mps * dt * this.worldScale;
                m[12] += fwd[0] * step;
                m[14] += fwd[2] * step;
                this._distanceM += mps * dt;
            }
        }
        if (this.groundSampler) {
            const y = this.groundSampler.eyeY(m[12], m[13], m[14], this.eyeHeight, dt);
            if (y !== undefined) m[13] = y;
        }
        if (moving || this.groundSampler) this.camera.worldMatrixUpdated();
    }

    public destroy(): void { this.unsubscribe?.(); this.unsubscribe = null; this.camera = null; }
}
