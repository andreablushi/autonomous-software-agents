/**
 * Configuration types for the delivery autonomous agents system.
 * This file defines the structure of the configuration settings used in the system.
 */

export type Config = {
    clock: number;              // Time in seconds for each game tick
    penalty: number;            // Penalty for violating game rules
    agent_timeout: number;      // Timeout for agent actions
    broadcast_log: boolean;     // Whether to broadcast log messages
};

export type GameSettings = {
    title: string;                         // Title of the game
    description: string;                   // Description of the game
    max_player: number;                    // Maximum number of players
    player_setting: PlayerSettings;        // Settings for player behavior
    parcel_setting: ParcelSettings;        // Settings for parcel behavior
}

export type ParcelSettings = {
    parcel_spawn_interval: number;         // Interval before new parcels spawn
    reward_decay_interval: number;         // Interval before parcel rewards decay
    max_concurrent_parcels: number;        // Maximum number of concurrent parcels
    reward_avg: number;                    // Average reward for parcels
    reward_variance: number;               // Variance in parcel rewards
}

export type PlayerSettings = {
    movement_duration: number;             // Duration of player movement actions
    observation_distance: number;          // Distance within which players can observe parcels (Manhattan)
    parcel_capacity: number;               // Maximum number of parcels a player can carry
}