import { describe, expect, it } from "vitest";
import { ManualSpeedModel, MAX_MANUAL_KMH } from "./ManualSpeed.js";

describe("ManualSpeedModel", () => {
    it("clamps speed to [0, MAX]", () => {
        const m = new ManualSpeedModel();
        m.setSpeedKmh(-3);
        expect(m.speedKmh).toBe(0);
        m.setSpeedKmh(99);
        expect(m.speedKmh).toBe(MAX_MANUAL_KMH);
    });

    it("steps in half km/h and reports m/s", () => {
        const m = new ManualSpeedModel();
        m.step(0.5); m.step(0.5);
        expect(m.speedKmh).toBe(1);
        expect(m.speedMps).toBeCloseTo(1000 / 3600, 9);
    });

    it("emits speed 0 while paused and the set speed while running", async () => {
        const m = new ManualSpeedModel();
        const seen: number[] = [];
        m.onSpeed((v) => seen.push(v));
        await m.start();
        m.setSpeedKmh(3.6);
        expect(seen.at(-1)).toBe(0);            // paused
        m.toggleRunning();
        expect(seen.at(-1)).toBeCloseTo(1, 9); // 3.6 km/h = 1 m/s
        m.toggleRunning();
        expect(seen.at(-1)).toBe(0);
    });
});
