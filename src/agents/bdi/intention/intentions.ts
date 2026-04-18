import { aStar } from "../navigation/a_star.js";
import type { Beliefs } from "../belief/beliefs.js";
import type {  GeneratedDesires } from "../../../models/desires.js";
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
            // If the current intention is no longer valid, we need to select a new desire and replan from scratch
            this.currentIntention = { desire: getBestDesire(this.desires, beliefs), path: [] };
            // If the current intention is no longer valid, we need to replan from scratch
            this.plan(beliefs, null);
        }

        // Validate current path
        if (!this.validatePath(beliefs)) {
            let agentBlocked: Position | null = null;
            // If the current path is no longer valid, we can try to replan by setting the temporary blocks
            if(this.isNextStepBlockedByAgent(beliefs)){
                // If the path is blocked by an agent, we can try to replan by treating the next step as temporarily blocked
                agentBlocked = this.currentIntention?.path[0] || null;
            }
            this.plan(beliefs, agentBlocked);
        }
    }

    /**
     * Returns the current intention's desire and path, or null if no intention is currently active.
     * @returns 
     */
    getCurrentIntention(): Intention | null {
        return this.currentIntention;
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
     * Checks every consecutive step in the path, not just the first.
     * @returns true if the current path is still valid, false otherwise.
     */
    private validatePath(beliefs: Beliefs): boolean {
        // If there is no current intention or path, it's not valid
        if (!this.currentIntention || this.currentIntention.path.length === 0) return false;

        // Retrieve the current position from beliefs 
        const me = beliefs.agents.getCurrentMe();
        if (!me?.lastPosition) return false;

        // Check if the next step is blocked by a known agent
        if (this.isNextStepBlockedByAgent(beliefs)) {
            return false;
        }

        // Check if every step within the observation range is still walkable
        const obsDistance = beliefs.agents.getObservationDistance();
        const steps = [me.lastPosition, ...this.currentIntention.path];
        for (let i = 0; i < steps.length - 1; i++) {
            // If the step is beyond the observation distance, we cannot validate it
            const manhattanDist = Math.abs(steps[i].x - me.lastPosition.x) + Math.abs(steps[i].y - me.lastPosition.y);
            if (obsDistance !== null && manhattanDist > obsDistance) break;
            // If any step in the path is not walkable, the path is no longer valid
            if (!beliefs.map.isWalkable(steps[i], steps[i + 1])) return false;
        }

        // The current path is still valid
        return true;
    }


    /**
     * Returns true if the next step in the path is occupied by a known agent.
     * @param beliefs The current beliefs of the agent
     * @returns true if the next step is occupied by a known agent, false otherwise.
     */
    private isNextStepBlockedByAgent(beliefs: Beliefs): boolean {
        // If there is no current intention or path
        if (!this.currentIntention || this.currentIntention.path.length === 0) return false;

        // Get the next step in the path
        const next = this.currentIntention.path[0];
        // Get all known agents (friends and enemies) from beliefs
        const agents = [
            ...beliefs.agents.getCurrentFriends(),
            ...beliefs.agents.getCurrentEnemies(),
        ];
        // Check if any agent is currently at the next step position
        return agents.some(a => a.lastPosition?.x === next.x && a.lastPosition?.y === next.y);
    }

    /**
     * Computes a path for the current intention using A* algorithm based on the current beliefs.
     * @param beliefs - The current beliefs of the agent
     * @returns 
     */
    private plan(beliefs: Beliefs, temporaryBlocked: Position | null): void {
        // If there is no current intention, we cannot plan
        if (!this.currentIntention) return;

        // Get current position from beliefs
        const me = beliefs.agents.getCurrentMe();
        if (!me?.lastPosition) return;

        // Type guard to ensure the desire has a target (i.e. it's a navigation desire)
        if (!('target' in this.currentIntention.desire)) return;                                                                                                                           

        // Compute path using A* algorithm, treating blockedByAgentAt as temporarily unwalkable
        const path = aStar(me.lastPosition, this.currentIntention.desire.target, (from, to) => {
            if (temporaryBlocked && to.x === temporaryBlocked.x && to.y === temporaryBlocked.y) return false;
            return beliefs.map.isWalkable(from, to);
        });
        
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
