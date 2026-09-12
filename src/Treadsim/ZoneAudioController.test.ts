import { describe, expect, it, vi } from "vitest";
import { AREA_POLL_MS, CROSSFADE_MS, isNightTime, ZoneAudioController, type AudioSink } from "./ZoneAudioController.js";
import { fakeTables } from "./ZoneAudioTables.fake.js";

class FakeSink implements AudioSink {
    calls: string[] = [];
    onMusicEnded: (() => void) | null = null;
    playMusic(f: number, v: number, fade: number) { this.calls.push(`music ${f} v${v.toFixed(2)} f${fade}`); }
    stopMusic(fade: number) { this.calls.push(`stopMusic f${fade}`); }
    playAmbience(f: number, v: number, fade: number) { this.calls.push(`amb ${f} v${v.toFixed(2)} f${fade}`); }
    stopAmbience(fade: number) { this.calls.push(`stopAmb f${fade}`); }
    setVolumes(m: number, a: number) { this.calls.push(`vol ${m.toFixed(2)} ${a.toFixed(2)}`); }
    take() { const c = this.calls; this.calls = []; return c; }
}
const on = { enabled: true, musicVolume: 0.5, ambienceVolume: 1 };
const NOON = 1440, MIDNIGHT = 0;

describe("isNightTime", () => {
    it("is night before 06:00 and from 21:00", () => {
        expect(isNightTime(0)).toBe(true); expect(isNightTime(719)).toBe(true);
        expect(isNightTime(720)).toBe(false); expect(isNightTime(1440)).toBe(false); expect(isNightTime(2519)).toBe(false);
        expect(isNightTime(2520)).toBe(true); expect(isNightTime(2879)).toBe(true);
    });
});

describe("ZoneAudioController", () => {
    it("entering Elwynn starts a track at once (no fade) and the day ambience loop; volumes multiply the kit volume", () => {
        const sink = new FakeSink();
        const c = new ZoneAudioController(fakeTables(), sink, on, () => 0); // random 0 → first file
        c.tick(0, 87, NOON);
        expect(sink.take()).toEqual([`amb 539131 v${(1 * 0.69).toFixed(2)} f2000`, `music 53492 v${(0.5 * 0.4).toFixed(2)} f0`]);
        expect(c.debug.areaName).toBe("Goldshire");
        expect(c.debug.musicId).toBe(1);
    });
    it("stays quiet between tracks for a random silence interval, then plays a different track", () => {
        const sink = new FakeSink();
        let r = 0;
        const c = new ZoneAudioController(fakeTables(), sink, on, () => r);
        c.tick(0, 12, NOON); sink.take();
        r = 0.5; sink.onMusicEnded!();                        // 180000 + 0.5 × 120000 = 240000
        expect(c.debug.nextTrackAtMs).toBe(240000);
        c.tick(239999, 12, NOON); expect(sink.take()).toEqual([]);
        r = 0;                                                // would pick file 0 again → must skip to the next
        c.tick(240000, 12, NOON);
        expect(sink.take()).toEqual([`music 53493 v${(0.5 * 0.4).toFixed(2)} f0`]);
        expect(c.debug.nextTrackAtMs).toBeNull();
    });
    it("a zone change crossfades music and ambience over two seconds and plays Stormwind's intro first", () => {
        const sink = new FakeSink();
        const c = new ZoneAudioController(fakeTables(), sink, on, () => 0);
        c.tick(0, 12, NOON); sink.take();
        c.tick(AREA_POLL_MS, 1519, NOON);
        // Stormwind's ambience kits (4176/4177) carry no explicit soundKitVolume in the fixture → default 1.
        expect(sink.take()).toEqual([`amb 539047 v${(1 * 1).toFixed(2)} f2000`, `stopMusic f${CROSSFADE_MS}`, `music 53211 v${(0.5 * 0.79).toFixed(2)} f${CROSSFADE_MS}`]);
        // back to Elwynn and into Stormwind again within the hour: no second intro
        c.tick(2 * AREA_POLL_MS, 12, NOON); sink.take();
        c.tick(3 * AREA_POLL_MS, 1519, NOON);
        expect(sink.take().filter((s) => s.startsWith("music"))).toEqual([`music 53202 v${(0.5 * 0.69).toFixed(2)} f${CROSSFADE_MS}`]);
        // an hour later the intro is allowed again
        c.tick(4 * AREA_POLL_MS, 12, NOON); sink.take();
        c.tick(60 * 60 * 1000 + 5 * AREA_POLL_MS, 1519, NOON);
        expect(sink.take().filter((s) => s.startsWith("music"))[0]).toMatch(/^music 53211 /);
    });
    it("switches the ambience loop at night without interrupting the track; sub-area changes within a zone change nothing", () => {
        const sink = new FakeSink();
        const c = new ZoneAudioController(fakeTables(), sink, on, () => 0);
        c.tick(0, 12, NOON); sink.take();
        c.tick(AREA_POLL_MS, 87, NOON);
        expect(sink.take()).toEqual([]);
        c.tick(2 * AREA_POLL_MS, 87, MIDNIGHT);
        expect(sink.take()).toEqual([`amb 539108 v${(1 * 0.69).toFixed(2)} f2000`]);
    });
    it("polls the area at most every AREA_POLL_MS and keeps the zone when no tile is under the runner", () => {
        const sink = new FakeSink();
        const c = new ZoneAudioController(fakeTables(), sink, on, () => 0);
        c.tick(0, 12, NOON); sink.take();
        c.tick(10, 1519, NOON); expect(sink.take()).toEqual([]);          // too soon
        c.tick(AREA_POLL_MS, undefined, NOON); expect(sink.take()).toEqual([]);
        expect(c.debug.musicId).toBe(1);
    });
    it("a zone without music stops the music; disabling stops both once and re-enabling starts over", () => {
        const sink = new FakeSink();
        const c = new ZoneAudioController(fakeTables(), sink, on, () => 0);
        c.tick(0, 12, NOON); sink.take();
        c.tick(AREA_POLL_MS, 1537, NOON);
        // Ironforge's ambience kits have no files → treated as "no ambience"; its zoneMusicId is 0 → music stops.
        expect(sink.take()).toEqual(["stopAmb f2000", "stopMusic f2000"]);
        c.setOptions({ ...on, enabled: false });
        c.tick(2 * AREA_POLL_MS, 1537, NOON);
        expect(sink.take()).toEqual([`stopMusic f${CROSSFADE_MS}`, `stopAmb f${CROSSFADE_MS}`]);
        c.tick(3 * AREA_POLL_MS, 12, NOON);
        expect(sink.take()).toEqual([]);
        c.setOptions(on);
        c.tick(4 * AREA_POLL_MS, 12, NOON);
        expect(sink.take()).toEqual([`amb 539131 v${(1 * 0.69).toFixed(2)} f2000`, `music 53492 v${(0.5 * 0.4).toFixed(2)} f0`]);
    });
    it("a music kit with no files stays silent (no throw, no music sink call) and warns once; a later zone still starts music", () => {
        const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
        const sink = new FakeSink();
        const c = new ZoneAudioController(fakeTables(), sink, on, () => 0);
        expect(() => c.tick(0, 1800, NOON)).not.toThrow(); // "Silent Hollow": zoneMusicId 99 → kits [9001, 9001], no files
        const calls = sink.take();
        expect(calls.some((s) => s.startsWith("music"))).toBe(false);
        expect(warn).toHaveBeenCalledTimes(1);
        expect(warn).toHaveBeenCalledWith("treadsim: sound kit has no files", 9001);
        c.tick(AREA_POLL_MS, 12, NOON); // Elwynn afterwards: music starts normally
        expect(sink.take()).toEqual([`amb 539131 v${(1 * 0.69).toFixed(2)} f2000`, `music 53492 v${(0.5 * 0.4).toFixed(2)} f0`]);
        warn.mockRestore();
    });
    it("volume changes reach the sink immediately, scaled by the current kits", () => {
        const sink = new FakeSink();
        const c = new ZoneAudioController(fakeTables(), sink, on, () => 0);
        c.tick(0, 12, NOON); sink.take();
        c.setOptions({ enabled: true, musicVolume: 1, ambienceVolume: 0.5 });
        expect(sink.take()).toEqual([`vol ${(1 * 0.4).toFixed(2)} ${(0.5 * 0.69).toFixed(2)}`]);
    });
});
