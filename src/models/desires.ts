import type { Position } from "./position.js";

/**
 * Desire types for BDI agent. 
 * Defines the structure of different desires that the agent can have based on its beliefs about the environment.
 * Each desire type corresponds to a specific goal or action the agent may want to pursue.
 */
export type ExploreDesire = {
    type: "EXPLORE";        // The agent wants to explore the map
    target: Position;       // A spawn tile to walk toward as a fallback goal
};

// Union type for all possible desires that the agent can have based on its beliefs
export type DesireType = ExploreDesire;