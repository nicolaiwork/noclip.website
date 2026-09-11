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

/** A 12x12 bumpy sheet (242 triangles) spanning [-30,30]^2 in model x/y, plus a wall. */
function bumpyWmo() {
    const N = 12, pos: number[] = [], idx: number[] = [];
    for (let i = 0; i <= N; i++) for (let j = 0; j <= N; j++) {
        const x = -30 + 60 * i / N, y = -30 + 60 * j / N;
        pos.push(x, y, 2 * Math.sin(x / 3) + Math.cos(y / 2));
    }
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
        const a = i * (N + 1) + j, b = a + 1, c = a + N + 1, d = c + 1;
        idx.push(a, b, c, b, d, c);
    }
    const wallBase = pos.length / 3;
    pos.push(-30, -30, 0, -30, -30, 12, -30, 30, 12);
    idx.push(wallBase, wallBase + 1, wallBase + 2);
    return {
        vertexBuffer: new Uint8Array(new Float32Array(pos).buffer),
        indexBuffer: new Uint16Array(idx),
        groupDescriptors: [{ group_id: 7, antiportal: false, vertex_buffer_offset: 0, index_buffer_offset: 0, num_vertices: pos.length / 3, num_indices: idx.length }],
    };
}

describe("WmoFloorCaster grid", () => {
    // yawed, tilted, scaled placement so the model-space ray is not axis aligned
    const m = mat4.create();
    mat4.translate(m, m, [500, -200, 40]);
    mat4.rotateZ(m, m, 37 * Math.PI / 180);
    mat4.rotateX(m, m, 8 * Math.PI / 180);
    mat4.scale(m, m, [1.3, 1.3, 1.3]);
    const def = { invModelMatrix: mat4.invert(mat4.create(), m)!, worldAABB: { min: [440, -260, 20], max: [560, -140, 70] }, wmo: bumpyWmo() };
    const world = { adts: [], globalWmoDef: def };

    it("returns exactly the brute-force result for many query points", () => {
        const grid = new WmoFloorCaster(world, { useGrid: true, gridCells: 16 });
        const brute = new WmoFloorCaster(world, { useGrid: false });
        let seed = 12345, hits = 0;
        const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
        for (let i = 0; i < 300; i++) {
            const x = 440 + 120 * rnd(), y = -260 + 120 * rnd();
            const a = grid.floorBelow(x, y, 60, 40), b = brute.floorBelow(x, y, 60, 40);
            if (b !== undefined) hits++;
            if (b === undefined) expect(a).toBeUndefined(); else expect(a).toBeCloseTo(b, 9);
        }
        // Rotated 78x78 footprint inscribed in the 120x120 query box covers ~42% of it (fixed by the
        // geometry, independent of rotation), so with this seed the brute-force reference hits ~118/300;
        // verified independently outside this class. 100 keeps this a meaningful sanity floor.
        expect(hits).toBeGreaterThan(100);
    });

    it("builds the grid once per definition and group", () => {
        const caster = new WmoFloorCaster(world, { useGrid: true });
        caster.floorBelow(500, -200, 60, 40);
        const grids = (caster as any).grids.get(def) as Map<number, unknown>;
        expect(grids.size).toBe(1);
        const first = grids.get(7);
        caster.floorBelow(505, -195, 60, 40);
        expect(grids.get(7)).toBe(first);
    });
});
