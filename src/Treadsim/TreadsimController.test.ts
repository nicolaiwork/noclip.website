import { describe, expect, it } from "vitest";
import { mat4 } from "gl-matrix";
import { TreadsimController } from "./TreadsimController.js";
import { ManualSpeedModel } from "./ManualSpeed.js";

function cameraFacingNegZ() {
    const worldMatrix = mat4.create(); // identity: forward is -Z
    let updates = 0;
    return { worldMatrix, worldMatrixUpdated: () => { updates++; }, get updates() { return updates; } };
}

describe("TreadsimController", () => {
    it("moves the camera along horizontal forward at the smoothed speed", async () => {
        const source = new ManualSpeedModel();
        const c = new TreadsimController(source, { worldScale: 1 });
        const cam = cameraFacingNegZ();
        c.attachCamera(cam);
        await source.start();
        source.setSpeedKmh(3.6); // 1 m/s
        source.toggleRunning();
        for (let i = 0; i < 100; i++) c.tick(0.1); // 10 s, smoother converges
        expect(cam.worldMatrix[14]).toBeLessThan(-8);   // moved along -Z
        expect(cam.worldMatrix[14]).toBeGreaterThan(-10);
        expect(cam.worldMatrix[13]).toBe(0);            // no vertical drift without a ground sampler
        expect(c.distanceM).toBeGreaterThan(8);
        expect(c.elapsedS).toBeCloseTo(10, 6);
        expect(cam.updates).toBeGreaterThan(0);
    });

    it("does nothing while paused", () => {
        const source = new ManualSpeedModel();
        const c = new TreadsimController(source);
        const cam = cameraFacingNegZ();
        c.attachCamera(cam);
        source.setSpeedKmh(10);
        c.tick(1);
        expect(cam.worldMatrix[14]).toBe(0);
        expect(c.elapsedS).toBe(0);
    });
});
