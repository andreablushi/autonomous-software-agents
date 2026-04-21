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
            // Pick the best desire that has a reachable path; skip unreachable ones
            this.selectIntention(beliefs);
            // Already generated a valid path for the new intention
            return;
        }

        // Validate current path if there is an active intention
        if (!this.validatePath(beliefs)) {
            // Replan the path
            this.plan(beliefs);
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

        // If after replanning the path is empty, it's not valid
        if (this.currentIntention.path.length === 0) return false;

        // Check if the path is still walkable according to beliefs
        let currentPos = me.lastPosition;
        for (const nextPos of this.currentIntention.path) {
            if (!beliefs.map.isWalkable(currentPos, nextPos)) {
                return false;
            }
            currentPos = nextPos;
        }

        // The current path is still valid
        return true;
    }


    /**
     * Returns true if the next step in the path is occupied by a known agent.
     * @param beliefs The current beliefs of the agent
     * @returns true if the next step is occupied by a known agent, false otherwise.
     */
    private isNextStepBlockedByAgent(beliefs: Beliefs): Boolean {
        // If there is no current intention or path, we cannot check for blocking
        if (!this.currentIntention || this.currentIntention.path.length === 0) return false;

        // Get the next step in the path
        const next = this.currentIntention.path[0];
        // Get the list of currently believed enemy agents from beliefs
        const enemies = beliefs.agents.getCurrentEnemies();
        // Define a helper function to check if a position is walkable according to beliefs, used for filtering predictions
        const walkable = (from: Position, to: Position) => beliefs.map.isWalkable(from, to);

        for (const enemy of enemies) {
            const pos = enemy.lastPosition;
            if (!pos) continue;

            // If the enemy's last known position is not an integer coordinate, it means we observed it in a half-tile position (e.g., moving between two tiles).
            // In this case, we should consider both adjacent tiles as potential current positions for the enemy, since we don't know which tile it will end up in.
            const xs = Number.isInteger(pos.x) ? [pos.x] : [Math.floor(pos.x), Math.ceil(pos.x)];
            const ys = Number.isInteger(pos.y) ? [pos.y] : [Math.floor(pos.y), Math.ceil(pos.y)];

            // Enemy is currently observed on the next tile
            if (xs.includes(next.x) && ys.includes(next.y)) {
                return true;
            }

            // Confident prediction that is about to move onto the next tile
            const predicted = beliefs.agents.predictEnemyNextPosition(enemy.id, walkable);
            if (predicted && predicted.confidence >= 0.5 &&
                predicted.position.x === next.x && predicted.position.y === next.y) {
                return true;
            }
        }
        // No known agents are currently blocking the next step
        return false;
    }

    /**
     * Selects the first desire (in priority order) that has a reachable path.
     * @param beliefs - The current beliefs of the agent, used to validate paths.
     * @returns void, but updates the current intention to the selected desire and its path, or null if no valid intention is found.
     */
    private selectIntention(beliefs: Beliefs): void {
        // Helper function to check if there are any desires left to consider
        const hasCandidates = () => [...this.desires.values()].some(arr => arr.length > 0);

        // Loop through desires in priority order until we find one with a valid path
        while (hasCandidates()) {
            // Get the best desire based on the current beliefs
            const desire = getBestDesire(this.desires, beliefs);

            // Immediate desires don't need pathfinding
            if (desire.type === 'PICKUP_PARCEL' || desire.type === 'PUTDOWN_PARCEL') {
                this.currentIntention = { desire, path: [] };
                return;
            }

            // For navigation desires, set the intention and try to plan a path
            this.currentIntention = { desire, path: [] };
            this.plan(beliefs);

            // If a valid path is found, we can keep this intention
            if (this.currentIntention !== null) return; 

            // If no valid path is found, remove this desire from consideration and try the next one
            this.removeDesireFromIntention(); 

        }

        // If we exhaust all desires without finding a valid path, drop the intention
        this.currentIntention = null;
    }

    /**
     * Computes a path for the current intention via A*, treating an optional position as temporarily blocked.
     * Drops the intention if no path is found.
     * @param beliefs - The current beliefs of the agent, used to compute the path.
     * @param temporaryBlocked - An optional position to treat as temporarily blocked during pathfinding.
     * @returns void, but updates the current intention's path if a valid path is found, or drops the intention if no path is found.
     */
    private plan(beliefs: Beliefs): void {
        // If there is no current intention or the desire doesn't have a target, we cannot plan a path
        if (!this.currentIntention) return;
        if (!('target' in this.currentIntention.desire)) return;

        // Get current position from beliefs
        const me = beliefs.agents.getCurrentMe();
        if (!me?.lastPosition) return;

        // Compute a path from the current position
        const path = aStar(me.lastPosition, this.currentIntention.desire.target, (from, to) => {
            return beliefs.map.isWalkable(from, to);
        });

        // If no path is found, drop the current intention
        if (!path || path.length === 0) {
            this.currentIntention = null;
            return;
        }

        // Update the current intention's path
        this.currentIntention.path = path;
    }

    /**
     * Returns the next direction to move and advances the path.
     * @param from - The current position of the agent, used to compute the direction to the next step.
      * @returns The next direction to move ('up', 'down', 'left', 'right') or null if no intention or path is available.
     */
    getNextAction(from: { x: number; y: number }, beliefs: Beliefs): string | null {
        // If there is no current intention, we cannot return a next action
        if (!this.currentIntention) return null;

        // Handle action desires (pickup/putdown) immediately without pathfinding
        if (this.currentIntention.desire.type === 'PICKUP_PARCEL') return 'pickup';
        if (this.currentIntention.desire.type === 'PUTDOWN_PARCEL') return 'putdown';

        // If it's a navigation desire, check there is a path
        if (this.currentIntention.path.length === 0) return null;
        // Ensure the path is still valid before trying to get the next action
        if(this.isNextStepBlockedByAgent(beliefs)) {
            beliefs.map.markBlocked(this.currentIntention.path[0]);
            return null;
        }
        // Get the next step in the path
        const nextStep = this.currentIntention.path[0];    
        // Compute the direction to the next step
        const direction = posToDirection(from, nextStep);

        return direction;
    }

    /**
     * Advances the path by one step, effectively marking the next step as completed.
     * @returns void, but updates the current intention's path by removing the first step. If the path becomes empty, drops the current intention.
     */
    shiftPath(): void {
        if (this.currentIntention && this.currentIntention.path.length > 0) {
            this.currentIntention.path.shift();
        }
        else {
            this.currentIntention = null;
        }
    }

    /**
     * Invalidates the current path by marking the next step as temporarily blocked in beliefs and dropping the current intention.
      * @param beliefs The current beliefs of the agent, used to mark the next step as temporarily blocked.
      * @returns void, but updates beliefs to mark the next step as blocked and drops the current intention.
     */
    invalidatePath(beliefs: Beliefs): void {
        // Mark the next step as temporarily blocked to avoid repeated failed attempts
        if (this.currentIntention && this.currentIntention.path.length > 0) {
            beliefs.map.markBlocked(this.currentIntention.path[0]);
        }
        // Drop the current intention so that it will be reconsidered in the next deliberation cycle
        this.currentIntention = null;
    }

    /**
     * Removes the current intention's desire from the desires list, used when an intention is found to be unreachable to avoid reconsidering it in the next cycle.
      * @returns void, but updates the desires by removing the current intention's desire from the desires list.
     */
    removeDesireFromIntention(): void {
        if (!this.currentIntention) return;

        const desire = this.currentIntention.desire;
        // Remove the unreachable desire from current desires
        const desireTypeArray = this.desires.get(desire.type);
        if (!desireTypeArray) return;
        desireTypeArray.splice(desireTypeArray.indexOf(desire), 1);
        if (desireTypeArray.length === 0) this.desires.delete(desire.type);
    }
}
