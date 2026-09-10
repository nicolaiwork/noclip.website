import { describe, expect, it } from "vitest";
import { mat4 } from "gl-matrix";
import { WmoFloorCaster } from "./WmoFloorCaster.js";

/** A WMO with one group: a 20x20 floor quad at model-space y = 3, plus a wall we must not hit. */
function floorWmo() {
    const positions = new Float32Array([
        -10, 3, -10,   10, 3, -10,   10, 3, 10,   -10, 3, 10,   // floor
        -10, 3, -10,  -10, 9, -10,   -10, 9, 10,                 // a vertical wall triangle
    ]);
    const indices = new Uint16Array([0, 1, 2, 0, 2, 3, 4, 5, 6]);
    return {
        vertexBuffer: new Uint8Array(positions.buffer),
        indexBuffer: indices,
        groupDescriptors: [{ group_id: 0, antiportal: false, vertex_buffer_offset: 0, index_buffer_offset: 0, num_vertices: 7, num_indices: 9 }],
    };
}

describe("WmoFloorCaster", () => {
    it("finds the floor height under the eye through the model matrix", () => {
        const modelMatrix = mat4.fromTranslation(mat4.create(), [100, 50, 200]);
        const def = {
            invModelMatrix: mat4.invert(mat4.create(), modelMatrix)!,
            worldAABB: { min: [90, 50, 190], max: [110, 62, 210] },
            wmo: floorWmo(),
        };
        const caster = new WmoFloorCaster({ adts: [{ lodWmoDefs: () => [def] }], globalWmoDef: null });
        expect(caster.floorBelow(102, 56, 203, 20)).toBeCloseTo(53, 6); // 50 + 3
    });
    it("returns undefined when nothing is below within maxDrop or the point is outside every WMO", () => {
        const def = { invModelMatrix: mat4.create(), worldAABB: { min: [-10, 0, -10], max: [10, 12, 10] }, wmo: floorWmo() };
        const caster = new WmoFloorCaster({ adts: [], globalWmoDef: def });
        expect(caster.floorBelow(0, 6, 0, 1)).toBeUndefined();     // floor is 3 below, maxDrop 1
        expect(caster.floorBelow(50, 6, 50, 20)).toBeUndefined();  // outside
        expect(caster.floorBelow(0, 6, 0, 20)).toBeCloseTo(3, 6);
    });
});
