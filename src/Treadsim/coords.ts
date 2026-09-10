import type { ReadonlyVec3 } from "gl-matrix";
import { TILE_SIZE } from "./AdtHeightField.js";

/** Same constant noclip uses in `placementSpaceFromAdtSpace` (WorldOfWarcraft/scenes.ts). */
export const MAP_SIZE = 17066;

/** noclip (placement) space -> game/ADT space. noclip = (MAP_SIZE - adtY, adtZ, MAP_SIZE - adtX). */
export function adtFromNoclip(n: ReadonlyVec3): [number, number, number] {
    return [MAP_SIZE - n[2], MAP_SIZE - n[0], n[1]];
}

export function noclipFromAdt(a: ReadonlyVec3): [number, number, number] {
    return [MAP_SIZE - a[1], a[2], MAP_SIZE - a[0]];
}

/** Tile index in noclip's AdtCoord order ([x, y] as used by LazyWorldData). */
export function adtTileCoord(adtX: number, adtY: number): [number, number] {
    return [Math.floor(32 - adtY / TILE_SIZE), Math.floor(32 - adtX / TILE_SIZE)];
}
