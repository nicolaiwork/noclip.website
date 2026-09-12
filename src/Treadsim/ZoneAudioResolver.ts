import type { ZoneAudioTables } from "./ZoneAudioTables.js";

export interface ZoneMusicPlan { id: number; kits: [number, number]; silenceMinMs: [number, number]; silenceMaxMs: [number, number] }
export interface ZoneAudioPlan {
    areaId: number; areaName: string;
    music: ZoneMusicPlan | null;
    ambience: { id: number; kits: [number, number] } | null;
    intro: { id: number; kit: number; minDelayMinutes: number } | null;
}
export const MAX_PARENT_HOPS = 8;

/**
 * AreaTable → ZoneMusic / SoundAmbience / ZoneIntroMusicTable (spec §7). A sub-area with a zero
 * column uses its parent's value (Elwynn's sub-areas all carry their own in Era, but the rule is
 * WoW's and costs nothing). Unknown area → null.
 */
export function resolveZoneAudio(tables: ZoneAudioTables, areaId: number): ZoneAudioPlan | null {
    const first = tables.area(areaId);
    if (!first) return null;
    let musicId = 0, ambienceId = 0, introId = 0;
    let row: typeof first | null = first;
    for (let hops = 0; row && hops <= MAX_PARENT_HOPS; hops++) {
        if (!musicId) musicId = row.zoneMusicId;
        if (!ambienceId) ambienceId = row.ambienceId;
        if (!introId) introId = row.introSoundId;
        if (musicId && ambienceId && introId) break;
        row = row.parentAreaId ? tables.area(row.parentAreaId) : null;
    }
    const zm = musicId ? tables.zoneMusic(musicId) : null;
    const kits = ambienceId ? tables.ambienceKits(ambienceId) : null;
    const intro = introId ? tables.intro(introId) : null;
    return {
        areaId, areaName: first.name,
        music: zm ? { id: musicId, kits: zm.soundKits, silenceMinMs: zm.silenceMinMs, silenceMaxMs: zm.silenceMaxMs } : null,
        ambience: kits ? { id: ambienceId, kits } : null,
        intro: intro ? { id: introId, kit: intro.soundKit, minDelayMinutes: intro.minDelayMinutes } : null,
    };
}
