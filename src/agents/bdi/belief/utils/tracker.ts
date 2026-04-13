import { Observation } from "../../../../models/memory.js";

/**
 * A simple key-value store that tracks the latest value for each key along with the timestamp of when it was last updated.
 */
export class Tracker<T> {
    // Internal mapping from keys to their latest value and the timestamp of the last update.
    private store = new Map<string, Observation<T>>();

    /**
     * Update the value for a given key along with the current timestamp.
     * @param key
     * @param value
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
     * Get the current value for a given key, or undefined if the key does not exist.
     * @param key 
     * @returns The current value for the key, or undefined if the key does not exist.
     */
    getCurrent(key: string): T | undefined {
        return this.store.get(key)?.value;
    }

    /**
     * Get the current value for all keys
     * @returns values for all keys
     */
    getCurrentAll(): T[] {
        return Array.from(this.store.values()).map(o => o.value);
    }

    /**
     * Get all keys currently stored in the tracker
     * @returns An array of all keys
     */
    getKeys(): string[] {
        return Array.from(this.store.keys());
    }

    /**
     * Get the timestamp of when the given key was last updated, or undefined if the key does not exist.
     * @param key 
     * @returns The timestamp of the last update for the key, or undefined if the key does not exist.
     */
    getLastTimestamp(key: string): number | undefined {
        return this.store.get(key)?.seenAt;
    }

    /**
     * Delete the entry for a given key from the tracker.
     * @param key 
     */
    delete(key: string): void {
        this.store.delete(key);
    }
}
