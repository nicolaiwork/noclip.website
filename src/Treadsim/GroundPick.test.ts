import { describe, expect, it } from "vitest";
import { mat4 } from "gl-matrix";
import { marchToGround, pickGround, rayFromScreen } from "./GroundPick.js";

// Camera at the noclip origin, identity orientation (looking down noclip -Z = ADT north), 60 deg fov, 2:1 aspect.
const clip = mat4.perspective(mat4.create(), Math.PI / 3, 2, 1, 1000);
const cam = [0, 0, 0] as const;

describe("rayFromScreen", () => {
    it("centre pixel looks north (ADT +x); top of the screen tilts up (ADT +z); right of the screen is east (ADT -y)", () => {
        const c = rayFromScreen(clip, cam, 400, 200, 800, 400);
        expect(c.dir[0]).toBeCloseTo(1, 6); expect(c.dir[1]).toBeCloseTo(0, 6); expect(c.dir[2]).toBeCloseTo(0, 6);
        expect(c.origin).toEqual([17066, 17066, 0]);
        const top = rayFromScreen(clip, cam, 400, 0, 800, 400);
        expect(top.dir[2]).toBeGreaterThan(0.45);                // tan(30 deg) = 0.577 up per unit forward → 0.4996 normalised
        expect(Math.hypot(...top.dir)).toBeCloseTo(1, 6);
        const right = rayFromScreen(clip, cam, 800, 200, 800, 400);
        expect(right.dir[1]).toBeLessThan(-0.5);
    });
});

describe("marchToGround", () => {
    const flat = () => 10;
    it("hits a flat terrain where the ray crosses it, to within a centimetre", () => {
        const d = Math.SQRT1_2;
        const hit = marchToGround({ origin: [0, 0, 50], dir: [d, 0, -d] }, flat)!;
        expect(hit[0]).toBeCloseTo(40, 2); expect(hit[1]).toBeCloseTo(0, 6); expect(hit[2]).toBeCloseTo(10, 6);
    });
    it("returns undefined when the ray never reaches the ground or no tile is loaded", () => {
        expect(marchToGround({ origin: [0, 0, 50], dir: [1, 0, 0] }, flat, 200)).toBeUndefined();
        expect(marchToGround({ origin: [0, 0, 50], dir: [0, 0, -1] }, () => undefined)).toBeUndefined();
    });
    it("ignores a start below ground and finds the next crossing from above", () => {
        const hill = (x: number) => (x < 20 ? 60 : 10);         // camera starts inside the hill
        const hit = marchToGround({ origin: [0, 0, 50], dir: [Math.SQRT1_2, 0, -Math.SQRT1_2] }, hill)!;
        expect(hit[2]).toBeCloseTo(10, 6);
        expect(hit[0]).toBeCloseTo(40, 2);
    });
});

describe("pickGround", () => {
    it("composes the two: the centre pixel of a camera 30 above flat ground looking down hits below the camera", () => {
        // camera at noclip (100, 40, 200) pitched straight down: forward = noclip -y
        const world = mat4.fromValues(1, 0, 0, 0,  0, 0, -1, 0,  0, 1, 0, 0,  100, 40, 200, 1);
        const view = mat4.invert(mat4.create(), world)!;
        const clipFromWorld = mat4.multiply(mat4.create(), clip, view);
        const hit = pickGround(clipFromWorld, [100, 40, 200], 400, 200, 800, 400, () => 10)!;
        expect(hit[0]).toBeCloseTo(17066 - 200, 3); expect(hit[1]).toBeCloseTo(17066 - 100, 3); expect(hit[2]).toBeCloseTo(10, 6);
    });
});
