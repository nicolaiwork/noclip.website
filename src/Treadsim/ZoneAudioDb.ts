// ZoneAudioDb.ts — wasm-backed ZoneAudioTables. Not unit-tested (imports the wasm module).
import { rust } from "../rustlib.js";
import { DATA_SERVER } from "./ServerStatus.js";
import type { AreaAudioRow, ZoneAudioTables, ZoneIntroRow, ZoneMusicRow } from "./ZoneAudioTables.js";

/** Era 1.15.9 file data IDs (WoWDBDefs manifest; the Era root has no name hashes). */
export const ZONE_AUDIO_FILE_IDS = {
    areaTable: 1353545, zoneMusic: 1310254, soundAmbience: 1310628,
    soundKit: 1237434, soundKitEntry: 1237435, zoneIntroMusic: 1310251,
} as const;

async function fetchFromDataServer(fileId: number): Promise<Uint8Array> {
    const r = await fetch(`${DATA_SERVER}/file/${fileId}`);
    if (!r.ok) throw new Error(`GET /file/${fileId}: ${r.status}`);
    return new Uint8Array(await r.arrayBuffer());
}

function pair(v: Uint32Array | number[] | undefined): [number, number] | null {
    return v && v.length >= 2 ? [v[0], v[1]] : null;
}

export async function loadZoneAudioDb(fetchFile: (fileId: number) => Promise<Uint8Array> = fetchFromDataServer): Promise<ZoneAudioTables> {
    const f = ZONE_AUDIO_FILE_IDS;
    const [area, music, amb, kit, entry, intro] = await Promise.all([f.areaTable, f.zoneMusic, f.soundAmbience, f.soundKit, f.soundKitEntry, f.zoneIntroMusic].map(fetchFile));
    const db = rust.WowZoneAudioDb.new(area, music, amb, kit, entry, intro);
    return {
        area(id): AreaAudioRow | null {
            const r = db.area(id); if (!r) return null;
            const row = { name: r.name, parentAreaId: r.parent_area_id, ambienceId: r.ambience_id, zoneMusicId: r.zone_music_id, introSoundId: r.intro_sound_id };
            r.free(); return row;
        },
        zoneMusic(id): ZoneMusicRow | null {
            const r = db.zone_music(id); if (!r) return null;
            const min = pair(r.silence_min_ms), max = pair(r.silence_max_ms), kits = pair(r.sound_kits);
            r.free();
            return min && max && kits ? { silenceMinMs: min, silenceMaxMs: max, soundKits: kits } : null;
        },
        ambienceKits(id) { return pair(db.ambience_kits(id)); },
        soundKitFiles(kitId) { return Array.from(db.sound_kit_files(kitId)); },
        soundKitVolume(kitId) { return db.sound_kit_volume(kitId); },
        intro(id): ZoneIntroRow | null {
            const r = db.intro(id); if (!r) return null;
            const row = { soundKit: r.sound_kit, minDelayMinutes: r.min_delay_minutes }; r.free(); return row;
        },
    };
}
