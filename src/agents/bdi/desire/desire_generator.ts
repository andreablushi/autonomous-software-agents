import type { ExploreDesire, DesireType } from "../../../models/desires.js";
import type { Beliefs } from "../belief/beliefs.js";

/**
 * Desire generator functions create potential desires based on the agent's current beliefs about the environment.
 * @param beliefs - The current beliefs of the agent
 * @returns An array of DesireType representing the potential desires generated from the beliefs.
 */
export function generateDesires(beliefs: Beliefs): DesireType[] {
    const desires: DesireType[] = [];

    if (beliefs.parcels.getAvailableParcels().length === 0) {
        desires.push(generateExploreDesire(beliefs)!);
    }

    return desires;
}

/**
 * Generate an ExploreDesire if there are no available parcels to pick up
 * @param beliefs - The current beliefs of the agent
 * @returns An ExploreDesire with a target spawn tile
 */
function generateExploreDesire(beliefs: Beliefs): ExploreDesire | null {
    // Select the nearest spawn tile as the target 
    const nearestSpawnTile = beliefs.map.getNearestSpawnTile(beliefs.agents.getCurrentMe()!);
    // If there are no spawn tiles available, return null (though this should not happen in a valid map)
    if (!nearestSpawnTile) return null;

    return { type: "EXPLORE", target: { x: nearestSpawnTile.x, y: nearestSpawnTile.y } };
}

