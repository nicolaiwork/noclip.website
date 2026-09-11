import { FPSCameraController } from "../Camera.js";
import type { SceneGfx } from "../viewer.js";
import type { WdtScene } from "../WorldOfWarcraft/scenes.js";
import { ManualSpeedModel } from "./ManualSpeed.js";
import { TreadsimController } from "./TreadsimController.js";
import { TreadsimCameraController } from "./TreadsimCameraController.js";
import { LookOffset } from "./LookOffset.js";
import { Hud, bindKeys } from "./Hud.js";
import { showServerStatus } from "./ServerStatus.js";
import { GroundSampler } from "./GroundSampler.js";
import { TerrainSampler } from "./TerrainSampler.js";
import { WmoFloorCaster } from "./WmoFloorCaster.js";

let current: { controller: TreadsimController; hud: Hud; unbind: () => void; raf: number } | null = null;

/** Called by noclip's WoW scene loader once a continent scene exists. */
export function installTreadsim(scene: WdtScene): TreadsimController {
    if (current) {
        cancelAnimationFrame(current.raf);
        current.unbind();
        current.hud.destroy();
        current.controller.destroy();
    }
    void showServerStatus();
    const model = new ManualSpeedModel();
    const controller = new TreadsimController(model);
    controller.attachCamera((window as any).main.viewer.camera);
    const world = scene.world as any; // WorldData | LazyWorldData: both have adts; globalWmoDef exists on LazyWorldData
    controller.groundSampler = new GroundSampler(new TerrainSampler(world), new WmoFloorCaster(world));
    void model.start();
    const hud = new Hud(model, controller);
    const unbind = bindKeys(model);

    const cameraController = new TreadsimCameraController(controller, new FPSCameraController(), new LookOffset());
    // main.ts installs this after createScene resolves (viewer.setCameraController) — no noclip edit needed.
    (scene as SceneGfx).createCameraController = () => cameraController;

    const loop = () => {
        current!.raf = requestAnimationFrame(loop);
        hud.render();
    };
    current = { controller, hud, unbind, raf: requestAnimationFrame(loop) };
    (window as any).treadsim = {
        controller, model, scene, ground: controller.groundSampler, cameraController,
        teleport: (x: number, y: number) => controller.teleportTo(x, y),
    };
    return controller;
}
