import { describe, expect, it } from "vitest";
import { mat4 } from "gl-matrix";
import { WmoFloorCaster } from "./WmoFloorCaster.js";

/** One group: a 20x20 floor quad at model-space z = 3 (Z up), plus a vertical wall we must not hit. */
function floorWmo() {
    const positions = new Float32Array([
        -10, -10, 3,   10, -10, 3,   10, 10, 3,   -10, 10, 3,   // floor
        -10, -10, 3,  -10, -10, 9,  -10, 10, 9,                 // wall triangle
    ]);
    const indices = new Uint16Array([0, 1, 2, 0, 2, 3, 4, 5, 6]);
    return {
        vertexBuffer: new Uint8Array(positions.buffer),
        indexBuffer: indices,
        groupDescriptors: [{ group_id: 0, antiportal: false, vertex_buffer_offset: 0, index_buffer_offset: 0, num_vertices: 7, num_indices: 9 }],
    };
}

function defAt(modelMatrix: mat4, worldAABB: { min: number[]; max: number[] }) {
    return { invModelMatrix: mat4.invert(mat4.create(), modelMatrix)!, worldAABB, wmo: floorWmo() };
}

describe("WmoFloorCaster (ADT space, Z up)", () => {
    it("finds the floor under the eye through a translated placement", () => {
        const def = defAt(mat4.fromTranslation(mat4.create(), [-9000, 300, 50]),
            { min: [-9010, 290, 50], max: [-8990, 310, 62] });
        const caster = new WmoFloorCaster({ adts: [{ lodWmoDefs: () => [def] }], globalWmoDef: null });
        expect(caster.floorBelow(-8998, 303, 56, 20)).toBeCloseTo(53, 6); // 50 + 3
    });

    it("finds the floor through a yawed, uniformly scaled placement (direction = -inv column 3)", () => {
        // model -> world: scale 2, rotate 30 deg about Z, translate. Floor lands at world z = 50 + 2*3 = 56.
        const m = mat4.create();
        mat4.translate(m, m, [100, 200, 50]);
        mat4.rotateZ(m, m, Math.PI / 6);
        mat4.scale(m, m, [2, 2, 2]);
        const def = defAt(m, { min: [70, 170, 50], max: [130, 230, 70] });
        const caster = new WmoFloorCaster({ adts: [], globalWmoDef: def });
        expect(caster.floorBelow(101, 202, 60, 20)).toBeCloseTo(56, 5);
    });

    it("returns undefined when nothing is below within maxDrop, or the point is outside every WMO", () => {
        const def = defAt(mat4.create(), { min: [-10, -10, 0], max: [10, 10, 12] });
        const caster = new WmoFloorCaster({ adts: [], globalWmoDef: def });
        expect(caster.floorBelow(0, 0, 6, 1)).toBeUndefined();     // floor 3 below, maxDrop 1
        expect(caster.floorBelow(50, 50, 6, 20)).toBeUndefined();  // outside on x/y
        expect(caster.floorBelow(0, 0, 6, 20)).toBeCloseTo(3, 6);
    });

    it("skips WMOs entirely above the eye and entirely below reach", () => {
        const above = defAt(mat4.fromTranslation(mat4.create(), [0, 0, 100]), { min: [-10, -10, 100], max: [10, 10, 112] });
        const below = defAt(mat4.fromTranslation(mat4.create(), [0, 0, -100]), { min: [-10, -10, -100], max: [10, 10, -88] });
        const caster = new WmoFloorCaster({ adts: [{ lodWmoDefs: () => [above, below] }], globalWmoDef: null });
        expect(caster.floorBelow(0, 0, 6, 20)).toBeUndefined();
    });
});
