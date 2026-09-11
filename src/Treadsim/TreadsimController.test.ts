import { describe, expect, it } from "vitest";
import { mat4 } from "gl-matrix";
import { TreadsimController } from "./TreadsimController.js";
import { ManualSpeedModel } from "./ManualSpeed.js";
import { GroundSampler } from "./GroundSampler.js";

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

    it("samples the ground in game coordinates (pinned to the Phase 2 smoke value at Stormwind's gate)", () => {
        // Real-scene reading: camera noclip (16751.93, 81.01, 26250.55) stood on ground 79.21.
        const GATE = { x: -9184.55, y: 314.07, ground: 79.21 };
        const terrain = {
            heightAt: (x: number, y: number) =>
                Math.abs(x - GATE.x) < 0.05 && Math.abs(y - GATE.y) < 0.05 ? GATE.ground : undefined,
        };
        const source = new ManualSpeedModel();
        const c = new TreadsimController(source);
        const cam = cameraFacingNegZ();
        cam.worldMatrix[12] = 16751.93; cam.worldMatrix[13] = 200; cam.worldMatrix[14] = 26250.55;
        c.attachCamera(cam);
        c.groundSampler = new GroundSampler(terrain, { floorBelow: () => undefined });
        c.tick(0.016);
        // A space regression (passing noclip coords to the sampler) leaves Y at 200.
        // worldMatrix is a Float32Array (gl-matrix default), so compare against the
        // same float32 rounding the assignment in `tick` goes through.
        expect(cam.worldMatrix[13]).toBeCloseTo(Math.fround(GATE.ground + 1.8), 6);
    });
});
