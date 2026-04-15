import type { DesireType } from "../../../models/desires.js";

/**
 * Desire filter functions take the generated desires and filter them to ensure uniqueness and relevance.
 * @param desires - An array of DesireType 
 * @returns A filtered array of DesireType with duplicates removed based on the desire type.
 */
export function filterDesires(desires: DesireType[]): DesireType[] {
    const seen = new Set<string>();
    return desires.filter(d => {
        if (seen.has(d.type)) return false;
        seen.add(d.type);
        return true;
    });
}
