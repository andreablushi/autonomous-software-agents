import type { Beliefs } from "../belief/beliefs.js";
import type {
    DesireType,
    NavigationDesire,
    ExploreDesire,
    ReachParcelDesire,
    DeliverParcelDesire,
    GeneratedDesires,
} from "../../../models/desires.js";
import { manhattanDistance } from "../../../utils/metrics.js";
import { MapBeliefs } from "../belief/map_beliefs.js";

/**
 * Select the top desire out of all candidates generated this cycle.
 * Called by bdi_agent, handles the full priority ladder including action-tier desires.
 *
 * Priority tiers:
 *   1. Action      - PICKUP_PARCEL, then PUTDOWN_PARCEL (no navigation).
 *   2. Goal        - best REACH_PARCEL vs best DELIVER_PARCEL, scored independently then compared.
 *   3. Fallback    - best EXPLORE (nearest spawn outside the observation range).
 *
 * @param desires Grouped desires from the generator.
 * @param beliefs Current beliefs of the agent.
 * @returns The chosen desire, or null if no candidates are available.
 */
export function getBestDesire(desires: GeneratedDesires, beliefs: Beliefs): DesireType {
    // Immediate action desires have top priority
    const pickup = desires.get("PICKUP_PARCEL") ?? [];
    if (pickup.length > 0) return pickup[0];
    const putdown = desires.get("PUTDOWN_PARCEL") ?? [];
    if (putdown.length > 0) return putdown[0];

    // Goal desires require scoring and comparison
    const reaches = (desires.get("REACH_PARCEL") ?? []) as ReachParcelDesire[];
    const delivers = (desires.get("DELIVER_PARCEL") ?? []) as DeliverParcelDesire[];

    // Get the best candidate from each goal category, then compare
    const bestReach = filterReachParcel(reaches, beliefs);
    const bestDeliver = filterDeliverParcel(delivers, beliefs);

    // Choose the best between REACH_PARCEL and DELIVER_PARCEL
    const chosen = chooseReachOrDeliver(bestReach, bestDeliver, beliefs);
    if (chosen) return chosen;

    // Fallback to exploration desires
    const explores = (desires.get("EXPLORE") ?? []) as ExploreDesire[];
    return filterExplore(
        explores,
        beliefs.agents.getCurrentMe()?.lastPosition ?? null,
        beliefs.map
    );
}

/**
 * Pick the highest-scoring REACH_PARCEL candidate.
 * @param reaches All generated ReachParcelDesires for this cycle.
 * @param beliefs Current beliefs of the agent.
 * @returns The best candidate, or null if the list is empty.
 */
function filterReachParcel(reaches: ReachParcelDesire[], beliefs: Beliefs): ReachParcelDesire | null {
    if (reaches.length === 0) return null;
    return reaches.reduce((best, d) =>
        scoreReachDesire(d, beliefs) > scoreReachDesire(best, beliefs) ? d : best
    );
}

/**
 * Pick the highest-scoring DELIVER_PARCEL candidate.
 * @param delivers All generated DeliverParcelDesires for this cycle.
 * @param beliefs Current beliefs of the agent.
 * @returns The best candidate, or null if the list is empty.
 */
function filterDeliverParcel(delivers: DeliverParcelDesire[], beliefs: Beliefs): DeliverParcelDesire | null {
    if (delivers.length === 0) return null;
    return delivers.reduce((best, d) =>
        scoreDeliverDesire(d, beliefs) > scoreDeliverDesire(best, beliefs) ? d : best
    );
}

/**
 * Given the best REACH_PARCEL and DELIVER_PARCEL candidates, select the one with the highest score.
 * @param reach The best REACH_PARCEL desire.
 * @param deliver The best DELIVER_PARCEL desire.
 * @param beliefs Current beliefs of the agent, used for scoring the desires.
 * @returns The chosen desire, or null if no candidates are available.
 */
function chooseReachOrDeliver( reach: ReachParcelDesire | null, deliver: DeliverParcelDesire | null, beliefs: Beliefs): NavigationDesire | null {
    // If both are null return null
    if (!reach && !deliver) return null;

    // If only one is available, return it
    if (!reach) return deliver;
    if (!deliver) return reach;

    // If both are available, score and compare
    const reachScore = scoreReachDesire(reach, beliefs);
    const deliverScore = scoreDeliverDesire(deliver, beliefs);
    return reachScore >= deliverScore ? reach : deliver;
}

/**
 * Score a REACH_PARCEL desire as `parcelReward / (distance + 1)`.
 * Falls back to 0 when the parcel can't be matched or the agent position is unknown.
 * Basic heuristic — replace this function to improve goal selection in the future.
 */
function scoreReachDesire(desire: ReachParcelDesire, beliefs: Beliefs): number {
    const me = beliefs.agents.getCurrentMe();
    if (!me?.lastPosition) return 0;

    const parcel = beliefs.parcels.getAvailableParcels().find(
        p => p.lastPosition &&
            p.lastPosition.x === desire.target.x &&
            p.lastPosition.y === desire.target.y
    );
    if (!parcel) return 0;

    const distance = manhattanDistance(me.lastPosition, desire.target);
    return parcel.reward / (distance + 1);
}

/**
 * Score a DELIVER_PARCEL desire as `sum(carriedRewards) / (distance + 1)`.
 * Falls back to 0 when the agent position is unknown or nothing is being carried.
 * Basic heuristic — replace this function to improve goal selection in the future.
 */
function scoreDeliverDesire(
    desire: DeliverParcelDesire, 
    beliefs: Beliefs
): number {
    const me = beliefs.agents.getCurrentMe();
    if (!me?.lastPosition) return 0;

    const carriedReward = beliefs.parcels.getCarriedByAgent(me.id).reduce((s, p) => s + p.reward, 0);
    if (carriedReward === 0) return 0;

    const distance = manhattanDistance(me.lastPosition, desire.target);
    return carriedReward / (distance + 1);
}

/**
 * Select the best ExploreDesire using sensing-time scoring: score = age / (distance + 1).
 * Never-sensed tiles score Infinity and always win. Among sensed tiles, older and closer tiles score higher.
 * Candidates are pre-filtered to those outside the agent's observation range; falls back to all tiles if none qualify.
 */
export function filterExplore(
    explores: ExploreDesire[],
    agentPos: { x: number; y: number } | null,
    mapBeliefs: MapBeliefs
): ExploreDesire {
    // If we don't know where we are, pick the first explore desire available
    if (!agentPos) return explores[0];

    // Score each candidate and pick the best one
    const now = Date.now();
    return explores.reduce((best, desire) =>
        scoreExplore(desire, agentPos, mapBeliefs, now) > scoreExplore(best, agentPos, mapBeliefs, now) ? desire : best,
    );
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
function scoreExplore(
    desire: ExploreDesire,
    agentPos: { x: number; y: number },
    mapBeliefs: MapBeliefs,
    now: number
): number {
    // Get spawn tile distance and age since last sensing
    const distance = manhattanDistance(desire.target, agentPos);
    const lastSensing = mapBeliefs.getSpawnTilesSensingTime(desire.target);
    // If the tile has never been sensed, assign it an infinite score to prioritize it above all else. 
    // Otherwise, calculate the score based on age and distance.
    const age = lastSensing !== undefined ? now - lastSensing : Infinity;

    return age / (distance + 1);
}
