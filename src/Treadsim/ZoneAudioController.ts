import type { ZoneAudioTables } from "./ZoneAudioTables.js";
import { resolveZoneAudio, type ZoneAudioPlan } from "./ZoneAudioResolver.js";

export interface AudioSink {
    /** One-shot track; the sink calls `onMusicEnded` when it finishes. fadeMs 0 = start at volume. */
    playMusic(fileId: number, volume: number, fadeMs: number): void;
    stopMusic(fadeMs: number): void;
    /** Looping; replaces (crossfades from) the current ambience. */
    playAmbience(fileId: number, volume: number, fadeMs: number): void;
    stopAmbience(fadeMs: number): void;
    /** Live volume change of whatever is playing (user sliders). */
    setVolumes(music: number, ambience: number): void;
    onMusicEnded: (() => void) | null;
}
export interface ZoneAudioOptions { enabled: boolean; musicVolume: number; ambienceVolume: number }

export const CROSSFADE_MS = 2000;
export const AREA_POLL_MS = 250;
const GAME_DAY = 2880, DAWN = 6 * 120, DUSK = 21 * 120;

/** Night before 06:00 and from 21:00 game time (`mainView.time`, half-minutes of a 2880-unit day). */
export function isNightTime(gameTime: number): boolean {
    const t = ((gameTime % GAME_DAY) + GAME_DAY) % GAME_DAY;
    return t < DAWN || t >= DUSK;
}

/**
 * Zone music and ambience scheduler (spec §7). Pure: reads tables, drives an AudioSink, is ticked
 * from the render loop with the area under the runner and the scene's game time.
 */
export class ZoneAudioController {
    private plan: ZoneAudioPlan | null = null;
    private lastAreaId: number | undefined;
    private lastPollMs = -Infinity;
    /** True once a tick has actually run with sound enabled; drives the disable/re-enable edge and gates setOptions' immediate volume push. */
    private active = false;
    private ambienceFile: number | null = null;
    private ambienceKitVolume = 1;
    private musicId = 0;
    /** Currently playing file, or null while silent (stopped, crossfading out, or between tracks). */
    private track: number | null = null;
    /** Last file actually started, kept across `onMusicEnded` (which nulls `track`) so the next pick can avoid repeating it. */
    private lastFile: number | null = null;
    private trackKitVolume = 1;
    private nextTrackAtMs: number | null = null;
    private introStartedAt = new Map<number, number>();
    private lastNight: 0 | 1 = 0;
    private lastNowMs = 0;
    /** Kit ids already warned about (Ironforge-shaped: a music kit with no files) — once per kit, not once per tick. */
    private warnedEmptyKits = new Set<number>();

    constructor(private tables: ZoneAudioTables, private sink: AudioSink, private opts: ZoneAudioOptions, private random: () => number = Math.random) {
        sink.onMusicEnded = () => this.onMusicEnded();
    }

    public get debug() {
        return { areaName: this.plan?.areaName ?? "", musicId: this.musicId, ambienceId: this.plan?.ambience?.id ?? 0, track: this.track, nextTrackAtMs: this.nextTrackAtMs };
    }

    public setOptions(opts: ZoneAudioOptions): void {
        this.opts = opts;
        // Only push an immediate volume nudge while already active; enabling from cold re-resolves
        // fresh on the next tick instead (rule 7), so no stray `setVolumes` call fires in between.
        if (opts.enabled && this.active) this.sink.setVolumes(opts.musicVolume * this.trackKitVolume, opts.ambienceVolume * this.ambienceKitVolume);
    }

    public tick(nowMs: number, areaId: number | undefined, gameTime: number): void {
        if (!this.opts.enabled) {
            if (this.active) { this.sink.stopMusic(CROSSFADE_MS); this.sink.stopAmbience(CROSSFADE_MS); this.reset(); }
            return;
        }
        this.active = true;
        const night: 0 | 1 = isNightTime(gameTime) ? 1 : 0;
        this.lastNight = night;
        this.lastNowMs = nowMs;
        if (areaId !== undefined && areaId !== this.lastAreaId && nowMs - this.lastPollMs >= AREA_POLL_MS) {
            this.lastPollMs = nowMs; this.lastAreaId = areaId;
            this.plan = resolveZoneAudio(this.tables, areaId) ?? this.plan;
        }
        const plan = this.plan;
        if (!plan) return;
        this.updateAmbience(plan, night);
        this.updateMusic(plan, night, nowMs);
    }

    private reset(): void {
        this.plan = null; this.lastAreaId = undefined; this.lastPollMs = -Infinity; this.active = false;
        this.ambienceFile = null; this.musicId = 0; this.track = null; this.lastFile = null; this.nextTrackAtMs = null;
    }

    private updateAmbience(plan: ZoneAudioPlan, night: 0 | 1): void {
        const kit = plan.ambience?.kits[night] ?? 0;
        const file = kit ? this.tables.soundKitFiles(kit)[0] : undefined;
        if (file === undefined) {
            if (this.ambienceFile !== null) { this.sink.stopAmbience(CROSSFADE_MS); this.ambienceFile = null; }
            return;
        }
        if (file === this.ambienceFile) return;
        this.ambienceFile = file; this.ambienceKitVolume = this.tables.soundKitVolume(kit);
        this.sink.playAmbience(file, this.opts.ambienceVolume * this.ambienceKitVolume, CROSSFADE_MS);
    }

    private updateMusic(plan: ZoneAudioPlan, night: 0 | 1, nowMs: number): void {
        const id = plan.music?.id ?? 0;
        if (id !== this.musicId) {
            const wasPlaying = this.track !== null;
            if (wasPlaying) { this.sink.stopMusic(CROSSFADE_MS); this.track = null; }
            this.musicId = id; this.nextTrackAtMs = null;
            if (id) this.startTrack(plan, night, nowMs, wasPlaying ? CROSSFADE_MS : 0);
            return;
        }
        if (id && this.track === null && this.nextTrackAtMs !== null && nowMs >= this.nextTrackAtMs) {
            this.nextTrackAtMs = null;
            this.startTrack(plan, night, nowMs, 0);
        }
    }

    private startTrack(plan: ZoneAudioPlan, night: 0 | 1, nowMs: number, fadeMs: number): void {
        let kit = 0, file: number | undefined;
        const intro = plan.intro;
        if (intro) {
            const last = this.introStartedAt.get(intro.id);
            if (last === undefined || nowMs - last >= intro.minDelayMinutes * 60_000) {
                const files = this.tables.soundKitFiles(intro.kit);
                if (files.length) { kit = intro.kit; file = files[0]; this.introStartedAt.set(intro.id, nowMs); }
            }
        }
        if (file === undefined) {
            kit = plan.music!.kits[night];
            const files = this.tables.soundKitFiles(kit);
            if (!files.length) {
                // Silent for this zone (Ironforge-shaped: a music kit with no files) — no
                // nextTrackAtMs is set, so nothing retries, but a later zone change still calls
                // startTrack fresh (updateMusic dispatches on `id !== this.musicId`), so music
                // resumes normally once the runner leaves. Logged once per kit, not thrown.
                if (!this.warnedEmptyKits.has(kit)) { this.warnedEmptyKits.add(kit); console.warn("treadsim: sound kit has no files", kit); }
                return;
            }
            let i = Math.min(files.length - 1, Math.floor(this.random() * files.length));
            if (files.length > 1 && files[i] === this.lastFile) i = (i + 1) % files.length;
            file = files[i];
        }
        this.track = file; this.lastFile = file; this.trackKitVolume = this.tables.soundKitVolume(kit);
        this.sink.playMusic(file, this.opts.musicVolume * this.trackKitVolume, fadeMs);
    }

    private onMusicEnded(): void {
        this.track = null;
        const plan = this.plan;
        if (!plan?.music || !this.opts.enabled) return;
        const night = this.lastNight;
        const min = plan.music.silenceMinMs[night], max = plan.music.silenceMaxMs[night];
        this.nextTrackAtMs = this.lastNowMs + min + this.random() * Math.max(0, max - min);
    }
}
