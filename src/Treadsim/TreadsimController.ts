import { mat4, vec3 } from "gl-matrix";
import { SpeedSmoother } from "./SpeedSmoother.js";
import type { SpeedSource } from "./SpeedSource.js";
import type { GroundSampler } from "./GroundSampler.js";
import { adtFromNoclip, noclipFromAdt } from "./coords.js";
import type { RouteFollower } from "./RouteFollower.js";

export interface CameraLike {
    worldMatrix: Float32Array | number[];
    worldMatrixUpdated(): void;
}

// Raised from 1.8 after the Phase 4 run; a start-screen setting is planned.
export const DEFAULT_EYE_HEIGHT = 2.2;

/**
 * Moves the camera by the smoothed treadmill speed. Free roam: a step along the camera's
 * horizontal forward, then the ground sampler pins the eye to ground + eyeHeight. Route mode
 * (`setRoute`): the RouteFollower owns position and heading, the mouse adds a look offset.
 * This class is the only place that converts between noclip space and game (ADT) space.
 */
export class TreadsimController {
    public worldScale: number;
    public eyeHeight: number;
    public groundSampler: GroundSampler | null = null;
    public follower: RouteFollower | null = null;
    private lastEyeZ: number | null = null;
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

    /** Enter route mode (or leave it with null). Resets odometer, smoother and ground filter. */
    public setRoute(follower: RouteFollower | null): void {
        this.follower = follower;
        this._distanceM = 0; this._elapsedS = 0;
        this.smoother.reset();
        this.groundSampler?.reset();
        this.lastEyeZ = null;
    }

    /** Free-roam helper: drop the camera at a game-space (x, y) on the terrain. */
    public teleportTo(x: number, y: number): void {
        if (!this.camera) return;
        const m = this.camera.worldMatrix;
        this.groundSampler?.reset();
        const g = this.groundSampler?.height(x, y, undefined, this.eyeHeight);
        const z = g !== undefined ? g + this.eyeHeight : m[13];
        const [nx, ny, nz] = noclipFromAdt([x, y, z]);
        m[12] = nx; m[13] = ny; m[14] = nz;
        this.lastEyeZ = null;
        this.camera.worldMatrixUpdated();
    }

    public tick(dtSeconds: number, look: { yaw: number; pitch: number } = { yaw: 0, pitch: 0 }): void {
        const dt = Math.min(0.1, Math.max(0, dtSeconds));
        const mps = this.smoother.update(this.rawSpeedMps, dt);
        const moving = this.rawSpeedMps > 0 || mps > 0.01;
        if (moving) this._elapsedS += dt;
        if (!this.camera) return;
        if (this.follower) { this.tickRoute(dt, mps, look); return; }
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
            // The only noclip <-> game conversion in the ground path: camera position to ADT,
            // sample, and write the eye height back (ADT z is noclip y).
            const [ax, ay, az] = adtFromNoclip([m[12], m[13], m[14]]);
            const z = this.groundSampler.eyeZ(ax, ay, az, this.eyeHeight, dt);
            if (z !== undefined) m[13] = z;
        }
        if (moving || this.groundSampler) this.camera.worldMatrixUpdated();
    }

    private tickRoute(dt: number, mps: number, look: { yaw: number; pitch: number }): void {
        const f = this.follower!;
        const wasFinished = f.finished;
        const pose = f.update(dt, mps, this.worldScale);
        if (!wasFinished && mps > 0.01) this._distanceM += mps * dt;
        const m = this.camera!.worldMatrix as unknown as mat4;
        let z = this.groundSampler?.eyeZ(pose.x, pose.y, this.lastEyeZ ?? undefined, this.eyeHeight, dt);
        if (z === undefined) z = this.lastEyeZ ?? m[13];
        this.lastEyeZ = z;
        mat4.fromYRotation(m, pose.yaw + look.yaw);
        mat4.rotateX(m, m, look.pitch);
        const [nx, ny, nz] = noclipFromAdt([pose.x, pose.y, z]);
        m[12] = nx; m[13] = ny; m[14] = nz;
        this.camera!.worldMatrixUpdated();
    }

    public destroy(): void { this.unsubscribe?.(); this.unsubscribe = null; this.camera = null; }
}
