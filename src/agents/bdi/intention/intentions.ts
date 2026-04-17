import { aStar } from "../navigation/a_star.js";
import type { Beliefs } from "../belief/beliefs.js";
import type { DesireType, GeneratedDesires, NavigationDesire } from "../../../models/desires.js";
import type { Intention } from "../../../models/intentions.js";
import type { Position } from "../../../models/position.js";
import { getBestDesire } from "../desire/desire_filter.js";

/**
 * Given the current position and a target position, computes the direction of next step
 * @param from - The current position of the agent
 * @param to - The target position
 * @returns The direction to move from the current position to the target position.
 */
function posToDirection(from: Position, to: Position): string {
    if (to.x > from.x) return 'right';
    if (to.x < from.x) return 'left';
    if (to.y > from.y) return 'up';
    return 'down';
}

/**
 * Manages the agent's current intention: validates the plan on each sensing cycle,
 * replans via A* when needed, and exposes the next direction to execute.
 */
export class Intentions {
    private currentIntention: Intention | null = null;
    private desires: GeneratedDesires = new Map();

    /**
     * Called each deliberation cycle.
     * Validates the current plan (replans if blocked or desire changed) and recomputes via A* if needed.
     * @param beliefs - The current beliefs of the agent.
     * @param desires - The current desires of the agent
     */
    update(beliefs: Beliefs, desires: GeneratedDesires): void {
        // If no desires, drop current intention
        if (desires.size === 0) {
            this.currentIntention = null;
            return;
        }

        // Update desires in the intention manager
        this.desires = desires;

        // Get current position from beliefs
        const me = beliefs.agents.getCurrentMe();
        if (!me?.lastPosition) return;

        // Validate current intention 
        if (!this.validateCurrentIntention(beliefs)) {
            this.currentIntention = null;
        }

        // Validate current path
        //#TODO: Should update the plan and not drop the intention immediately
        if (!this.validatePath(beliefs)) {
            this.currentIntention = null;
        }

        // Replan if no valid intention or path
        if (!this.currentIntention || this.currentIntention.path.length === 0) {
            this.currentIntention = { desire: getBestDesire(this.desires, beliefs), path: [] };
            this.plan(beliefs);
        }
    }

    /**
     * Validates if the current intention is still valid based on the current desires and beliefs.
     * @returns true if the current intention is still valid, false otherwise.
     */
    private validateCurrentIntention(beliefs: Beliefs): boolean {
        // If there is no current intention, it's not valid
        if (!this.currentIntention) return false;

        // Check if the desire of the current intention is still the top desire
        const topDesire = getBestDesire(this.desires, beliefs);
        const intentionDesire = this.currentIntention.desire;

        // First check if the desire type is still the same
        if(topDesire.type !== intentionDesire.type) {
            return false;
        }
        
        // If it's a navigation desire, also check if the target is still the same
        if ('target' in topDesire && 'target' in intentionDesire) {
            if (topDesire.target.x !== intentionDesire.target.x || topDesire.target.y !== intentionDesire.target.y) {
                return false;
            }
        }

        // The current intention is still valid
        return true;
    }

    /**
     * Validates if the current path is still valid (not blocked) based on the current beliefs.
     * @param beliefs 
     * @returns 
     */
    private validatePath(beliefs: Beliefs): boolean {
        if (!this.currentIntention || this.currentIntention.path.length === 0) return false;
        return beliefs.map.isWalkable(this.currentIntention.path[0]);
    }

    /**
     * Computes a path for the current intention using A* algorithm based on the current beliefs.
     * @param beliefs - The current beliefs of the agent
     * @returns 
     */
    private plan(beliefs: Beliefs): void {
        // If there is no current intention, we cannot plan
        if (!this.currentIntention) return;

        // Get current position from beliefs
        const me = beliefs.agents.getCurrentMe();
        if (!me?.lastPosition) return;

        // Type guard to ensure the desire has a target (i.e. it's a navigation desire)
        if (!('target' in this.currentIntention.desire)) return;                                                                                                                           

        // Compute path using A* algorithm
        const path = aStar(me.lastPosition, this.currentIntention.desire.target, (pos) => beliefs.map.isWalkable(pos));
        
        // If no path found, drop the intention
        if (!path || path.length === 0) {
            this.currentIntention = null;
            return;
        }
        
        // Update the current intention with the new path
        this.currentIntention.path = path;
    }

    /**
     * Returns the next direction to move and advances the path.
     * @param from - The current position of the agent, used to compute the direction to the next step.
      * @returns The next direction to move ('up', 'down', 'left', 'right') or null if no intention or path is available.
     */
    getNextAction(from: { x: number; y: number }): string | null {
        // If there is no current intention, we cannot return a next action
        if (!this.currentIntention) return null;

        // Handle action desires (pickup/putdown) immediately without pathfinding
        if (this.currentIntention.desire.type === 'PICKUP_PARCEL') return 'pickup';
        if (this.currentIntention.desire.type === 'PUTDOWN_PARCEL') return 'putdown';

        // If it's a navigation desire, check there is a path
        if (this.currentIntention.path.length === 0) return null;

        // If the desire is a navigation desire, compute the direction to the next step
        const next = this.currentIntention.path.shift()!;
        const direction = posToDirection(from, next);

        // If the path is now empty, we have reached the target and can drop the intention
        if (this.currentIntention.path.length === 0) {
            this.currentIntention = null;
        }
        
        return direction;
    }
}
