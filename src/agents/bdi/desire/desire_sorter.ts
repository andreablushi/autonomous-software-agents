import type { Beliefs } from "../belief/beliefs.js";
import type {
    DesireType,
    ExploreDesire,
    ReachParcelDesire,
    DeliverParcelDesire,
    GeneratedDesires,
} from "../../../models/desires.js";
import { manhattanDistance } from "../../../utils/metrics.js";
import { MapBeliefs } from "../belief/map_beliefs.js";
import { IntentionQueue } from "../../../models/intentions.js";


/**
 * Determines the priority tier of a desire type.
 * Priority tiers: PICKUP_PARCEL=3, PUTDOWN_PARCEL=2, REACH_PARCEL|DELIVER_PARCEL=1, EXPLORE=0
 */
export function getPriorityForDesire(desire: DesireType): number {
    if (desire.type === 'PICKUP_PARCEL') return 3;
    if (desire.type === 'PUTDOWN_PARCEL') return 2;
    if (desire.type === 'REACH_PARCEL' || desire.type === 'DELIVER_PARCEL') return 1;
    if (desire.type === 'EXPLORE') return 0;
    return 0;
}

/**
 * Build the ordered desire queue for all candidates generated this cycle.
 * Called by bdi_agent, handles the full priority ladder including action-tier desires.
 *
 * Priority tiers:
 *   1. Action      - PICKUP_PARCEL, then PUTDOWN_PARCEL (no navigation).
 *   2. Goal        - best REACH_PARCEL vs best DELIVER_PARCEL, scored independently then compared.
 *   3. Fallback    - best EXPLORE (nearest spawn outside the observation range).
 *
 * @param desires Grouped desires from the generator.
 * @param beliefs Current beliefs of the agent.
 * @returns The ordered desire queue, or an empty array if no candidates are available.
 */
export function getIntentionQueue(desires: GeneratedDesires, beliefs: Beliefs): IntentionQueue {
    const queue: IntentionQueue = [];

    // Immediate action desires have top priority
    const pickup = desires.get("PICKUP_PARCEL") ?? [];
    for (const desire of pickup) {
        queue.push({ desire, score: Number.POSITIVE_INFINITY });
    }

    const putdown = desires.get("PUTDOWN_PARCEL") ?? [];
    for (const desire of putdown) {
        queue.push({ desire, score: Number.POSITIVE_INFINITY });
    }

    // Goal desires require scoring and comparison
    const reaches = (desires.get("REACH_PARCEL") ?? []) as ReachParcelDesire[];
    const delivers = (desires.get("DELIVER_PARCEL") ?? []) as DeliverParcelDesire[];

    // Score each desire independently
    for (const desire of reaches) {
        queue.push({ desire, score: scoreReachDesire(desire, beliefs)});
    }
    // Score deliver desires independently
    for (const desire of delivers) {
        queue.push({ desire, score: scoreDeliverDesire(desire, beliefs)});
    }

    // Fallback to exploration desires
    const explores = (desires.get("EXPLORE") ?? []) as ExploreDesire[];
    const now = Date.now();
    // Score each explore desire independently based on sensing age and distance
    for (const desire of explores) {
        queue.push({ desire, score: scoreExplore(
            desire,
            beliefs.agents.getCurrentMe()?.lastPosition ?? null,
            beliefs.map,
            now
        ) });
    }

    // Sort the queue by priority tier first, then by score within the same tier
    return queue.sort((a, b) => getPriorityForDesire(b.desire) - getPriorityForDesire(a.desire) || b.score - a.score);
}

/**
 * Score a REACH_PARCEL desire as `parcelReward / (distance + 1)`.
 * Falls back to 0 when the parcel can't be matched or the agent position is unknown.
 * Basic heuristic — replace this function to improve goal selection in the future.
 */
function scoreReachDesire(desire: ReachParcelDesire, beliefs: Beliefs): number {
    const me = beliefs.agents.getCurrentMe();
    if (!me?.lastPosition) return 0;

    // Find the parcel matching the desire's target position among available parcels
    const parcel = beliefs.parcels.getAvailableParcels().find(
        p => p.lastPosition &&
            p.lastPosition.x === desire.target.x &&
            p.lastPosition.y === desire.target.y
    );
    if (!parcel) return 0;

    // Calculate the Manhattan distance from the agent's current position to the parcel's position
    const distance = manhattanDistance(me.lastPosition, desire.target);
    return parcel.reward / (distance + 1);
}

/**
 * Score a DELIVER_PARCEL desire as `sum(carriedRewards) / (distance + 1)`.
 * Falls back to 0 when the agent position is unknown or nothing is being carried.
 * Basic heuristic — replace this function to improve goal selection in the future.
 */
function scoreDeliverDesire(desire: DeliverParcelDesire, beliefs: Beliefs): number {
    const me = beliefs.agents.getCurrentMe();
    if (!me?.lastPosition) return 0;

    // Calculate the total reward of all parcels currently being carried by the agent
    const carriedReward = beliefs.parcels.getCarriedByAgent(me.id).reduce((s, p) => s + p.reward, 0);
    if (carriedReward === 0) return 0;

    // Calculate the Manhattan distance from the agent's current position to the delivery target position
    const distance = manhattanDistance(me.lastPosition, desire.target);
    return carriedReward / (distance + 1);
}

/**
 * Score an ExploreDesire based on how long it's been since the target tile was last sensed, 
 * adjusted for distance: score = age / (distance + 1).
 * Tiles that have never been sensed score Infinity and will always be chosen over sensed tiles.
 * Among sensed tiles, those that haven't been sensed for a long time and are closer will score higher.
 * @param desire The ExploreDesire to score, containing the target tile position.
 * @param agentPos The current position of the agent, used to calculate distance. If null, the desire will score 0.
 * @param mapBeliefs The agent's beliefs about the map, used to look up the last sensing time for the target tile.
 * @param now The current timestamp, used to calculate the age of the last sensing.
 * @returns A numeric score representing the desirability of exploring the target tile, where higher is better.
 */
function scoreExplore(desire: ExploreDesire, agentPos: { x: number; y: number } | null, mapBeliefs: MapBeliefs, now: number): number {
    if (!agentPos) return 0; // If we don't know our position, we can't calculate a meaningful score, so return 0.

    // Get spawn tile distance and age since last sensing
    const distance = manhattanDistance(desire.target, agentPos);
    const lastSensing = mapBeliefs.getSpawnTileSensingTime(desire.target);
    
    // If the tile has never been sensed, assign it an infinite score to prioritize it above all else. 
    // Otherwise, calculate the score based on age and distance.
    const age = lastSensing !== undefined ? now - lastSensing : Infinity;

    // Get the cluster weight for the target tile
    const clusterWeight = mapBeliefs.getSpawnTileClusterWeight(desire.target);
    const weight = clusterWeight > 0 ? clusterWeight : 1;
    return weight * age / (distance + 1);
}
