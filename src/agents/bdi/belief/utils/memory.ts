import { Observation } from "../../../../models/memory.js";

/**
 * Generic memory store with TTL-based soft expiry.
 * Allows the agent to maintain a history of observations for each key, 
 * while automatically evicting stale entries based on a specified time-to-live (TTL).
 */
export class Memory<T> {
    // Internal mapping from keys to arrays of timestamped entries (history).
    private memory_map = new Map<string, Observation<T>[]>();

    /** 
     * @param ttl - Time-to-live for entries in milliseconds.
     */
    constructor(private ttl: number, private historySize: number) {}

    /**
     * Add a new observation for the given key, along with the current timestamp.
     * @param key 
     * @param value 
     * @returns void
     */
    update(key: string, value: T): void {
        // Avoid memoryzing intermediate positions
        const pos = (value as any)?.lastPosition;
        if (pos && (!Number.isInteger(pos.x) || !Number.isInteger(pos.y))) return;

        // Initialize history array for new keys
        if (!this.memory_map.has(key)){ 
            this.memory_map.set(key, []);  
        }
        
        // Append the new observation with the current timestamp
        const entries = this.memory_map.get(key)!;
        entries.push({ value, seenAt: Date.now() });

        // Keep only the latest observations to bound per-key history size.
        if (entries.length > this.historySize) {
            entries.splice(0, entries.length - this.historySize);
        }
    }

    /**
     * Get the latest known value for the given key, or undefined if no observations exist.
     * @param key 
     * @returns The most recent value for the key, or undefined if no entries exist.
     */
    getCurrent(key: string): T | undefined {
        // Get all the entries for the key
        const entries = this.memory_map.get(key);
        if (!entries?.length) return undefined;

        return entries[entries.length - 1].value;
    }

    /**
     * Get the latest known value for every key, including stale ones (list of seen objects).
     * @returns An array of the most recent values for all keys.
     */
    getCurrentAll(): T[] {
        // For each key, get the most recent entry's value
        return Array.from(this.memory_map.values())
            .map(entries => entries[entries.length - 1].value);
    }

    /**
     * Get all observations for the given key within the TTL window.
     * @param key 
     * @returns An array of values for the key within the TTL window.
     */
    getHistory(key: string): Observation<T>[] {
        const now = Date.now();
        return (this.memory_map.get(key) ?? [])
            .filter(e => now - e.seenAt <= this.ttl);
    }

    /**
     * Get all keys currently stored in memory.
     * @returns An array of all keys in the memory map.
     */
    getKeys(): string[] {
        return Array.from(this.memory_map.keys());
    }

    /**
     * Get the timestamp of when the given key was last updated, or undefined if the key does not exist.
     * @param key 
     * @returns The timestamp of the last update for the key, or undefined if the key does not exist.
     */
    getLastSeenAt(key: string): number | undefined {
        const entries = this.memory_map.get(key);
        if (!entries?.length) return undefined;
        return entries[entries.length - 1].seenAt;
    }

    /**
     * Remove all observations for a key from memory.
     * @param key
     * @returns void
     */
    delete(key: string): void {
        this.memory_map.delete(key);
    }

    /**
     * Evict entries that are older than the TTL.
     * If all entries for a key are stale, remove the key entirely.
     * This method should be called periodically to prevent unbounded memory growth.
     * @returns void
    */
    evict(): void {
        const now = Date.now();
        // Check each entry in the memory map and filter out stale observations
        for (const [key, entries] of this.memory_map.entries()) {
            const fresh = entries.filter(entry => now - entry.seenAt <= this.ttl);
            if (fresh.length > 0) {
                this.memory_map.set(key, fresh);
            } else {
                this.memory_map.delete(key);
            }
        }
    }
}
