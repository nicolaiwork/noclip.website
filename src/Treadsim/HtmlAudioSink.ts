import { DATA_SERVER } from "./ServerStatus.js";
import type { AudioSink } from "./ZoneAudioController.js";

/** One <audio> with a linear volume ramp; `target` 0 with `stopAtZero` releases the element. */
class Voice {
    public el: HTMLAudioElement;
    private from = 0; private to = 0; private t0 = 0; private t1 = 0;
    public stopAtZero = false;
    constructor(url: string, loop: boolean, onEnded: (() => void) | null) {
        this.el = new Audio(url); this.el.loop = loop; this.el.preload = "auto"; this.el.volume = 0;
        if (onEnded) this.el.onended = onEnded;
    }
    fade(to: number, ms: number, now: number) { this.from = this.el.volume; this.to = to; this.t0 = now; this.t1 = now + Math.max(1, ms); }
    /** returns false when finished fading out and released */
    tick(now: number): boolean {
        const k = Math.min(1, (now - this.t0) / (this.t1 - this.t0));
        this.el.volume = Math.max(0, Math.min(1, this.from + (this.to - this.from) * k));
        if (k >= 1 && this.stopAtZero && this.to === 0) { this.el.pause(); this.el.src = ""; return false; }
        return true;
    }
}

class Channel {
    public current: Voice | null = null;
    private fading: Voice[] = [];
    public gain = 1;
    private static warned = false;
    constructor(private loop: boolean, private onEnded: (() => void) | null) {}
    play(url: string, volume: number, fadeMs: number, now: number) {
        this.stop(fadeMs, now);
        const v = new Voice(url, this.loop, this.loop ? null : () => { if (this.current === v) { this.current = null; this.onEnded?.(); } });
        this.gain = volume; v.fade(volume, fadeMs, now);
        v.el.play().catch((e) => { if (!Channel.warned) { Channel.warned = true; console.warn("treadsim: audio play() rejected (autoplay policy?)", e); } });
        this.current = v;
    }
    stop(fadeMs: number, now: number) {
        if (!this.current) return;
        const v = this.current; this.current = null;
        v.el.onended = null; v.stopAtZero = true; v.fade(0, fadeMs, now); this.fading.push(v);
    }
    setVolume(volume: number, now: number) { this.gain = volume; this.current?.fade(volume, 150, now); }
    tick(now: number) { this.current?.tick(now); this.fading = this.fading.filter((v) => v.tick(now)); }
    destroy(now: number) { this.stop(0, now); for (const v of this.fading) { v.el.pause(); v.el.src = ""; } this.fading = []; }
}

/** <audio>-backed sink: a one-shot music channel and a looping ambience channel, crossfaded by `tick`. */
export class HtmlAudioSink implements AudioSink {
    public onMusicEnded: (() => void) | null = null;
    private music = new Channel(false, () => this.onMusicEnded?.());
    private ambience = new Channel(true, null);
    constructor(private baseUrl = `${DATA_SERVER}/file/`) {}
    private url(fileId: number) { return `${this.baseUrl}${fileId}`; }
    playMusic(fileId: number, volume: number, fadeMs: number) { this.music.play(this.url(fileId), volume, fadeMs, performance.now()); }
    stopMusic(fadeMs: number) { this.music.stop(fadeMs, performance.now()); }
    playAmbience(fileId: number, volume: number, fadeMs: number) { this.ambience.play(this.url(fileId), volume, fadeMs, performance.now()); }
    stopAmbience(fadeMs: number) { this.ambience.stop(fadeMs, performance.now()); }
    setVolumes(music: number, ambience: number) { const now = performance.now(); this.music.setVolume(music, now); this.ambience.setVolume(ambience, now); }
    /** Once per frame from the install loop. */
    tick(nowMs: number) { this.music.tick(nowMs); this.ambience.tick(nowMs); }
    destroy() { const now = performance.now(); this.music.destroy(now); this.ambience.destroy(now); }
}
