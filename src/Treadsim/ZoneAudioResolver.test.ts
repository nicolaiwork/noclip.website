import { describe, expect, it } from "vitest";
import { resolveZoneAudio } from "./ZoneAudioResolver.js";
import { fakeTables } from "./ZoneAudioTables.fake.js";

describe("resolveZoneAudio", () => {
    it("resolves a zone's music, ambience and intro", () => {
        const p = resolveZoneAudio(fakeTables(), 1519)!;
        expect(p.areaName).toBe("Stormwind City");
        expect(p.music).toEqual({ id: 13, kits: [2532, 2532], silenceMinMs: [180000, 180000], silenceMaxMs: [300000, 300000] });
        expect(p.ambience).toEqual({ id: 31, kits: [4176, 4177] });
        expect(p.intro).toEqual({ id: 61, kit: 2541, minDelayMinutes: 60 });
    });
    it("falls back to the parent for zero columns, so Goldshire sounds like Elwynn", () => {
        const p = resolveZoneAudio(fakeTables(), 87)!;
        expect(p.areaId).toBe(87);
        expect(p.areaName).toBe("Goldshire");
        expect(p.music?.id).toBe(1);
        expect(p.ambience).toEqual({ id: 35, kits: [4183, 4184] });
        expect(p.intro).toBeNull();
    });
    it("returns null music for a zone without any, null for an unknown area, and survives a parent cycle", () => {
        const t = fakeTables();
        expect(resolveZoneAudio(t, 1537)!.music).toBeNull();
        expect(resolveZoneAudio(t, 1537)!.ambience?.id).toBe(42);
        expect(resolveZoneAudio(t, 4242)).toBeNull();
        expect(resolveZoneAudio(t, 700)).toEqual({ areaId: 700, areaName: "Loop A", music: null, ambience: null, intro: null });
    });
    it("drops a music reference whose ZoneMusic row is missing", () => {
        const t = fakeTables();
        t.zoneMusic = () => null;
        expect(resolveZoneAudio(t, 12)!.music).toBeNull();
    });
});
