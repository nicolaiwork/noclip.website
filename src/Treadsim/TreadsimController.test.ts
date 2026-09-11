import { describe, expect, it } from "vitest";
import { mat4 } from "gl-matrix";
import { DEFAULT_EYE_HEIGHT, TreadsimController } from "./TreadsimController.js";
import { ManualSpeedModel } from "./ManualSpeed.js";
import { GroundSampler } from "./GroundSampler.js";
import { RoutePath } from "./RoutePath.js";
import { RouteFollower } from "./RouteFollower.js";
import { noclipFromAdt } from "./coords.js";

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
        expect(cam.worldMatrix[13]).toBeCloseTo(Math.fround(GATE.ground + DEFAULT_EYE_HEIGHT), 6);
    });
});

describe("TreadsimController route mode", () => {
    const flat = (h: number) => new GroundSampler({ heightAt: () => h }, { floorBelow: () => undefined });
    const northLine = () => new RoutePath([{ x: -9000, y: 300 }, { x: -8900, y: 300 }], [{ name: "a", index: 0 }, { name: "b", index: 1 }]);

    it("places the camera on the path at ground + eye height, facing along it", async () => {
        const source = new ManualSpeedModel();
        const c = new TreadsimController(source, { worldScale: 1 });
        const cam = cameraFacingNegZ();
        c.attachCamera(cam);
        c.groundSampler = flat(40);
        c.setRoute(new RouteFollower(northLine()));
        await source.start();
        source.setSpeedKmh(3.6); source.toggleRunning();
        for (let i = 0; i < 100; i++) c.tick(0.1, { yaw: 0, pitch: 0 }); // ~10 s at 1 m/s
        const m = cam.worldMatrix;
        const s = c.follower!.s;
        expect(s).toBeGreaterThan(8); expect(s).toBeLessThan(10);
        // worldMatrix is a Float32Array (gl-matrix default): fround the expected value to
        // match the same rounding the position assignment in `tick` goes through (as the
        // pre-existing Stormwind-gate test above does).
        const [nx, ny, nz] = noclipFromAdt([-9000 + s, 300, 40 + DEFAULT_EYE_HEIGHT]);
        expect(m[12]).toBeCloseTo(Math.fround(nx), 5); expect(m[13]).toBeCloseTo(Math.fround(ny), 5); expect(m[14]).toBeCloseTo(Math.fround(nz), 5);
        // heading +x (game north) is noclip forward (0,0,-1): -m[8..10]
        expect(-m[8]).toBeCloseTo(0, 6); expect(-m[10]).toBeCloseTo(-1, 6);
        expect(c.distanceM).toBeCloseTo(s, 3);
    });

    it("applies the look offset on top of the route heading", () => {
        const c = new TreadsimController(new ManualSpeedModel());
        const cam = cameraFacingNegZ();
        c.attachCamera(cam); c.groundSampler = flat(0);
        c.setRoute(new RouteFollower(northLine()));
        c.tick(0.016, { yaw: Math.PI / 2, pitch: 0 });
        const m = cam.worldMatrix;
        expect(-m[8]).toBeCloseTo(-1, 6); // forward now noclip -x
        expect(-m[10]).toBeCloseTo(0, 6);
    });

    it("keeps the last eye height when nothing is loaded underneath", () => {
        let h: number | undefined = 25;
        const c = new TreadsimController(new ManualSpeedModel());
        const cam = cameraFacingNegZ();
        c.attachCamera(cam);
        c.groundSampler = new GroundSampler({ heightAt: () => h }, { floorBelow: () => undefined });
        c.setRoute(new RouteFollower(northLine()));
        c.tick(0.016, { yaw: 0, pitch: 0 });
        expect(cam.worldMatrix[13]).toBeCloseTo(Math.fround(25 + DEFAULT_EYE_HEIGHT), 6);
        h = undefined;
        c.tick(0.016, { yaw: 0, pitch: 0 });
        expect(cam.worldMatrix[13]).toBeCloseTo(Math.fround(25 + DEFAULT_EYE_HEIGHT), 6);
    });

    it("setRoute(null) returns to free roam and resets the odometer", () => {
        const c = new TreadsimController(new ManualSpeedModel());
        c.attachCamera(cameraFacingNegZ()); c.groundSampler = flat(0);
        c.setRoute(new RouteFollower(northLine()));
        c.setRoute(null);
        expect(c.follower).toBeNull();
        expect(c.distanceM).toBe(0); expect(c.elapsedS).toBe(0);
    });

    it("teleportTo puts the camera at terrain + eye height in free roam", () => {
        const c = new TreadsimController(new ManualSpeedModel());
        const cam = cameraFacingNegZ();
        c.attachCamera(cam); c.groundSampler = flat(70);
        c.teleportTo(-8913, -137);
        const [nx, ny, nz] = noclipFromAdt([-8913, -137, 70 + DEFAULT_EYE_HEIGHT]);
        expect(cam.worldMatrix[12]).toBeCloseTo(Math.fround(nx), 6); expect(cam.worldMatrix[13]).toBeCloseTo(Math.fround(ny), 6); expect(cam.worldMatrix[14]).toBeCloseTo(Math.fround(nz), 6);
    });

    it("stops accumulating distance once the route is finished", async () => {
        const source = new ManualSpeedModel();
        const c = new TreadsimController(source, { worldScale: 1 });
        c.attachCamera(cameraFacingNegZ()); c.groundSampler = flat(0);
        const short = new RoutePath([{ x: 0, y: 0 }, { x: 4, y: 0 }], [{ name: "a", index: 0 }, { name: "b", index: 1 }]);
        c.setRoute(new RouteFollower(short));
        await source.start();
        source.setSpeedKmh(3.6); source.toggleRunning(); // 1 m/s
        for (let i = 0; i < 100; i++) c.tick(0.1); // ~10 s: finishes the 4-unit route within the first few seconds
        expect(c.follower!.finished).toBe(true);
        const atFinish = c.distanceM;
        expect(atFinish).toBeGreaterThan(3.9); expect(atFinish).toBeLessThan(4.6); // ~4 plus the last partial step
        for (let i = 0; i < 20; i++) c.tick(0.1);
        expect(c.distanceM).toBe(atFinish);
    });
});
