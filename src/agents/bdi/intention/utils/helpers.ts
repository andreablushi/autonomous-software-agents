import { DesireType } from "../../../../models/desires.js";

/** Compares two desires for equality */
export function sameDesire(a: DesireType, b: DesireType): boolean {
    if (a.type !== b.type) return false;
    if (!('target' in a) && !('target' in b)) return true;
    if (!('target' in a) || !('target' in b)) return false;
    return a.target.x === b.target.x && a.target.y === b.target.y;
}