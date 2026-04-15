import type { DesireType } from "../../../models/desires.js";

/**
 * Desire filter functions take the generated desires and filter them to ensure uniqueness and relevance.
 * @param desires - An array of DesireType 
 * @returns A filtered array of DesireType with duplicates removed based on the desire type.
 */
export function filterDesires(desires: DesireType[]): DesireType[] {
    //#TODO: update the current filter. We think that here the selectBestDesire function should 
    // be implemented instead
    const seen = new Set<string>();
    return desires.filter(desire => {
        if (seen.has(desire.type)) return false;
        seen.add(desire.type);
        return true;
    });
}
