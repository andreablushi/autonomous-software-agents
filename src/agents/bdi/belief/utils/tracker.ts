import { Observation } from "../../../../models/memory.js";

/**
 * A simple key-value store that tracks the latest value for each key along with the timestamp of when it was last updated.
 */
export class Tracker<T> {
    // Internal mapping from ids to their latest observed value and the timestamp of that observation.
    private store = new Map<string, Observation<T>>();

    /**
     * Update the value for a given id along with the current timestamp.
     * @param key id of the object being tracked
     * @param value the latest observed value for the object
     * @returns void
     */
    update(key: string, value: T): void {
        // Avoid memorizing intermediate positions
        const pos = (value as any)?.lastPosition;
        if (pos && (!Number.isInteger(pos.x) || !Number.isInteger(pos.y))) return;
        // Store the new value along with the current timestamp
        this.store.set(key, { value, seenAt: Date.now() });
    }

    /**
     * Update the value for a given id without changing the existing timestamp.
     * @param key id of the object being tracked
     * @param value the new value to store, preserving the existing seenAt
     * @returns void
     */
    updateValue(key: string, value: T): void {
        const existing = this.store.get(key);
        if (!existing) return;
        const pos = (value as any)?.lastPosition;
        if (pos && (!Number.isInteger(pos.x) || !Number.isInteger(pos.y))) return;
        this.store.set(key, { value, seenAt: existing.seenAt });
    }

    /**
     * Get the current value for a given id, or undefined if the key does not exist.
     * @param key id of the object being tracked
     * @returns The current value for the key, or undefined if the key does not exist.
     */
    getCurrent(key: string): T | undefined {
        return this.store.get(key)?.value;
    }

    /**
     * Get the current value for all keys
     * @returns values for all keys currently stored in the tracker.
     */
    getCurrentAll(): T[] {
        return Array.from(this.store.values()).map(o => o.value);
    }

    /**
     * Get all keys currently stored in the tracker
     * @returns An array of all ids currently stored in the tracker.
     */
    getKeys(): string[] {
        return Array.from(this.store.keys());
    }

    /**
     * Get the timestamp of when the given key was last updated, or undefined if the key does not exist.
     * @param key id of the object being tracked
     * @returns The timestamp of the last update for the key, or undefined if the key does not exist.
     */
    getLastTimestamp(key: string): number | undefined {
        return this.store.get(key)?.seenAt;
    }

    /**
     * Delete the entry for a given key from the tracker.
     * @param key id of the object to be deleted from the tracker
     */
    delete(key: string): void {
        this.store.delete(key);
    }
}
