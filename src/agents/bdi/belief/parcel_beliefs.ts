import type { Parcel } from "../../../models/parcel.js";
import type { IOParcel } from "../../../models/djs.js";
import { Tracker } from "./utils/tracker.js";
import { ParcelSettings } from "../../../models/config.js";

/**
 * Beliefs about parcels in the environment.
 */
export class ParcelBeliefs {

    private parcels = new Tracker<Parcel>();                // Latest-only store; eviction is handled by the decay logic via delete()
    private parcelSettings: ParcelSettings | null = null;   // Parcel settings from config

    private lastScoreUpdate = 0;                    // Timestamp of the last score update, used to trigger reward decay
    
    /**
     * Update parcel settings belief with the latest config info.
     * @param settings 
     * @return void
     */
    setSettings(settings: ParcelSettings): void {
        this.parcelSettings = settings;
    }

    /**
     * Update parcel beliefs with the latest observed parcels.
     * @param parcels Array of parcels from the server, converted to internal Parcels type and stored in memory.
     * @param sensedParcels 
     * @returns void
     */
    private updateSensedParcels(sensedParcels: IOParcel[]): void {
        // Update memory based on sensed data
        sensedParcels.forEach(parcel => {
            this.parcels.update(parcel.id, {
                id: parcel.id,
                lastPosition: { x: parcel.x, y: parcel.y },
                carriedBy: parcel.carriedBy || null,
                reward: parcel.reward,
            });
        });
    }

    /**
     * Decay rewards for parcels not in the current sensing window.
     * Removes parcels whose reward has dropped to zero or below.
     * @param sensedParcels Array of currently sensed parcels to exclude from decay
     * @param decayInterval Time in milliseconds for each reward decay step
     * @param now Current timestamp to calculate decay
     * @returns void
     */
    private applyRewardDecay(sensedParcels: IOParcel[], decayInterval: number, now: number): void {
        // Create a set of currently sensed parcel IDs for quick lookup
        const sensedIds = new Set(sensedParcels.map(p => p.id));
        for (const parcel of this.parcels.getCurrentAll()) {
            // Skip parcels that are currently sensed
            if (sensedIds.has(parcel.id)) continue;
            // Get the last seen timestamp for the parcel to calculate decay
            const lastSeen = this.parcels.getLastTimestamp(parcel.id);
            if (lastSeen === undefined) continue;
            // Calculate how many decay intervals have passed since the parcel was last seen
            const ticks = Math.floor((now - lastSeen) / decayInterval);
            if (ticks <= 0) continue;
            // Apply decay to the parcel's reward based on the number of ticks
            const updatedReward = parcel.reward - ticks;
            if (updatedReward <= 0) { this.parcels.delete(parcel.id); continue; }
            // Update the parcel belief with the decayed reward
            this.parcels.update(parcel.id, { ...parcel, reward: updatedReward });
        }
    }
        
    /**
     * Update parcel beliefs with the latest observed parcels.
     * @param parcels Array of parcels from the server, converted to internal Parcels type and stored in memory.
     * @returns void
     */
    updateParcels(sensedParcels: IOParcel[]): void {
        this.updateSensedParcels(sensedParcels);

        // Guard clause to prevent decaying rewards too frequently (only decay once per decay interval)
        const now = Date.now();
        const decayInterval = this.parcelSettings?.reward_decay_interval || 0;
        if (now - this.lastScoreUpdate < decayInterval) return; 
        
        // Update the last score update timestamp to the current time
        this.lastScoreUpdate = now; 
        
        // Update beliefs for parcels that are not currently sensed
        this.applyRewardDecay(sensedParcels, decayInterval, now);        
    }

    /**
     * Get the current believed positions of all parcels.
     * @returns An array of all parcels with their current believed state
     */
    getCurrentParcels(): Parcel[] {
        return this.parcels.getCurrentAll();
    }

    /** 
     * All parcels currently available for pickup (not carried by any agent).
     * @return An array of available parcels, filtered to exclude those currently carried by agents.
     */
    getAvailableParcels(): Parcel[] {
        return this.parcels.getCurrentAll().filter(p => p.carriedBy === null);
    }

    /** 
     * The available parcel with the highest reward, or null if no parcels are available.
     * @return The available parcel with the highest reward, or null if no parcels are available.
     */
    getBestRewardParcel(): Parcel | null {
        const free = this.getAvailableParcels();
        if (!free.length) return null;
        return free.reduce((best, p) => p.reward > best.reward ? p : best);
    }
}