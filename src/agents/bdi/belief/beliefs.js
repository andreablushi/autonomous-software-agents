import { Agent } from "./models/agent.js";
/**
 * Beliefs class represents the agent's beliefs about itself, the environment, and other agents. 
 * It is updated based on the sensing events received from the BDI agent's perceive method. 
 */
export class Beliefs {
    constructor() {
        this.config = null; // Configuration settings
        this.map = null; // Map information
        this.me = null; // Agent's own state
        this.friends = new Map(); // Agents on the same team
        this.enemies = new Map(); // Agents on other teams
    }


    setConfig(config) {
        this.config = config;
    }

    setMap(map){
        this.map = map;
    }


    initiateMe(me_info) {
        this.me = new Agent(
            me_info.id,
            me_info.name,
            me_info.teamId,
            {x: me_info.x, y: me_info.y}
        );
    }

    /**
     * Update the agent's own status based on the provided information.
     * @param {object} me_info - Information about the agent's current status.
     */
    updateMeStatus(me_info) {
        this.me.updateStatus(me_info.score, me_info.penalty, {x: me_info.x, y: me_info.y});
    }

    /**
     * Update beliefs about other agents based on the sensing event data.
     * @param {Array} agents - List of agent information.
     */
    updateOtherAgents(agents) {
        //#TODO: Fix teamId comparison
        //#TODO: Consider also if adding other agent score and penalty
        agents.forEach(agent => {
            if (agent.teamId === this.me.teamId) {
                this.friends.set(agent.id, new Agent(agent.id, agent.name, agent.teamId, {x: agent.x, y: agent.y}));
            } else if (agent.teamId !== this.me.teamId) {
                this.enemies.set(agent.id, new Agent(agent.id, agent.name, agent.teamId, {x: agent.x, y: agent.y}));
            }
        });
    }

}