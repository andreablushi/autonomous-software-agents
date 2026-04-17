import type {
    GeneratedDesires,
    ExploreDesire,
    ReachParcelDesire,
    PickupParcelDesire,
    PutdownParcelDesire,
    DeliverParcelDesire,
} from "../../../models/desires.js";
import type { Beliefs } from "../belief/beliefs.js";

/**
 * Build the full set of candidate desires from the current beliefs.
 * @param beliefs - The current beliefs of the agent
 * @returns A GeneratedDesires map keyed by desire kind; absent kinds map to an empty array.
 */
export function generateDesires(beliefs: Beliefs): GeneratedDesires {
    // Initialize the desires map with empty arrays for each desire type
    const desires: GeneratedDesires = new Map();

    // PICKUP_PARCEL agent is standing on a parcel
    const pickup = generatePickupDesire(beliefs);
    if (pickup) desires.set("PICKUP_PARCEL", [pickup]);

    // PUTDOWN_PARCEL agent is at a delivery tile and carrying parcels
    const putdown = generatePutdownDesire(beliefs);
    if (putdown) desires.set("PUTDOWN_PARCEL", [putdown]);

    // REACH_PARCEL for each available parcel with a known position
    const reachParcel = generateReachParcelDesires(beliefs);
    if (reachParcel.length > 0) desires.set("REACH_PARCEL", reachParcel);

    // DELIVER_PARCEL for each delivery tile if the agent is carrying any parcels
    const deliverParcel = generateDeliverDesires(beliefs);
    if (deliverParcel.length > 0) desires.set("DELIVER_PARCEL", deliverParcel);

    // EXPLORE desire for each spawn tile as a fallback when no parcels are available
    const explore = generateExploreDesires(beliefs);
    if (explore.length > 0) desires.set("EXPLORE", explore);

    return desires;
}

/**
 * Generate a PickupParcelDesire if the agent is standing on an available parcel.
 * @param beliefs - The current beliefs of the agent
 * @returns A PickupParcelDesire, or null if the agent is not standing on an available parcel
 */
function generatePickupDesire(beliefs: Beliefs): PickupParcelDesire | null {
    // Get current agent position from beliefs
    const me = beliefs.agents.getCurrentMe();
    if (!me?.lastPosition) return null;
    const ax = me.lastPosition.x;
    const ay = me.lastPosition.y;
    
    /*
    #TODO: currently, the limit is set on the server, but no checks are done for it.
    An agent can carry as many parcels as he wants

    // Check if we can carry more parcels
    const carryCapacity = beliefs.agents.getCarryCapacity();
    if (carryCapacity !== null) {
        const currentlyCarried = beliefs.parcels.getCarriedByAgent(me.id).length;
        if (currentlyCarried >= carryCapacity) return null;
    }
    */

    // Check if any available parcel is at the agent's current position
    const onParcel = beliefs.parcels.getAvailableParcels().some(
        parcel => parcel.lastPosition &&
            Math.round(parcel.lastPosition.x) === ax &&
            Math.round(parcel.lastPosition.y) === ay
    );
    return onParcel ? { type: "PICKUP_PARCEL" } : null;
}

/**
 * Generate a PutdownParcelDesire if the agent is standing on a delivery tile while carrying parcels.
 * @param beliefs - The current beliefs of the agent
 * @returns A PutdownParcelDesire, or null if the agent is not standing on a delivery tile or is not carrying any parcels
 */
function generatePutdownDesire(beliefs: Beliefs): PutdownParcelDesire | null {
    // Get current agent position from beliefs
    const me = beliefs.agents.getCurrentMe();
    if (!me?.lastPosition) return null;
    const ax = me.lastPosition.x;
    const ay = me.lastPosition.y;
    
    // Check if the agent is carrying any parcels
    const carried = beliefs.parcels.getCarriedByAgent(me.id);
    if (carried.length === 0) return null;

    // Check if the agent is currently on a delivery tile
    const atDelivery = beliefs.map.getDeliveryTiles().some(
        tile => tile.x === ax && tile.y === ay);
    return atDelivery ? { type: "PUTDOWN_PARCEL" } : null;
}

/**
 * Generate a ReachParcelDesire for each available parcel with a known position, targeting its last known location.
 * @param beliefs - The current beliefs of the agent
 * @returns A ReachParcelDesire, or null if no parcels with known positions are available
 */
function generateReachParcelDesires(beliefs: Beliefs): ReachParcelDesire[] {
    /*
    #TODO: currently, on the server, there is no limit to how many parcels an agent can carry.

    // Check if we can carry more parcels before generating reach desires
    const me = beliefs.agents.getCurrentMe();
    if (!me) return [];
    const carryCapacity = beliefs.agents.getCarryCapacity();
    if (carryCapacity !== null) {
        const currentlyCarried = beliefs.parcels.getCarriedByAgent(me.id).length;
        if (currentlyCarried >= carryCapacity) return [];
    }
    */
    return beliefs.parcels.getAvailableParcels()
        .filter(parcel => parcel.lastPosition !== null)
        .map(parcel => ({
            type: "REACH_PARCEL" as const,
            target: { x: parcel.lastPosition!.x, y: parcel.lastPosition!.y },
        }));
}

/**
 * Generate a DeliverParcelDesire for each delivery tile if the agent is currently carrying any parcels
 * @param beliefs - The current beliefs of the agent
 * @returns A DeliverParcelDesire, or null if the agent is not carrying any parcels
 */
function generateDeliverDesires(beliefs: Beliefs): DeliverParcelDesire[] {
    // If the agent is not carrying any parcels, it has no desire to deliver
    const me = beliefs.agents.getCurrentMe();
    if (!me) return [];
    if (beliefs.parcels.getCarriedByAgent(me.id).length === 0) return [];

    // Otherwise, generate a desire to deliver to each delivery tile
    return beliefs.map.getDeliveryTiles().map(tile => ({
        type: "DELIVER_PARCEL" as const,
        target: { x: tile.x, y: tile.y },
    }));
}

/**
 * Generate one ExploreDesire per spawn tile.
 * @param beliefs - The current beliefs of the agent
 * @returns An array of ExploreDesires targeting each spawn tile, or an empty array if no spawn tiles are known
 */
function generateExploreDesires(beliefs: Beliefs): ExploreDesire[] {
    return beliefs.map.getSpawnTiles().map(tile => ({
        type: "EXPLORE" as const,
        target: { x: tile.x, y: tile.y },
    }));
}
