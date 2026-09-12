import { FPSCameraController } from "../Camera.js";
import type { SceneGfx } from "../viewer.js";
import type { WdtScene } from "../WorldOfWarcraft/scenes.js";
import { ManualSpeedModel } from "./ManualSpeed.js";
import { TreadsimController } from "./TreadsimController.js";
import { TreadsimCameraController } from "./TreadsimCameraController.js";
import { LookOffset } from "./LookOffset.js";
import { Hud, bindKeys } from "./Hud.js";
import { RoutePicker } from "./RoutePicker.js";
import { isServerUp } from "./ServerStatus.js";
import { loadSettings, saveSettings } from "./Settings.js";
import { AreaSampler } from "./AreaSampler.js";
import { loadZoneAudioDb } from "./ZoneAudioDb.js";
import { ZoneAudioController } from "./ZoneAudioController.js";
import { HtmlAudioSink } from "./HtmlAudioSink.js";
import { adtFromNoclip } from "./coords.js";
import { RoutePath } from "./RoutePath.js";
import { RouteFollower } from "./RouteFollower.js";
import { preloadTiles } from "./RoutePreloader.js";
import { GroundSampler } from "./GroundSampler.js";
import { TerrainSampler } from "./TerrainSampler.js";
import { WmoFloorCaster } from "./WmoFloorCaster.js";
import { RouteEditor } from "./RouteEditor.js";
import { loadCatalog, saveRoute } from "./RouteCatalog.js";

let current: { controller: TreadsimController; hud: Hud; picker: RoutePicker; editor: RouteEditor; scene: WdtScene; unbind: () => void; raf: number; cancelKickStreaming: () => void; audioSink: HtmlAudioSink } | null = null;

/** Called by noclip's WoW scene loader once a continent scene exists. */
export function installTreadsim(scene: WdtScene): TreadsimController {
    if (current) {
        cancelAnimationFrame(current.raf);
        current.cancelKickStreaming();
        current.unbind();
        current.hud.destroy();
        current.picker.destroy();
        current.editor.destroy();
        current.scene.onDebugDraw = null;
        current.controller.destroy();
        current.audioSink.destroy();
    }
    const model = new ManualSpeedModel();
    const controller = new TreadsimController(model);
    const viewer = (window as any).main.viewer;
    const cam = viewer.camera;
    controller.attachCamera(cam);
    const world = scene.world as any; // WorldData | LazyWorldData: both have adts; globalWmoDef exists on LazyWorldData
    controller.groundSampler = new GroundSampler(new TerrainSampler(world), new WmoFloorCaster(world));
    void model.start();

    const settings = loadSettings(localStorage);
    controller.worldScale = settings.worldScale;

    // Zone music and ambience (spec §7). Tables load in the background; until they arrive `audio`
    // is null and the run is silent. Sound is off by default; the picker and `M` toggle it.
    const areas = new AreaSampler(world);
    const audioSink = new HtmlAudioSink();
    let audio: ZoneAudioController | null = null;
    const soundOptions = (s: typeof settings) => ({ enabled: s.sound, musicVolume: s.musicVolume, ambienceVolume: s.ambienceVolume });
    let currentSettings = settings;
    loadZoneAudioDb().then((tables) => {
        audio = new ZoneAudioController(tables, audioSink, soundOptions(currentSettings));
        (window as any).treadsim.audio = audio;
    }).catch((e) => console.warn("treadsim: zone audio unavailable —", e));
    const applySound = (s: typeof settings) => { currentSettings = s; audio?.setOptions(soundOptions(s)); };
    const toggleSound = () => {
        const s = { ...currentSettings, sound: !currentSettings.sound };
        saveSettings(localStorage, s); applySound(s); picker.setSound(s.sound);
        hud.showToast(s.sound ? "Sound on" : "Sound off", 1500);
    };
    // Escape and the HUD's Routes button behave identically: pause, then show the picker.
    // wasRunning records whether the run should resume when the picker is dismissed
    // without picking a new route (Resume / Escape toggle); a successful Start always
    // leaves the new route paused, so it clears wasRunning.
    let wasRunning = false;
    const openPicker = () => {
        wasRunning = model.running;
        if (model.running) model.toggleRunning();
        picker.show({ canResume: true }); // a run exists to go back to
    };
    const resumePicker = () => {
        picker.hide();
        if (wasRunning) model.toggleRunning();
    };
    const hud = new Hud(model, controller, { onRoutes: openPicker });

    const look = new LookOffset();
    const cameraController = new TreadsimCameraController(controller, new FPSCameraController(), look);
    // main.ts installs this after createScene resolves (viewer.setCameraController) — no noclip edit needed.
    (scene as SceneGfx).createCameraController = () => cameraController;

    // treadsim: "Daylight" freezes the clock at noon while the editor is open, restoring whatever
    // freeze state (on/off + time) preceded it on close.
    let savedFreeze: [boolean, number] | null = null;

    // treadsim: after a teleport (flyTo/lookDown/openRoute), force a fresh streaming pass around the
    // camera. updateCurrentAdt only starts a pass when WdtScene.currentAdtCoords (public) differs
    // from the camera's current ADT, and LazyWorldData.onEnterAdt returns [] while a pass is already in
    // flight — so a far teleport during an in-flight load would otherwise leave the destination area
    // empty. Resetting currentAdtCoords to an impossible tile once the current pass finishes makes the
    // next frame see a "new" tile and kick off loading around the camera. Poll for "not loading" rather
    // than kicking immediately, and guard with kickStreamingPending so only one kick is ever pending;
    // cancelKickStreaming (called from installTreadsim's teardown) clears any pending poll so a stale
    // timer cannot write currentAdtCoords on a scene that has been replaced.
    let kickStreamingPending = false;
    let kickTimer: ReturnType<typeof setTimeout> | null = null;
    const kickStreaming = (): void => {
        if (kickStreamingPending) return;
        kickStreamingPending = true;
        let tries = 0;
        const poll = () => {
            kickTimer = null;
            if (!world.loading || tries >= 120) {
                kickStreamingPending = false;
                scene.currentAdtCoords = [-1, -1];
                return;
            }
            tries++;
            kickTimer = setTimeout(poll, 500);
        };
        poll();
    };
    const cancelKickStreaming = (): void => {
        if (kickTimer !== null) clearTimeout(kickTimer);
        kickTimer = null;
        kickStreamingPending = false;
    };

    // Editor mode (spec §6): fly freely, drop waypoints, save into routes/. Nothing runs meanwhile.
    const editor = new RouteEditor({
        camera: cam,
        heightAt: (x, y) => controller.groundSampler!.height(x, y, undefined, controller.eyeHeight),
        adtCount: () => world.adts.length,
        clipFromWorld: () => cam.clipFromWorldMatrix,
        toplevel: viewer.inputManager.toplevel,
        loadCatalog: () => loadCatalog(),
        saveRoute: (route) => saveRoute(route),
        preload: async (route, progress) => {
            const path = new RoutePath(route.waypoints, route.stops);
            await preloadTiles(path.tileCoords(), world, scene, progress);
        },
        onExit: () => closeEditor(),
        setHideDoodads: (v) => { scene.hideDoodads = v; },
        setDaylight: (v) => {
            const mv = scene.mainView;
            if (v) { savedFreeze = [mv.freezeTime, mv.frozenTime]; mv.freezeTime = true; mv.frozenTime = 1440; }
            else if (savedFreeze) { [mv.freezeTime, mv.frozenTime] = savedFreeze; savedFreeze = null; }
        },
        afterTeleport: () => kickStreaming(),
    });
    const openEditor = () => {
        if (model.running) model.toggleRunning();
        wasRunning = false;
        controller.setRoute(null);
        picker.hide();
        hud.setVisible(false);
        cameraController.flyMode = true;
        editor.open();
    };
    const closeEditor = () => {
        editor.close();
        cameraController.flyMode = false;
        hud.setVisible(true);
        picker.show({ canResume: false });
    };
    scene.onDebugDraw = (dd) => { if (editor.active) editor.drawPreview(dd); };

    const picker = new RoutePicker({
        settings,
        serverUp: isServerUp,
        onResume: resumePicker,
        onEdit: () => openEditor(),
        onSoundChange: (s) => applySound(s),
        onStart: async ({ route, settings }) => {
            wasRunning = false; // the new route always starts paused
            look.reset();
            controller.worldScale = settings.worldScale;
            applySound(settings);
            if (model.running) model.toggleRunning();
            if (!route) { controller.setRoute(null); return; }
            const path = new RoutePath(route.waypoints, route.stops);
            await preloadTiles(path.tileCoords(), world, scene, (d, t) => picker.setProgress(d, t));
            // warm the ground stack along the path (builds Task 2b's WMO grids before the run, not
            // mid-run); carry the eye height forward like the follower does so WMO floors above the
            // terrain (e.g. the gate bridge) get their own grids built, not just terrain-level ones.
            let z: number | undefined = undefined;
            for (let s = 0; s <= path.lengthTotal; s += 25) {
                const [x, y] = path.positionAt(s);
                const g = controller.groundSampler!.height(x, y, z, controller.eyeHeight);
                if (g !== undefined) z = g + controller.eyeHeight;
            }
            controller.groundSampler!.reset();
            const follower = new RouteFollower(path, { loop: settings.loop }, {
                // The last stop's arrival and "finished" fire together; finished's own
                // toast covers the last stop, so skip arrived's to avoid a double toast.
                arrived: (stop, index) => { if (index !== path.stops.length - 1) hud.showToast(stop.name); },
                finished: () => hud.showToast(`Finished — ${path.stops[path.stops.length - 1].name}`),
            });
            controller.setRoute(follower);
        },
    });
    const unbind = bindKeys(model, {
        onEscape: () => {
            if (editor.active) closeEditor();
            else if (picker.visible) { if (picker.canResume) resumePicker(); }
            else openPicker();
        },
        isBlocked: () => picker.visible || editor.active,
        onToggleSound: toggleSound,
    });
    picker.show();

    const loop = () => {
        current!.raf = requestAnimationFrame(loop);
        hud.render();
        editor.tick();
        if (audio) {
            const m = cam.worldMatrix;
            const [ax, ay] = adtFromNoclip([m[12], m[13], m[14]]);
            const now = performance.now();
            audio.tick(now, areas.areaAt(ax, ay), scene.mainView.time);
            audioSink.tick(now);
        }
    };
    current = { controller, hud, picker, editor, scene, unbind, raf: requestAnimationFrame(loop), cancelKickStreaming, audioSink };
    (window as any).treadsim = {
        controller, model, scene, ground: controller.groundSampler, cameraController, picker, editor,
        teleport: (x: number, y: number) => controller.teleportTo(x, y),
        areas, audio,
    };
    return controller;
}
