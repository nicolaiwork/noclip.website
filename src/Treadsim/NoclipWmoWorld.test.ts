import { mat4, vec3 } from "gl-matrix";
import { describe, expect, it } from "vitest";
import { NoclipWmoWorld } from "./NoclipWmoWorld.js";
import { adtFromNoclip, noclipFromAdt } from "./coords.js";

// The same swap coords.ts does, as a matrix: noclip = (MAP - adtY, adtZ, MAP - adtX).
const MAP = 17066;
const noclipFromAdtMat = mat4.fromValues(0, 0, -1, 0, -1, 0, 0, 0, 0, 1, 0, 0, MAP, 0, MAP, 1);
const adtFromNoclipMat = mat4.invert(mat4.create(), noclipFromAdtMat);

describe("NoclipWmoWorld", () => {
    // A WMO whose model space is ADT space (identity model matrix).
    const def = {
        invModelMatrix: mat4.create(),
        worldAABB: { min: [-9200, 300, 80], max: [-9100, 400, 120] },
        wmo: { vertexBuffer: new Uint8Array(), indexBuffer: new Uint16Array(), groupDescriptors: [] },
    };
    const raw = { adts: [{ lodWmoDefs: () => [def] }], globalWmoDef: null };
    const world = new NoclipWmoWorld(raw, noclipFromAdtMat, adtFromNoclipMat);

    it("re-expresses the world box in noclip space", () => {
        const [d] = world.adts[0].lodWmoDefs();
        const a = noclipFromAdt([-9150, 350, 100]);
        for (let i = 0; i < 3; i++) {
            expect(a[i]).toBeGreaterThanOrEqual(d.worldAABB.min[i]);
            expect(a[i]).toBeLessThanOrEqual(d.worldAABB.max[i]);
        }
    });

    it("maps a noclip point into model space through invModelMatrix", () => {
        const [d] = world.adts[0].lodWmoDefs();
        const n = noclipFromAdt([-9150, 350, 100]);
        const out = vec3.transformMat4(vec3.create(), n as [number, number, number], d.invModelMatrix);
        const expected = adtFromNoclip(n);
        expect(out[0]).toBeCloseTo(expected[0], 3);
        expect(out[1]).toBeCloseTo(expected[1], 3);
        expect(out[2]).toBeCloseTo(expected[2], 3);
    });

    it("keeps the wmo identity so caches keyed on it still hit", () => {
        const [a] = world.adts[0].lodWmoDefs();
        const [b] = world.adts[0].lodWmoDefs();
        expect(a).toBe(b);
        expect(a.wmo).toBe(def.wmo);
    });
});
