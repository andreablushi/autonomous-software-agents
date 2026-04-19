import { aStar } from "../navigation/a_star.js";
import type { Beliefs } from "../belief/beliefs.js";
import type {  GeneratedDesires } from "../../../models/desires.js";
import type { Intention } from "../../../models/intentions.js";
import type { DirectionPrediction, Position } from "../../../models/position.js";
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
 * Applies a direction to a position, returning the new position.
 * @param pos - The original position
 * @param direction - The direction to apply ('up', 'down', 'left', 'right')
 * @returns The new position after applying the direction, or null if the direction is invalid.
 */
function applyDirection(pos: Position, direction: string): Position | null {
    switch (direction) {
        case 'up': return { x: pos.x, y: pos.y + 1 };
        case 'down': return { x: pos.x, y: pos.y - 1 };
        case 'left': return { x: pos.x - 1, y: pos.y };
        case 'right': return { x: pos.x + 1, y: pos.y };
        default: return null;
    }
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
            return;
        }

        // Validate current path
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
    private isNextStepBlockedByAgent(beliefs: Beliefs): Boolean {
        // If there is no current intention or path, we cannot check for blocking
        if (!this.currentIntention || this.currentIntention.path.length === 0) return false;

        // Get the next step in the path
        const next = this.currentIntention.path[0];
        // Get the list of currently believed enemy agents from beliefs
        const enemies = beliefs.agents.getCurrentEnemies();

        for (const enemy of enemies) {
            const pos = enemy.lastPosition;
            if (!pos) continue;

            // Enemy already on the next step
            if (pos.x === next.x && pos.y === next.y) return true;

            // Enemy adjacent to the next step that is going to move onto it in the next turn with high confidence
            const direction = beliefs.agents.predictEnemyDirection(enemy.id);
            if (direction && direction.confidence >= 0.5) {
                const predictedPos = applyDirection(pos, direction.direction);
                if (predictedPos && predictedPos.x === next.x && predictedPos.y === next.y) {
                    return true;
                }
            }
        }

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

            // Remove the unreachable desire from current desires
            const desireTypeArray = this.desires.get(desire.type);
            if (!desireTypeArray) continue;
            desireTypeArray.splice(desireTypeArray.indexOf(desire), 1);
            if (desireTypeArray.length === 0) this.desires.delete(desire.type);

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

        const temporaryBlocked : Position[] = [];
        // If the next step is blocked by an agent, 
        // we can try to replan by considering path without enemies with confidence above 0.9
        const enemies = beliefs.agents.getCurrentEnemies();
        for (const enemy of enemies) {
            const confidence = beliefs.agents.getEnemyConfidence(enemy.id);
            if (confidence && confidence > 0.7 && enemy.lastPosition) {
                temporaryBlocked.push(enemy.lastPosition);
            }
        }

        // Compute a path from the current position
        const path = aStar(me.lastPosition, this.currentIntention.desire.target, (from, to) => {
            if (temporaryBlocked.some(b => b.x === to.x && b.y === to.y)) return false;
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
