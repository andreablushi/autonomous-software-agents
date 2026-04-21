import { aStar } from "../navigation/a_star.js";
import type { Beliefs } from "../belief/beliefs.js";
import type { DesireType, GeneratedDesires } from "../../../models/desires.js";
import type { Intention, IntentionQueue } from "../../../models/intentions.js";
import type { Position } from "../../../models/position.js";
import { generateDesires } from "../desire/desire_generator.js";
import { getIntentionQueue } from "../desire/desire_filter.js";

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
    private intentionsQueue: IntentionQueue = [];

    /**
     * Called each deliberation cycle.
     * Validates the current plan (replans if blocked or desire changed) and recomputes via A* if needed.
     * @param beliefs - The current beliefs of the agent.
     * @param desires - The current desires of the agent
     */
    update(beliefs: Beliefs, desires: GeneratedDesires): void {
        // If no desires, drop current intentions
        if (desires.size === 0) {
            this.intentionsQueue = [];
            this.currentIntention = null;
            return;
        }

        // Update desires in the intention manager
        this.intentionsQueue = getIntentionQueue(desires, beliefs);

        // Get current position from beliefs
        const me = beliefs.agents.getCurrentMe();
        if (!me?.lastPosition) return;

        // Validate current intention
        if (!this.validateCurrentIntention()) {
            // Cleans the unreachable desire
            this.filterIntention(beliefs);
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
     * Helper function to compare two desires for equality
     */
    private sameDesire(a: DesireType, b: DesireType): boolean {
        if (a.type !== b.type) return false;
        if (!('target' in a) && !('target' in b)) return true;
        if (!('target' in a) || !('target' in b)) return false;
        return a.target.x === b.target.x && a.target.y === b.target.y;
    }

    /**
     * Validates if the current intention is still valid based on the current desires and beliefs.
     * @returns true if the current intention is still valid, false otherwise.
     */
    private validateCurrentIntention(): boolean {
        // If there is no current intention, it's not valid
        if (!this.currentIntention) return false;

        // Check if the desire of the current intention is still the top desire
        const topDesire = this.intentionsQueue[0]?.desire;
        if (!topDesire) return false;
        return this.sameDesire(topDesire, this.currentIntention.desire);
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
    private isNextStepBlockedByAgent(beliefs: Beliefs): boolean {
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
    private filterIntention(beliefs: Beliefs): void {
        // Loop through desires in priority order until we find one with a valid path
        for (const { desire } of this.intentionsQueue) {

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

            // If no valid path is found, the best intention is dropped
            this.intentionsQueue = this.intentionsQueue.filter(entry => !this.sameDesire(entry.desire, desire));
            
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
     * @param beliefs - The current beliefs of the agent, used to refresh the intention queue after shifting the path.
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
     * Afterwards, refreshes the queue from the updated beliefs so execution can continue without waiting for sensing.
     * @param beliefs The current beliefs of the agent, used to refresh the intention queue after shifting the path.
     */
    shiftPath(beliefs: Beliefs): void {
        if (this.currentIntention && this.currentIntention.path.length > 0) {
            this.currentIntention.path.shift();
        }
        if (!this.currentIntention || this.currentIntention.path.length === 0) {
            this.currentIntention = null;
        }
        // Refresh the queue from the updated beliefs so we can continue executing the next step
        this.update(beliefs, generateDesires(beliefs));
    }

    /**
     * Invalidates the current path by marking the next step as temporarily blocked in beliefs and dropping the current intention.
      * @param beliefs The current beliefs of the agent, used to mark the next step as temporarily blocked.
      * Failed immediate actions are removed from the in-memory queue to avoid repeating a penalizing action until sensing refreshes beliefs.
     */
    invalidatePath(beliefs: Beliefs): void {
        const failedIntention = this.currentIntention;

        // Mark the next step as temporarily blocked to avoid repeated failed attempts
        if (failedIntention && failedIntention.path.length > 0) {
            beliefs.map.markBlocked(failedIntention.path[0]);
        }

        this.currentIntention = null;

        // Failed immediate actions are removed from the current queue so we do not retry the same penalizing action
        // until a fresh sensing cycle rebuilds desires from the environment.
        if (failedIntention?.desire.type === 'PICKUP_PARCEL' || failedIntention?.desire.type === 'PUTDOWN_PARCEL') {
            this.intentionsQueue = this.intentionsQueue.filter(
                entry => !this.sameDesire(entry.desire, failedIntention.desire),
            );
            this.filterIntention(beliefs);
            return;
        }

        this.update(beliefs, generateDesires(beliefs));
    }
}
