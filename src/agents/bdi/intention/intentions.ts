import { aStar } from "../navigation/a_star.js";
import type { Beliefs } from "../belief/beliefs.js";
import type { DesireType } from "../../../models/desires.js";
import type { Intention } from "../../../models/intentions.js";

function posToDirection(from: { x: number; y: number }, to: { x: number; y: number }): string {
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
    private desires: DesireType[] = [];

    /**
     * Called each deliberation cycle.
     * Validates the current plan (replans if blocked or desire changed) and recomputes via A* if needed.
     * @param beliefs - The current beliefs of the agent.
     * @param desires - The current desires of the agent
     */
    update(beliefs: Beliefs, desires: DesireType[]): void {
        // If no desires, drop current intention
        if (desires.length === 0) {
            this.currentIntention = null;
            return;
        }
        // Update desires in the intention manager
        this.desires = desires;

        // Get current position from beliefs
        const me = beliefs.agents.getCurrentMe();
        if (!me?.lastPosition) return;

        // Validate current intention and plan
        if (!this.validateCurrentIntention() || !this.validatePath(beliefs)) {
            this.currentIntention = null;
        }

        // Replan if no valid intention
        if (!this.currentIntention || this.currentIntention.path.length === 0) {
            this.currentIntention = { desire: this.selectBestDesire(this.desires), path: [] };
            this.plan(beliefs);
        }
    }

    /**
     * Validates if the current intention is still valid based on the current desires and beliefs.
     * @returns true if the current intention is still valid, false otherwise.
     */
    private validateCurrentIntention(): boolean {
        // If there is no current intention, it's not valid
        if (!this.currentIntention) return false;

        // Check if the desire of the current intention is still the top desire
        const topDesire = this.selectBestDesire(this.desires);
        const d = this.currentIntention.desire;
        if (
            d.type !== topDesire.type ||
            d.target.x !== topDesire.target.x ||
            d.target.y !== topDesire.target.y
        ) return false;

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
     * Selects the best desire from the list of desires. 
     * @param desires - The current desires of the agent.
     * @returns 
     */
    private selectBestDesire(desires: DesireType[]): DesireType {
        // For simplicity, we take the first desire of the array
        //#TODO: implement a better selection mechanism based on the type of desire and distance
        return desires[0];
    }

    /**
     * Returns the next direction to move and advances the path.
     * @param from - The current position of the agent, used to compute the direction to the next step.
      * @returns The next direction to move ('up', 'down', 'left', 'right') or null if no intention or path is available.
     */
    getNextStep(from: { x: number; y: number }): string | null {
        // If there is no current intention or the path is empty, we cannot move
        if (!this.currentIntention || this.currentIntention.path.length === 0) return null;

        // Get the next step from the path
        const next = this.currentIntention.path.shift()!;
        const direction = posToDirection(from, next);

        // If the path is now empty after shifting, we can drop the intention
        if (this.currentIntention.path.length === 0) {
            this.currentIntention = null;
        }
        return direction;
    }
}
