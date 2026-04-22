import { aStar } from "../navigation/a_star.js";
import type { Beliefs } from "../belief/beliefs.js";
import type { GeneratedDesires } from "../../../models/desires.js";
import type { Intention, IntentionQueue } from "../../../models/intentions.js";
import type { Position } from "../../../models/position.js";
import { generateDesires } from "../desire/desire_generator.js";
import { sameDesire } from "./utils/helpers.js";
import { getIntentionQueue } from "../desire/desire_sorter.js";
import { posToDirection } from "../../../utils/metrics.js";
import { CollisionTimer } from "./utils/collision_timer.js";

// Intention management constants
export const DETOUR_THRESHOLD_STEPS = 5;                // Maximum number of steps for a detour to be considered preferable over waiting
export const BLOCKED_AFTER_EXPIRATION_TTL_MS = 2_000;   // TTL for marking a tile as blocked after waiting for it to clear, or after a failed detour attempt
export const INVALIDATION_BLOCKED_TTL_MS = 1_000;       // TTL for marking a tile as blocked after repeated failed invalidation attempts
export const WAIT_MIN_MS = 1_000;                       // Minimum wait time before marking a tile as blocked
export const WAIT_MAX_MS = 1_500;                       // Maximum wait time before marking a tile as blocked
export const INVALIDATION_RETRY_LIMIT = 2;              // Number of times to retry invalidating a tile before marking it as blocked in beliefs to avoid getting stuck

/**
 * Manages the agent's current intention: validates the plan on each sensing cycle,
 * replans via A* when needed, and exposes the next direction to execute.
 */
export class Intentions {
    // Intention state
    private currentIntention: Intention | null = null;
    private intentionsQueue: IntentionQueue = [];
    private beliefs!: Beliefs; //#TODO: Could create errors maybe

    // Collision management state
    private collisionTimer = new CollisionTimer();
    private invalidationCounter = 0;

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
        this.beliefs = beliefs;
        this.intentionsQueue = getIntentionQueue(desires, beliefs);

        // Validate current intention
        if (!this.validateCurrentIntention()) {
            // Takes the first desire with a valid path as the new intention, or null if there is no valid intention
            this.filterIntention();
            return;
        }

        // Validate current path if there is an active intention
        if (!this.validatePath()) {
            // Replan the path
            if(!this.plan()) {
                // If replanning fails
                this.dropCurrentIntention();
            }
        }
    }

    /**
     * Returns the current intention's desire and path, or null if no intention is currently active.
     * @returns The current intention, or null if no intention is currently active.
     */
    getCurrentIntention(): Intention | null {
        return this.currentIntention;
    }

    /**
     * Remove the current intention from the queue
     * @returns void, but updates the current intention to null and removes it from the queue so it is not selected again until a new plan is generated.
     */
    private dropCurrentIntention(): void {
        if (!this.currentIntention) return;
        this.intentionsQueue = this.intentionsQueue.filter(entry => !sameDesire(entry.desire, this.currentIntention!.desire));
        this.currentIntention = null;
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
        return sameDesire(topDesire, this.currentIntention.desire);
    }

    /**
     * Selects the first desire (in priority order) that has a reachable path.
     * @returns void, but updates the current intention to the selected desire and its path, or null if no valid intention is found.
     */
    private filterIntention(): void {
        // Loop through desires in priority order until we find one with a valid path
        for (const { desire } of this.intentionsQueue) {

            // Immediate desires don't need pathfinding
            if (desire.type === 'PICKUP_PARCEL' || desire.type === 'PUTDOWN_PARCEL') {
                this.currentIntention = { desire, path: [] };
                return;
            }

            // For navigation desires, set the intention and try to plan a path
            this.currentIntention = { desire, path: [] };

            // If the desire has a target, we need to validate that it's reachable via a path
            if(this.plan() === true) {
                return;
            }
        }

        // If we exhaust all desires without finding a valid path, we set the current intention to null to indicate we have no valid intention at the moment
        this.currentIntention = null;
    }

    /**
     * Validates if the current path is still valid (not blocked) based on the current beliefs.
     * Checks every consecutive step in the path, not just the first.
     * @returns true if the current path is still valid, false otherwise.
     */
    private validatePath(): boolean {
        // If there is no current intention or path, it's not valid
        if (!this.currentIntention) return false;
        // If the desire doesn't have a target, we consider it valid (e.g. pickup/putdown)
        if (!('target' in this.currentIntention.desire)) return true;
        // If the path is empty, we consider it invalid as we have a target but no path to it
        if (this.currentIntention.path.length === 0) return false;

        // Retrieve the current position from beliefs
        const me = this.beliefs.agents.getCurrentMe();
        if (!me?.lastPosition) return false;

        // Check if the path is still walkable according to beliefs
        let currentPos = me.lastPosition;
        for (const nextPos of this.currentIntention.path) {
            if (!this.beliefs.map.isWalkable(currentPos, nextPos)) {
                return false;
            }
            currentPos = nextPos;
        }

        // The current path is still valid
        return true;
    }

    /**
     * Computes a path for the current intention via A*, treating an optional position as temporarily blocked.
     * Drops the intention if no path is found.
     * @returns true if a valid path was found and set for the current intention, false if no path could be found.
     */
    private plan(): boolean {
        // If there is no current intention or the desire doesn't have a target, we cannot plan a path
        if (!this.currentIntention) return false;
        if (!('target' in this.currentIntention.desire)) return false;

        // Get current position from beliefs
        const me = this.beliefs.agents.getCurrentMe();
        if (!me?.lastPosition) return false;

        // Compute a path from the current position
        const path = aStar(me.lastPosition, this.currentIntention.desire.target, (from, to) => {
            return this.beliefs.map.isWalkable(from, to);
        });

        // If no path is found
        if (!path || path.length === 0) {
            return false;
        }

        // Update the current intention's path
        this.currentIntention.path = path;
        return true;
    }

    /**
     * Marks a tile as blocked in beliefs, resets collision state, and immediately replans.
     * Used as the single commit point for all blocking escalation paths to keep them consistent.
     * @param tile The position of the tile to mark as blocked.
     * @param ttl How long the tile should be considered blocked, in milliseconds.
     */
    private commitBlocked(tile: Position, ttl: number): void {
        this.beliefs.map.markBlocked(tile, ttl);
        this.collisionTimer.reset();
        this.invalidationCounter = 0;
        // After marking the tile as blocked, we should drop the current intention and replan
        this.update(this.beliefs, generateDesires(this.beliefs));
    }

    /**
     * Applies deferred blocking to a tile: starts a random counter on first call for that tile,
     * counts repeated detections, and commits the block once either the counter or timer threshold is exceeded.
     * @param tile The position of the tile to potentially mark as blocked.
     */
    private tryMarkBlocked(tile: Position): void {
        // If we're not already waiting for this tile, start the collision timer
        if (!this.collisionTimer.isWaitingFor(tile)) {
            this.collisionTimer.start(tile, WAIT_MIN_MS, WAIT_MAX_MS);
        } else {
            // Count each repeated pre-detection for the same tile so the limiter
            // works regardless of whether blocks are caught before or after a move attempt.
            this.invalidationCounter++;
        }

        // If the counter exceeds the retry limit, skip the remaining timer and force-mark
        // the tile immediately — same escalation used in invalidatePath for move failures.
        if (this.invalidationCounter > INVALIDATION_RETRY_LIMIT) {
            this.commitBlocked(tile, INVALIDATION_BLOCKED_TTL_MS);
            return;
        }

        // If the timer hasn't expired yet, we wait before marking the tile as blocked
        if (!this.collisionTimer.hasExpired()) {
            return;
        }

        // Once the timer has expired, we consider the tile blocked and mark it in beliefs, then reset the waiting state
        this.commitBlocked(tile, BLOCKED_AFTER_EXPIRATION_TTL_MS);
    }

    /**
     * Attempts to reroute around a blocked tile. If a detour within DETOUR_THRESHOLD_STEPS
     * extra steps is found, commits the block and replans the path.
     * @param blockedTile The position of the tile that is currently blocked and we want to bypass.
     * @return true if a detour was applied, false if no acceptable detour exists.
     */
    private tryDetour(blockedTile: Position): boolean {
        // If there is no current intention or the desire doesn't have a target, we cannot compute a detour path
        if (!this.currentIntention) return false;
        if (!('target' in this.currentIntention.desire)) return false;

        // Get current position from beliefs
        const me = this.beliefs.agents.getCurrentMe();
        if (!me?.lastPosition) return false;

        // Compute a path from the current position to the target, treating the blocked tile as unwalkable
        const path = aStar(me.lastPosition, this.currentIntention.desire.target, (from, to) => {
            if (to.x === blockedTile.x && to.y === blockedTile.y) return false;
            return this.beliefs.map.isWalkable(from, to);
        });

        // If no path is found, return null
        if(!path || path.length === 0) {
            return false;
        }

        // If a path is found, we compare its length to the original path length to decide whether to detour or wait
        if (path.length > this.currentIntention.path.length + DETOUR_THRESHOLD_STEPS) {
            return false;
        }

        // The detour path is within the acceptable threshold, so we choose to detour
        this.commitBlocked(blockedTile, BLOCKED_AFTER_EXPIRATION_TTL_MS);
        return true;
    }

    /**
     * Returns the next direction to move and advances the path.
     * @param from - The current position of the agent, used to compute the direction to the next step.
     * @param beliefs - The current beliefs of the agent, used to refresh the intention queue after shifting the path.
     * @returns The next direction to move ('up', 'down', 'left', 'right'), 'wait' if execution should pause, or null if no intention or path is available.
     */
    getNextAction(from: { x: number; y: number }, beliefs: Beliefs): string | null {
        // If there is no current intention, we cannot return a next action
        if (!this.currentIntention) return null;

        // Handle action desires (pickup/putdown) immediately without pathfinding
        if (this.currentIntention.desire.type === 'PICKUP_PARCEL') return 'pickup';
        if (this.currentIntention.desire.type === 'PUTDOWN_PARCEL') return 'putdown';

        // If it's a navigation desire, check there is a path
        if (this.currentIntention.path.length === 0) return null;
        const nextStep = this.currentIntention.path[0];
        // Ensure the path is still valid before trying to get the next action
        const walkable = (curr: Position, next: Position) => beliefs.map.isWalkable(curr, next);
        if (beliefs.agents.isNextBlockedByAgents(nextStep, walkable)) {
            const blockedTile = nextStep;
            if (this.tryDetour(blockedTile)) {
                // commitBlocked replanned the path, so path[0] is now the first step of the detour
                return posToDirection(from, this.currentIntention.path[0]);
            }
            this.tryMarkBlocked(blockedTile);
            return 'wait';
        }
        // Compute the direction to the next step
        const direction = posToDirection(from, nextStep);

        return direction;
    }

    /**
     * Advances the path by one step, effectively marking the next step as completed.
     * Afterwards, refreshes the queue from the updated beliefs so execution can continue without waiting for sensing.
     * @param beliefs The current beliefs of the agent, used to refresh the intention queue after shifting the path.
     */
    shiftPath(): void {
        this.collisionTimer.reset();
        this.invalidationCounter = 0;
        if (this.currentIntention && this.currentIntention.path.length > 0) {
            this.currentIntention.path.shift();
        }
        if (!this.currentIntention || this.currentIntention.path.length === 0) {
            this.currentIntention = null;
        }
        // Refresh the queue from the updated beliefs so we can continue executing the next step
        this.update(this.beliefs, generateDesires(this.beliefs));
    }

    /**
     * Invalidates the current path by marking the next step as temporarily blocked in beliefs and dropping the current intention.
     * @param beliefs The current beliefs of the agent, used to mark the next step as temporarily blocked.
     * Failed immediate actions are removed from the in-memory queue to avoid repeating a penalizing action until sensing refreshes beliefs.
     */
    invalidatePath(): void {
        const failedIntention = this.currentIntention;

        // If the failed intention has a path, we consider the first step in the path as the blocked tile that caused the failure
        if (failedIntention && failedIntention.path.length > 0) {
            const blockedTile = failedIntention.path[0];
            this.invalidationCounter++;
            // If we've already tried to invalidate this tile multiple times, we mark it as blocked in beliefs to avoid getting stuck
            if (this.invalidationCounter > INVALIDATION_RETRY_LIMIT) {
                // Mark the tile as blocked with a short TTL to prevent immediate re-selection, then replan
                this.commitBlocked(blockedTile, INVALIDATION_BLOCKED_TTL_MS);
            } else {
                this.tryMarkBlocked(blockedTile);
            }
            return;
        }

        // Otherwise, if the failed intention doesn't have a path (e.g. it's an immediate action like pickup/putdown), we simply drop it from the queue to avoid repeating it until sensing refreshes beliefs
        this.currentIntention = null;
    }
}
