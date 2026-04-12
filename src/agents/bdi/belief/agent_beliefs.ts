import type { Agent } from "../../../models/agent.js";
import type { PlayerSettings } from "../../../models/config.js";
import type { IOAgent } from "../../../models/djs.js";
import { Memory } from "./utils/memory.js";
import { manhattan } from "./utils/utils.js";


/**
 * Beliefs about the agent itself and other observed agents.
 */
export class AgentBeliefs {

    me: Agent | null = null;                        // Current self-belief, updated directly from observations, without memory
    friends = new Memory<Agent>(5_000);             // Memory of friendly agents, keyed by ID, with TTL-based eviction
    enemies = new Memory<Agent>(5_000);             // Memory of enemy agents, keyed by ID, with TTL-based eviction
    playerSettings: PlayerSettings | null = null;   // Player settings from config

    /**
     * Initialize self-belief from the given agent info.
     * @param info 
     */
    setMe(info: IOAgent): void {
        this.me = {
            id: info.id,
            name: info.name,
            teamId: info.teamId,
            score: info.score,
            penalty: info.penalty,
            lastPosition: { x: info.x, y: info.y },
        };
    }

    /**
     * Update self-belief with the latest info.
     * @param info 
     */
    updateMeStatus(info: IOAgent): void {
        this.me = {
            ...this.me!,                            // Keep existing immutable info (id, name, teamId)
            score: info.score,
            penalty: info.penalty,
            lastPosition: { x: info.x, y: info.y },
        };
    }

    /**
     * Update beliefs about other agents based on the latest observations.
     * @param agents 
     */
    updateOtherAgents(agents: IOAgent[]): void {
        agents.forEach(agent => {                           // Create a new Agent belief from the observed IOAgent data
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
    }

    /**
     * Get the list of all currently believed friend agents
     * @returns An array of friend agents
     */
    currentFriends(): Agent[] {
        return this.friends.currentAll();
    }
    
    /**
     * Get the list of all currently believed enemy agents
     * @returns An array of enemy agents
     */
    currentEnemies(): Agent[] {
        return this.enemies.currentAll();
    }

    /**
     * All friends currently within the observation window within observation distance.
     * @returns An array of visible friendly agents, filtered by observation distance if own position and settings are known.
     */
    visibleFriends(): Agent[] {
        const myPos = this.me?.lastPosition;
        return this.friends.currentAll().filter(a => {
            if (myPos && a.lastPosition && this.playerSettings?.observation_distance !== null)
                return manhattan(myPos, a.lastPosition) <= this.playerSettings!.observation_distance;
            return true;
        });
    }

    /**
     * All enemies currently within the observation window 
     * @return An array of visible enemy agents, filtered by observation distance if own position and settings are known.
     */
    visibleEnemies(): Agent[] {
        const myPos = this.me?.lastPosition;
        return this.enemies.currentAll().filter(a => {
            if (myPos && a.lastPosition && this.playerSettings?.observation_distance !== null)
                return manhattan(myPos, a.lastPosition) <= this.playerSettings!.observation_distance;
            return true;
        });
    }
}
