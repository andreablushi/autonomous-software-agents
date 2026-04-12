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
    constructor(private ttl: number) {}

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
        this.memory_map.get(key)!.push({ value, seenAt: Date.now() });
    }

    /**
     * Get the latest known value for the given key, or undefined if no observations exist.
     * @param key 
     * @returns The most recent value for the key, or undefined if no entries exist.
     */
    current(key: string): T | undefined {
        // Get all the entries for the key
        const entries = this.memory_map.get(key);
        if (!entries?.length) return undefined;

        return entries[entries.length - 1].value;
    }

    /**
     * Check if the latest observation for the given key is stale (i.e., older than TTL).
     * @param key 
     * @returns True if the latest entry for the key is stale or if no entries exist, false otherwise.
     */
    isStale(key: string): boolean {
        const entries = this.memory_map.get(key);
        if (!entries?.length) return true;

        return Date.now() - entries[entries.length - 1].seenAt > this.ttl;
    }

    /**
     * Get all observations for the given key within the TTL window.
     * @param key 
     * @returns An array of values for the key within the TTL window.
     */
    history(key: string): Observation<T>[] {
        const now = Date.now();
        return (this.memory_map.get(key) ?? [])
            .filter(e => now - e.seenAt <= this.ttl);
    }

    /**
     * Get a bounded history of observations for the given key within the TTL window.
     * @param key identifies the memory entry to retrieve history for
     * @param lower number of most recent entries to exclude from the end
     * @param upper number of most recent entries to include from the end (negative index)
     * @returns An array of values for the key within the specified bounds.
     */
    //#TODO: If unused in the future, remove this function
    boundedHistory(key: string, lower: number | undefined, upper: number | undefined): Observation<T>[] {
        const now = Date.now();
        const start = upper !== undefined ? -upper : undefined;
        const end = lower !== undefined ? -lower : undefined;
        return (this.memory_map.get(key) ?? [])
            .filter(e => now - e.seenAt <= this.ttl)
            .slice(start, end);
    }

    /**
     * Get the latest known value for every key, including stale ones (list of seen objects).
     * @returns An array of the most recent values for all keys.
     */
    currentAll(): T[] {
        // For each key, get the most recent entry's value
        return Array.from(this.memory_map.values())
            .map(entries => entries[entries.length - 1].value);
    }

    /**
     * Evict entries that are older than the TTL, but keep at least the most recent entry for each key.
     * This method should be called periodically to prevent unbounded memory growth.
    */
    evict(): void {
        const now = Date.now();
        // Check each entry in the memory map and filter out stale observations
        for (const [key, entries] of this.memory_map.entries()) {
            const fresh = entries.filter(entry => now - entry.seenAt <= this.ttl);
            // if no entries were fresh, keep the most recent one to avoid losing all information about this key
            this.memory_map.set(key, fresh.length > 0 ? fresh : [entries[entries.length - 1]]);
        }
    }
}
