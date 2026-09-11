import { describe, expect, it } from "vitest";
import { mat4 } from "gl-matrix";
import { TreadsimCameraController } from "./TreadsimCameraController.js";
import { TreadsimController } from "./TreadsimController.js";
import { ManualSpeedModel } from "./ManualSpeed.js";
import { LookOffset } from "./LookOffset.js";
import { GroundSampler } from "./GroundSampler.js";
import { RoutePath } from "./RoutePath.js";
import { RouteFollower } from "./RouteFollower.js";

function fakeCamera() { return { worldMatrix: mat4.create(), worldMatrixUpdated() {} } as any; }
function fakeInput(dx = 0, dy = 0, dragging = false) {
    return { getMouseDeltaX: () => dx, getMouseDeltaY: () => dy, isDragging: () => dragging } as any;
}
function stubFreeRoam() {
    const calls: string[] = [];
    return {
        calls, camera: null as any, forceUpdate: false,
        cameraUpdateForced() { calls.push("forced"); },
        update() { calls.push("update"); return 1; },
        setSceneMoveSpeedMult() { calls.push("mult"); },
        getKeyMoveSpeed() { return 60; }, setKeyMoveSpeed() {},
    } as any;
}

describe("TreadsimCameraController", () => {
    it("delegates to the free-roam controller when no route is set and ticks the treadmill", () => {
        const ctrl = new TreadsimController(new ManualSpeedModel());
        const fr = stubFreeRoam();
        const cc = new TreadsimCameraController(ctrl, fr, new LookOffset());
        cc.camera = fakeCamera(); cc.forceUpdate = true;
        cc.setSceneMoveSpeedMult(0.01);
        cc.update(fakeInput(), 16, 1);
        expect(fr.calls).toEqual(["mult", "update"]);
        expect(fr.camera).toBe(cc.camera);
        expect(fr.forceUpdate).toBe(true);
        expect(cc.forceUpdate).toBe(false);
    });
    it("in route mode drives the camera itself and feeds mouse drag into the look offset", () => {
        const ctrl = new TreadsimController(new ManualSpeedModel());
        ctrl.groundSampler = new GroundSampler({ heightAt: () => 0 }, { floorBelow: () => undefined });
        ctrl.setRoute(new RouteFollower(new RoutePath([{ x: 0, y: 0 }, { x: 100, y: 0 }], [{ name: "a", index: 0 }, { name: "b", index: 1 }])));
        const fr = stubFreeRoam();
        const look = new LookOffset();
        const cc = new TreadsimCameraController(ctrl, fr, look);
        cc.camera = fakeCamera();
        cc.update(fakeInput(100, 0, true), 16, 1);
        expect(fr.calls).toEqual([]);
        expect(look.yaw).toBeCloseTo(-0.2, 9);
        expect(cc.camera.worldMatrix[13]).toBeCloseTo(1.8, 6);
    });
    it("reports Unchanged when standing still with no drag, so noclip does not autosave every frame", () => {
        const ctrl = new TreadsimController(new ManualSpeedModel());
        ctrl.setRoute(new RouteFollower(new RoutePath([{ x: 0, y: 0 }, { x: 100, y: 0 }], [{ name: "a", index: 0 }, { name: "b", index: 1 }])));
        const cc = new TreadsimCameraController(ctrl, stubFreeRoam(), new LookOffset());
        cc.camera = fakeCamera();
        expect(cc.update(fakeInput(), 16, 1)).toBe(1);   // first frame places the camera
        expect(cc.update(fakeInput(), 16, 1)).toBe(0);   // then nothing moves
    });
    it("in fly mode runs only the free-roam controller: no treadmill tick, no ground pin, even with a route set", () => {
        const ctrl = new TreadsimController(new ManualSpeedModel());
        ctrl.groundSampler = new GroundSampler({ heightAt: () => 50 }, { floorBelow: () => undefined });
        ctrl.setRoute(new RouteFollower(new RoutePath([{ x: 0, y: 0 }, { x: 100, y: 0 }], [{ name: "a", index: 0 }, { name: "b", index: 1 }])));
        const fr = stubFreeRoam();
        const cc = new TreadsimCameraController(ctrl, fr, new LookOffset());
        cc.camera = fakeCamera(); cc.forceUpdate = true;
        cc.flyMode = true;
        cc.update(fakeInput(), 16, 1);
        expect(fr.calls).toEqual(["update"]);
        expect(fr.forceUpdate).toBe(true);
        expect(cc.camera.worldMatrix[13]).toBe(0);      // not pinned to ground + 1.8
        expect(ctrl.follower!.s).toBe(0);
        cc.flyMode = false;
        cc.update(fakeInput(), 16, 1);
        expect(fr.calls).toEqual(["update"]);           // route mode again: follower drives
        expect(cc.camera.worldMatrix[13]).toBeCloseTo(Math.fround(51.8), 5);
    });
});
