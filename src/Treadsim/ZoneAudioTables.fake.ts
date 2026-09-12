import type { AreaAudioRow, ZoneMusicRow, ZoneIntroRow, ZoneAudioTables } from "./ZoneAudioTables.js";

/** Test-only fixture shaped like Elwynn / Stormwind (values from spec §7). */
export function fakeTables(): ZoneAudioTables {
    const areas: Record<number, AreaAudioRow> = {
        12: { name: "Elwynn Forest", parentAreaId: 0, ambienceId: 35, zoneMusicId: 1, introSoundId: 0 },
        87: { name: "Goldshire", parentAreaId: 12, ambienceId: 0, zoneMusicId: 0, introSoundId: 0 },   // inherits
        1519: { name: "Stormwind City", parentAreaId: 0, ambienceId: 31, zoneMusicId: 13, introSoundId: 61 },
        1537: { name: "Ironforge", parentAreaId: 0, ambienceId: 42, zoneMusicId: 0, introSoundId: 0 },
        700: { name: "Loop A", parentAreaId: 701, ambienceId: 0, zoneMusicId: 0, introSoundId: 0 },
        701: { name: "Loop B", parentAreaId: 700, ambienceId: 0, zoneMusicId: 0, introSoundId: 0 },
        // Ironforge-like shape but via a *music* kit with no files (Ironforge's own zoneMusicId
        // is 0 — "no music" — which is a different code path from "a kit exists but is empty").
        1800: { name: "Silent Hollow", parentAreaId: 0, ambienceId: 0, zoneMusicId: 99, introSoundId: 0 },
    };
    const music: Record<number, ZoneMusicRow> = {
        1: { silenceMinMs: [180000, 180000], silenceMaxMs: [300000, 300000], soundKits: [2523, 2523] },
        13: { silenceMinMs: [180000, 180000], silenceMaxMs: [300000, 300000], soundKits: [2532, 2532] },
        99: { silenceMinMs: [180000, 180000], silenceMaxMs: [300000, 300000], soundKits: [9001, 9001] },
    };
    const amb: Record<number, [number, number]> = { 35: [4183, 4184], 31: [4176, 4177], 42: [4190, 4191] };
    const files: Record<number, number[]> = { 2523: [53492, 53493, 53494], 2532: [53202, 53203], 4183: [539131], 4184: [539108], 4176: [539047], 4177: [538994], 2541: [53211] };
    const vol: Record<number, number> = { 2523: 0.4, 2532: 0.69, 4183: 0.69, 4184: 0.69, 2541: 0.79 };
    return {
        area: (id) => areas[id] ?? null,
        zoneMusic: (id) => music[id] ?? null,
        ambienceKits: (id) => amb[id] ?? null,
        soundKitFiles: (k) => files[k] ?? [],
        soundKitVolume: (k) => vol[k] ?? 1,
        intro: (id) => id === 61 ? { soundKit: 2541, minDelayMinutes: 60 } : null,
    };
}
