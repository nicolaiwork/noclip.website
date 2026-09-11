import type { Camera, CameraController, CameraUpdateResult } from "../Camera.js";
import type InputManager from "../InputManager.js";
import type { TreadsimController } from "./TreadsimController.js";
import type { LookOffset } from "./LookOffset.js";

// Camera.ts drags the whole viewer into the bundle and cannot load under vitest, so the
// enum values are spelled out: CameraUpdateResult { Unchanged = 0, Changed = 1, ImportantChange = 2 }.
const UNCHANGED = 0 as CameraUpdateResult;
const CHANGED = 1 as CameraUpdateResult;

/**
 * noclip CameraController for Treadsim. Free roam: noclip's FPS controller moves and
 * looks, then the treadmill step and ground follow are applied. Route mode: the
 * follower owns position and heading; the mouse only adds a LookOffset.
 * Runs inside the viewer's update, before render, so there is no frame of lag.
 */
export class TreadsimCameraController implements CameraController {
    public camera!: Camera;
    public forceUpdate = false;
    private lastMatrix = new Float32Array(16);

    constructor(private controller: TreadsimController, private freeRoam: CameraController, private look: LookOffset) {}

    public cameraUpdateForced(): void { this.freeRoam.cameraUpdateForced(); }
    public setSceneMoveSpeedMult(v: number): void { this.freeRoam.setSceneMoveSpeedMult(v); }
    public getKeyMoveSpeed(): number | null { return this.freeRoam.getKeyMoveSpeed(); }
    public setKeyMoveSpeed(speed: number): void { this.freeRoam.setKeyMoveSpeed(speed); }

    public update(inputManager: InputManager, dtMs: number, sceneTimeScale: number): CameraUpdateResult {
        const dt = dtMs / 1000;
        this.controller.attachCamera(this.camera);
        if (this.controller.follower) {
            this.look.update(inputManager.getMouseDeltaX(), inputManager.getMouseDeltaY(), inputManager.isDragging(), dt);
            this.controller.tick(dt, this.look);
        } else {
            this.freeRoam.camera = this.camera;
            this.freeRoam.forceUpdate = this.forceUpdate;
            this.freeRoam.update(inputManager, dtMs, sceneTimeScale);
            this.controller.tick(dt);
        }
        this.forceUpdate = false;
        this.camera.worldMatrixUpdated();
        return this.consumeChanged();
    }

    private consumeChanged(): CameraUpdateResult {
        const m = this.camera.worldMatrix;
        let changed = false;
        for (let i = 0; i < 16; i++) {
            if (Math.abs(m[i] - this.lastMatrix[i]) > 1e-7) { changed = true; }
            this.lastMatrix[i] = m[i];
        }
        return changed ? CHANGED : UNCHANGED;
    }
}
