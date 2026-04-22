import type { Position } from "../../../models/position.js";
import type { Beliefs } from "../belief/beliefs.js";
import type { Intentions } from "../intention/intentions.js";

/**
 * Handles the execution loop: emits socket actions, updates beliefs, and advances
 * or invalidates the current intention path.
 */
export class Executor {
    // Flag to prevent multiple concurrent execution loops.
    private executing = false;

    constructor(
        private readonly socket: any,               // Socket is needed to emit actions and get acknowledgments for belief updates.
        private readonly beliefs: Beliefs,          // Beliefs are needed to update the agent's understanding of the world after actions.
        private readonly intentions: Intentions,    // Intentions are needed to determine which actions to execute and to advance/invalidate the current path.
        private readonly debug: boolean,            // Debug flag to enable logging of execution steps and errors.
    ) {}

    /**
     * Emit a pickup action and update parcel beliefs on success.
     * @param pos The position to pick up from, used to update beliefs on success.
     * @returns true if the pickup succeeded and beliefs were updated, false otherwise.
     */
    private async handlePickup(pos: Position): Promise<boolean> {
        const ack = await this.socket.emitPickup() as Array<{ id?: string; parcelId?: string }> | null;
        if (ack === null) return false;

        // Optimistically mark the parcel as picked up in beliefs if the pickup succeeded, even if we don't have the parcel ID yet.
        const parcel = this.beliefs.parcels.getParcelAt(pos);
        if (parcel) this.beliefs.parcels.markPickup(parcel);

        return true;
    }

    /**
     * Emit a putdown action and clean up delivered parcels on success.
     * @param meId The agent's ID, used to find which parcels to clean up from beliefs on success.
     * @returns true if the putdown succeeded and beliefs were updated, false otherwise.
     */
    private async handlePutdown(meId: string): Promise<boolean> {
        const ack = await this.socket.emitPutdown() as Array<{ id: string }>;
        if (ack.length === 0) return false;

        // Optimistically mark the parcels as delivered in beliefs if the putdown succeeded, even if we don't have the parcel IDs yet.
        this.beliefs.parcels.cleanDeliveredParcels(
            this.beliefs.parcels.getCarriedByAgent(meId)
        );

        return true;
    }

    /**
     * Emit a move action and optimistically update the agent's position on success.
     * @param direction The direction to move, used to emit the correct action and update beliefs on success.
     * @returns true if the move succeeded and beliefs were updated, false otherwise.
     */
    private async handleMove(direction: string): Promise<boolean> {
        const result = await this.socket.emitMove(direction) as Position | false;
        if (result === false) return false;

        // Optimistically update the agent's position in beliefs if the move succeeded.
        this.beliefs.agents.updateMyPosition(result);

        return true;
    }

    /**
     * Execute one step of the current intention.
     * @returns true if the intention is still active after this step.
     */
    async execute(): Promise<boolean> {
        // Get the agent's current position from beliefs. If we don't have it, we can't execute any move-based intentions, so return false to wait for beliefs to update.
        const me = this.beliefs.agents.getCurrentMe();
        if (!me?.lastPosition) return false;
        const currentPosition = me.lastPosition;

        // Get the next action to execute from intentions based on the current position and beliefs.
        const move = this.intentions.getNextAction(currentPosition, this.beliefs);

        // Log the chosen action for debugging.
        if (move === 'wait') {
            if (this.debug) console.log("[EXECUTE] Waiting for blocked tile to clear.");
            return false;
        }
        if (move === null) {
            if (this.debug) console.log("[EXECUTE] No safe move to execute.");
            return false;
        }
        if (this.debug) console.log("[EXECUTE] Action:", move);

        // Execute the action and update beliefs optimistically based on the type of action.
        let succeeded: boolean;
        if (move === 'pickup') succeeded = await this.handlePickup(currentPosition);
        else if (move === 'putdown') succeeded = await this.handlePutdown(me.id);
        else succeeded = await this.handleMove(move);

        // If the action succeeded, advance the intention path. 
        if (succeeded) this.intentions.shiftPath();
        // If the action failed, invalidate the current intention path to trigger replanning.
        else this.intentions.invalidatePath();

        // Return whether we still have an active intention after this step.
        return this.intentions.getCurrentIntention() !== null;
    }

    /**
     * Start the execution loop. No-ops if already running.
     */
    async start(): Promise<void> {
        if (this.executing) return;
        this.executing = true;
        try {
            // Continuously execute steps of the current intention until there are no more active intentions or an error occurs.
            while (this.executing) {
                const shouldContinue = await this.execute();
                // If we can't continue executing (e.g. waiting for beliefs to update), wait a short time before trying again to avoid busy looping.
                if (!shouldContinue) await new Promise(r => setTimeout(r, 200));
            }
        } catch (err) {
            if (this.debug) console.error("[EXECUTE] Execution error:", err);
        } finally {
            this.executing = false;
        }
    }
}
