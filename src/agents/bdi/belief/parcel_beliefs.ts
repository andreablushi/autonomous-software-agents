import type { Parcel } from "../../../models/parcel.js";
import type { IOParcel } from "../../../models/djs.js";
import { Memory } from "./utils/memory.js";
import { ParcelSettings } from "../../../models/config.js";

/**
 * Beliefs about parcels in the environment.
 */
export class ParcelBeliefs {

    parcels = new Memory<Parcel>(Infinity);         // Set infinite TTL for parcels, as we will remove them based on their reward

    parcelSettings: ParcelSettings | null = null;   // Parcel settings from config

    private lastScoreUpdate = Date.now();           // Timestamp of the last score update, used to trigger reward decay
    
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

    private decayNonSensedParcels(sensedParcelsIds: Set<string>, decayInterval: number, now: number): void {
        
        for (const parcelId of this.parcels.getKeys()) {
            
            // If the parcel is currently sensed skip
            if (sensedParcelsIds.has(parcelId)) continue;
            
            const parcel = this.parcels.current(parcelId);
            const lastSeen = this.parcels.lastSeenAt(parcelId);
            if (!parcel || lastSeen === undefined) continue;

            const decayTicks = Math.floor((now - lastSeen) / decayInterval);
            if (decayTicks <= 0) continue;

            // Update the parcel's reward based on how long it's been since it was last seen
            const updatedReward = parcel.reward - decayTicks;
            if (updatedReward <= 0) {
                this.parcels.delete(parcelId);
                continue;
            }

            this.parcels.update(parcelId, {
                ...parcel,
                reward: updatedReward,
            });
        }
    }
        
    /**
     * Update parcel beliefs with the latest observed parcels.
     * @param parcels Array of parcels from the server, converted to internal Parcels type and stored in memory.
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
        this.decayNonSensedParcels(new Set(sensedParcels.map(p => p.id)), decayInterval, now);        
    }

    /** 
     * All parcels currently available for pickup (not carried by any agent).
     * @return An array of available parcels, filtered to exclude those currently carried by agents.
     */
    getAvailableParcels(): Parcel[] {
        return this.parcels.currentAll().filter(p => p.carriedBy === null);
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