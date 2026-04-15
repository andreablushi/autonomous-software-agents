import { IOConfig, IOTile, IOAgent, IOSensing } from "../../models/djs.js";
import { Beliefs } from "./belief/beliefs.js";
import { getDesires } from "./desire/desires.js";
import { Intentions } from "./intention/intentions.js";

/**
 * BDI Agent Implementation
 *
 * This class represents a Belief-Desire-Intention (BDI) agent that connects to a Deliveroo.js server using Socket.IO.
 */
export class BDIAgent {
    private socket: any;
    private debug: boolean;
    private beliefs: Beliefs;
    private intentions: Intentions;

    /**
     * @param socket - The socket connection to the Deliveroo.js server.
     * @param debug - Set to true to enable debug logging (dev mode).
     */
    constructor(socket: any, debug = false) {
        this.socket = socket;
        this.debug = debug;
        this.beliefs = new Beliefs();
        this.intentions = new Intentions();

        // Initialize the agent info in the beliefs once the connection is established
        this.socket.once('you', (info : IOAgent) => {
            this.beliefs.agents.updateMe(info);
        });

        // Set game configuration in beliefs once received
        this.socket.on('config', (config : IOConfig) => {
            this.beliefs.setSettings(config);
        });

        // Running it makes it move every time it receives a sensing event, it works like a while loop
        this.perceive();
    }

    /**
     * Perceive method listens for various events from the server to update the agent's beliefs about itself, the map, and its surroundings.
     */
    perceive() {
        // Listen for updates about the agent's own status (score, penalty, position)
        this.socket.on('you', (me : IOAgent) => {
            this.beliefs.agents.updateMe(me);
            if (this.debug) console.log("[PERCEIVE] Me status updated — pos: [", me.x, ", ", me.y, "]| score:", me.score, "]");
        });

        // Set map information in beliefs once received. These are only sent once!
        this.socket.once('map', (width: number, height: number, tiles: IOTile[]) => {
            this.beliefs.map.updateMap(width, height, tiles);
            if (this.debug) console.log("[PERCEIVE] Map info received — width:", width, "| height:", height, "| tiles:", tiles.length);
        });

        // Listen for sensing events
        this.socket.on('sensing', (sensing : IOSensing) => {
            // Update beliefs about other agents based on the sensing event data
            this.beliefs.agents.updateOtherAgents(sensing.agents, sensing.positions);

            // Update beliefs about parcels based on the sensing event data
            this.beliefs.parcels.updateParcels(sensing.parcels, sensing.positions);

            // Update beliefs about crates based on the sensing event data
            this.beliefs.map.updateCrates(sensing.crates, sensing.positions);
            
            if (this.debug) console.log(
                "[PERCEIVE] Sensing update — agents:", sensing.agents.length,
                "| parcels:", sensing.parcels.length,
                "| crates:", sensing.crates.length
            );

            if (this.debug) {
                console.log("[PERCEIVE] Current beliefs state:");
                console.log("  - Friends:", this.beliefs.agents.getCurrentFriends().length, "agents");
                console.log("  - Enemies:", this.beliefs.agents.getCurrentEnemies().length, "agents");
                console.log("  - Parcels:", this.beliefs.parcels.getCurrentParcels().length, "parcels");
                console.log("  - Crates:", this.beliefs.map.getCurrentCrates().length, "crates");
            }
            this.deliberate();
        });
    }

    /**
     * Deliberate method processes the current beliefs to form desires and intentions.
     * On each sensing cycle: validate the current plan, replan if needed, then execute one step.
     */
    deliberate() {
        const desires = getDesires(this.beliefs);
        if (this.debug) console.log("[DELIBERATE] Desires:", desires);

        this.intentions.update(this.beliefs, desires);

        this.execute();
    }

    /**
     * Execute one step of the current intention by emitting a move to the socket.
     */
    async execute() {
        const me = this.beliefs.agents.getCurrentMe();
        if (!me?.lastPosition) return;

        const nextStep = this.intentions.getNextStep(me.lastPosition);
        if (nextStep === 'pickup') {
            await this.socket.emit('pickup', []);
            if (this.debug) console.log("[EXECUTE] Picking up parcel.");
        } else if (nextStep !== null) {
            await this.socket.emit('move', nextStep);
            if (this.debug) console.log("[EXECUTE] Moving to next step:", nextStep);
        } else {
            if (this.debug) console.log("[EXECUTE] No valid next step to execute.");
        }
    }
}
