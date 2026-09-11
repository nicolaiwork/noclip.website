import { adtSpaceFromPlacementSpace, placementSpaceFromAdtSpace, type WdtScene } from "../WorldOfWarcraft/scenes.js";
import { ManualSpeedModel } from "./ManualSpeed.js";
import { TreadsimController } from "./TreadsimController.js";
import { Hud, bindKeys } from "./Hud.js";
import { showServerStatus } from "./ServerStatus.js";
import { GroundSampler } from "./GroundSampler.js";
import { TerrainSampler } from "./TerrainSampler.js";
import { WmoFloorCaster } from "./WmoFloorCaster.js";
import { NoclipWmoWorld } from "./NoclipWmoWorld.js";

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
    controller.groundSampler = new GroundSampler(
        new TerrainSampler(world),
        // placement space === noclip space; the WMO placements are in ADT space.
        new WmoFloorCaster(new NoclipWmoWorld(world, placementSpaceFromAdtSpace, adtSpaceFromPlacementSpace)),
    );
    void model.start();
    const hud = new Hud(model, controller);
    const unbind = bindKeys(model);

    let last: number | null = null;
    const loop = (t: number) => {
        current!.raf = requestAnimationFrame(loop);
        if (last !== null) controller.tick((t - last) / 1000);
        last = t;
        hud.render();
    };
    current = { controller, hud, unbind, raf: requestAnimationFrame(loop) };
    (window as any).treadsim = { controller, model, scene, ground: controller.groundSampler };
    return controller;
}
