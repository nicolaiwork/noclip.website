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
import { loadSettings } from "./Settings.js";
import { RoutePath } from "./RoutePath.js";
import { RouteFollower } from "./RouteFollower.js";
import { preloadTiles } from "./RoutePreloader.js";
import { GroundSampler } from "./GroundSampler.js";
import { TerrainSampler } from "./TerrainSampler.js";
import { WmoFloorCaster } from "./WmoFloorCaster.js";
import { RouteEditor } from "./RouteEditor.js";
import { loadCatalog, saveRoute } from "./RouteCatalog.js";

let current: { controller: TreadsimController; hud: Hud; picker: RoutePicker; editor: RouteEditor; scene: WdtScene; unbind: () => void; raf: number } | null = null;

/** Called by noclip's WoW scene loader once a continent scene exists. */
export function installTreadsim(scene: WdtScene): TreadsimController {
    if (current) {
        cancelAnimationFrame(current.raf);
        current.unbind();
        current.hud.destroy();
        current.picker.destroy();
        current.editor.destroy();
        current.scene.onDebugDraw = null;
        current.controller.destroy();
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
        onStart: async ({ route, settings }) => {
            wasRunning = false; // the new route always starts paused
            controller.worldScale = settings.worldScale;
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
    });
    picker.show();

    const loop = () => {
        current!.raf = requestAnimationFrame(loop);
        hud.render();
        editor.tick();
    };
    current = { controller, hud, picker, editor, scene, unbind, raf: requestAnimationFrame(loop) };
    (window as any).treadsim = {
        controller, model, scene, ground: controller.groundSampler, cameraController, picker, editor,
        teleport: (x: number, y: number) => controller.teleportTo(x, y),
    };
    return controller;
}
