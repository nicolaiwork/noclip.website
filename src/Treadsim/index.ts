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
import { WaypointRecorder } from "./WaypointRecorder.js";
import { adtFromNoclip } from "./coords.js";

let current: { controller: TreadsimController; hud: Hud; picker: RoutePicker; unbind: () => void; raf: number } | null = null;

/** Called by noclip's WoW scene loader once a continent scene exists. */
export function installTreadsim(scene: WdtScene): TreadsimController {
    if (current) {
        cancelAnimationFrame(current.raf);
        current.unbind();
        current.hud.destroy();
        current.picker.destroy();
        current.controller.destroy();
    }
    const model = new ManualSpeedModel();
    const controller = new TreadsimController(model);
    const cam = (window as any).main.viewer.camera;
    controller.attachCamera(cam);
    const world = scene.world as any; // WorldData | LazyWorldData: both have adts; globalWmoDef exists on LazyWorldData
    controller.groundSampler = new GroundSampler(new TerrainSampler(world), new WmoFloorCaster(world));
    void model.start();

    const settings = loadSettings(localStorage);
    controller.worldScale = settings.worldScale;
    const hud = new Hud(model, controller, { onRoutes: () => { if (model.running) model.toggleRunning(); picker.show(); } });
    const picker = new RoutePicker({
        serverUp: isServerUp,
        onStart: async ({ route, settings }) => {
            controller.worldScale = settings.worldScale;
            if (model.running) model.toggleRunning();
            if (!route) { controller.setRoute(null); return; }
            const path = new RoutePath(route.waypoints, route.stops);
            await preloadTiles(path.tileCoords(), world, scene, (d, t) => picker.setProgress(d, t));
            // warm the ground stack along the path (builds Task 2b's WMO grids before the run, not mid-run)
            for (let s = 0; s <= path.lengthTotal; s += 25) { const [x, y] = path.positionAt(s); const t = controller.groundSampler!.height(x, y, undefined, controller.eyeHeight); if (t !== undefined) controller.groundSampler!.height(x, y, t + controller.eyeHeight, controller.eyeHeight); }
            controller.groundSampler!.reset();
            const follower = new RouteFollower(path, { loop: settings.loop }, {
                arrived: (stop) => hud.showToast(stop.name),
                finished: () => hud.showToast("Route finished"),
            });
            controller.setRoute(follower);
        },
    });
    const unbind = bindKeys(model, { onEscape: () => picker.show() });
    picker.show();

    const cameraController = new TreadsimCameraController(controller, new FPSCameraController(), new LookOffset());
    // main.ts installs this after createScene resolves (viewer.setCameraController) — no noclip edit needed.
    (scene as SceneGfx).createCameraController = () => cameraController;

    // Console helper for authoring routes; see Task 8.
    const recorder = new WaypointRecorder(() => {
        const m = cam.worldMatrix;
        const [x, y] = adtFromNoclip([m[12], m[13], m[14]]);
        return [x, y];
    });

    const loop = () => {
        current!.raf = requestAnimationFrame(loop);
        hud.render();
        recorder.tick();
    };
    current = { controller, hud, picker, unbind, raf: requestAnimationFrame(loop) };
    (window as any).treadsim = {
        controller, model, scene, ground: controller.groundSampler, cameraController, picker, recorder,
        teleport: (x: number, y: number) => controller.teleportTo(x, y),
    };
    return controller;
}
