import type { ExploreDesire, GetParcelDesire, DesireType } from "../../../models/desires.js";
import type { Beliefs } from "../belief/beliefs.js";

/**
 * Desire generator functions create potential desires based on the agent's current beliefs about the environment.
 * @param beliefs - The current beliefs of the agent
 * @returns An array of DesireType representing the potential desires generated from the beliefs.
 */
export function generateDesires(beliefs: Beliefs): DesireType[] {
    const desires: DesireType[] = [];
    
    // Try generating a GetParcelDesire first
    const getParcel = generateGetParcelDesire(beliefs);
    if (getParcel) {
        desires.push(getParcel);
    }
    // If no GetParcelDesire was generated, fall back to generating an ExploreDesire
    else {
        const explore = generateExploreDesire(beliefs);
        if (explore) desires.push(explore);
    }

    return desires;
}

/**
 * Generate a GetParcelDesire targeting the highest-reward available parcel.
 * @param beliefs - The current beliefs of the agent
 * @returns A GetParcelDesire, or null if no parcels with known positions are available
 */
function generateGetParcelDesire(beliefs: Beliefs): GetParcelDesire | null {
    //#TODO: reason about if we should generate a desire for all non picked up 
    // parcels, maybe considering the distance and the reward
    const best = beliefs.parcels.getBestRewardParcel();
    if (!best?.lastPosition) return null;
    return { type: "GET_PARCEL", target: best.lastPosition, parcelId: best.id };
}

/**
 * Generate an ExploreDesire targeting the nearest spawn tile.
 * @param beliefs - The current beliefs of the agent
 * @returns An ExploreDesire with a target spawn tile
 */
function generateExploreDesire(beliefs: Beliefs): ExploreDesire | null {
    const nearestSpawnTile = beliefs.map.getNearestSpawnTile(beliefs.agents.getCurrentMe()!);
    if (!nearestSpawnTile) return null;
    return { type: "EXPLORE", target: { x: nearestSpawnTile.x, y: nearestSpawnTile.y } };
}

