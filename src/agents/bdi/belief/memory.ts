import { Observation } from "../../../models/memory.js";

/**
 * Generic memory store with TTL-based soft expiry.
 */
export class Memory<T> {
    // Internal store mapping keys to arrays of timestamped entries (history).
    private store = new Map<string, Observation<T>[]>();

    /** 
     * @param ttl - Time-to-live for entries in milliseconds.
     */
    constructor(private ttl: number) {}

    /**
     * Add a new observation for the given key.
     */
    update(key: string, value: T): void {
        // Avoid memoryzing intermediate positions
        const pos = (value as any)?.lastPosition;
        if (pos && (!Number.isInteger(pos.x) || !Number.isInteger(pos.y))) return;
        if (!this.store.has(key)) this.store.set(key, []);  // Initialize history array for new keys
        this.store.get(key)!.push({ value, seenAt: Date.now() });
    }

    /**
     * Get the latest known value for the given key, or undefined if no observations exist.
     * @param key 
     * @returns The most recent value for the key, or undefined if no entries exist.
     */
    current(key: string): T | undefined {
        const entries = this.store.get(key);
            if (!entries?.length) return undefined;
        return entries[entries.length - 1].value;
    }

    /**
     * Check if the latest observation for the given key is stale (i.e., older than TTL).
     * @param key 
     * @returns True if the latest entry for the key is stale or if no entries exist, false otherwise.
     */
    isStale(key: string): boolean {
        const entries = this.store.get(key);
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
        return (this.store.get(key) ?? [])
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
        return (this.store.get(key) ?? [])
            .filter(e => now - e.seenAt <= this.ttl)
            .slice(start, end);
    }

    /**
     * Get the latest known value for every key, including stale ones (list of seen objects).
     * @returns An array of the most recent values for all keys.
     */
    currentAll(): T[] {
        return Array.from(this.store.values())
            .map(entries => entries[entries.length - 1].value);
    }

    /**
     * Evict entries that are older than the TTL, but keep at least the most recent entry for each key.
     * This method should be called periodically to prevent unbounded memory growth.
    */
    evict(): void {
        const now = Date.now();
        for (const [key, entries] of this.store) {
            const fresh = entries.filter(e => now - e.seenAt <= this.ttl);
            this.store.set(key, fresh.length > 0 ? fresh : [entries[entries.length - 1]]);
        }
    }
}
