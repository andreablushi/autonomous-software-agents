import type { Agent } from "../../../models/agent.js";
import type { PlayerSettings } from "../../../models/config.js";
import type { IOAgent } from "../../../models/djs.js";
import { Memory } from "./utils/memory.js";
import { Tracker } from "./utils/tracker.js";

/**
 * Beliefs about the agent itself and other observed agents.
 */
export class AgentBeliefs {

    private me: Agent | null = null;                        // Current self-belief, updated directly from observations, without memory
    private friends = new Tracker<Agent>();                 // Tracker of friendly agents, keyed by ID, with TTL-based eviction
    private enemies = new Memory<Agent>(1_000, 10);         // Memory of enemy agents, keyed by ID, with TTL-based eviction
    private playerSettings: PlayerSettings | null = null;   // Player settings from config

    // Memory management - EvictInterval prevents the agent from evicting stale beliefs too frequently,
    private lastEvict = 0;                          // Timestamp of the last eviction of stale beliefs
    private readonly EVICT_INTERVAL = 1_000;        // Number of milliseconds between evictions of stale beliefs

    /**
     * Update player settings belief with the latest config info.
     * @param settings 
     * @returns void
     */
    setSettings(settings: PlayerSettings): void {
        this.playerSettings = settings;
    }

    /**
     * Update self-belief with the latest info.
     * @param sensedMe Latest info about the agent from the server.
     */
    updateMe(sensedMe: IOAgent): void {
        this.me = {
            id: sensedMe.id,
            name: sensedMe.name,
            teamId: sensedMe.teamId,
            score: sensedMe.score,
            penalty: sensedMe.penalty,
            lastPosition: { x: sensedMe.x, y: sensedMe.y },
        };
    }

    /**
     * Update beliefs about other agents based on the latest observations.
     * @param sensedAgents List of all observed agents from the latest observation, used to update beliefs about friends and enemies.
     */
    updateOtherAgents(sensedAgents: IOAgent[]): void {
        sensedAgents.forEach(agent => {                           // Create a new Agent belief from the observed IOAgent data
            const data: Agent = {
                id: agent.id,
                name: agent.name,
                teamId: agent.teamId,
                score: agent.score,
                penalty: agent.penalty,
                lastPosition: { x: agent.x, y: agent.y },
            };
            if (agent.teamId === this.me?.teamId) {         // Update friend beliefs
                this.friends.update(agent.id, data);
            } else {                                        // Update enemy beliefs   
                this.enemies.update(agent.id, data);
            }
        });
        this.evict()
    }

    /**
     * Get the current believed state of the agent itself.
     * @returns The current self-belief, or null if not yet observed.
     */
    getCurrentMe(): Agent | null {
        return this.me;
    }

    /**
     * Get the list of all currently believed friend agents
     * @returns An array of friend agents
     */
    getCurrentFriends(): Agent[] {
        return this.friends.getCurrentAll();
    }
    
    /**
     * Get the list of all currently believed enemy agents
     * @returns An array of enemy agents
     */
    getCurrentEnemies(): Agent[] {
        return this.enemies.getCurrentAll();
    }

    /**
     * Evict stale beliefs that haven't been updated recently to prevent memory bloat.
     */
    private evict(): void {
        const now = Date.now();
        if (now - this.lastEvict < this.EVICT_INTERVAL) return;
        this.lastEvict = now;
        this.enemies.evict();
    }
}
