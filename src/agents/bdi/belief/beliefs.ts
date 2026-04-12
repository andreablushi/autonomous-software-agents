import type { IOConfig } from "../../../models/djs.js";
import type { GameSettings } from "../../../models/config.js";
import { AgentBeliefs } from "./agent_beliefs.js";
import { MapBeliefs } from "./map_beliefs.js";
import { ParcelBeliefs } from "./parcel_beliefs.js";

/**
 * Main belief system for the BDI agent, containing sub-systems for different aspects of the environment.
 */
export class Beliefs {
    // Belief sub-systems
    readonly agents  = new AgentBeliefs();   // Tracks me, friends, and enemies
    readonly map     = new MapBeliefs();     // Tracks map layout and crates
    readonly parcels = new ParcelBeliefs();  // Tracks parcels and their statuses

    // Centralized game settings distributed to sub-systems on arrival
    settings: GameSettings | null = null;

    // Memory management - EvictInterval prevents the agent from evicting stale beliefs too frequently,
    private lastEvict = 0;                      // Timestamp of the last eviction of stale beliefs
    private readonly evictInterval = 5_000;     // Number of milliseconds between evictions of stale beliefs

    /**
     * Set game configuration and distribute relevant slices to each sub-system.
     * @param config Raw config from the server
     */
    setSettings(config: IOConfig): void {
        this.settings = {
            title: config.GAME.title,
            description: config.GAME.description,
            max_player: config.GAME.maxPlayers,
            player_setting: {
                movement_duration: config.GAME.player.movement_duration,
                observation_distance: config.GAME.player.observation_distance,
                parcel_capacity: config.GAME.player.capacity,
            },
            parcel_setting: {
                parcel_spawn_interval: config.GAME.parcels.generation_event,
                reward_decay_interval: config.GAME.parcels.decaying_event,
                max_concurrent_parcels: config.GAME.parcels.max,
                reward_avg: config.GAME.parcels.reward_avg,
                reward_variance: config.GAME.parcels.reward_variance,
            },
        };
        // Distribute relevant config slices to sub-systems
        this.agents.playerSettings = this.settings.player_setting;
    }

    /**
     * Evict stale entries from all dynamic memories.
     * Throttled to run at most once every evictInterval ms.
     */
    evict(): void {
        const now = Date.now();
        if (now - this.lastEvict < this.evictInterval) return;
        this.lastEvict = now;
        this.agents.friends.evict();
        this.agents.enemies.evict();
        this.parcels.parcels.evict();
        this.map.crates.evict();
    }
}
