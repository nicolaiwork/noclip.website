import { describe, expect, it } from "vitest";
import { adtFromNoclip, adtTileCoord, noclipFromAdt } from "./coords.js";

describe("coords", () => {
    it("converts the spike camera position to game coords near Stormwind's gate", () => {
        const [x, y, z] = adtFromNoclip([16751.93, 84.41, 26250.55]);
        expect(x).toBeCloseTo(-9184.55, 1);
        expect(y).toBeCloseTo(314.07, 1);
        expect(z).toBeCloseTo(84.41, 1);
    });
    it("round-trips", () => {
        const a: [number, number, number] = [-9184.55, 314.07, 84.41];
        const back = adtFromNoclip(noclipFromAdt(a));
        expect(back[0]).toBeCloseTo(a[0], 6);
        expect(back[1]).toBeCloseTo(a[1], 6);
        expect(back[2]).toBeCloseTo(a[2], 6);
    });
    it("maps the gate to tile [31, 49] in noclip's AdtCoord order", () => {
        expect(adtTileCoord(-9184.55, 314.07)).toEqual([31, 49]);
    });
});
