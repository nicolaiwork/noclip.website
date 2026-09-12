/** Plain-data view of the Era audio tables (spec §7). Implemented by ZoneAudioDb (wasm) and by test fakes. */
export interface AreaAudioRow { name: string; parentAreaId: number; ambienceId: number; zoneMusicId: number; introSoundId: number }
/** Two-element arrays are [day, night]. Intervals in milliseconds. */
export interface ZoneMusicRow { silenceMinMs: [number, number]; silenceMaxMs: [number, number]; soundKits: [number, number] }
export interface ZoneIntroRow { soundKit: number; minDelayMinutes: number }
export interface ZoneAudioTables {
    area(id: number): AreaAudioRow | null;
    zoneMusic(id: number): ZoneMusicRow | null;
    ambienceKits(id: number): [number, number] | null;
    soundKitFiles(kitId: number): number[];
    soundKitVolume(kitId: number): number;
    intro(id: number): ZoneIntroRow | null;
}
