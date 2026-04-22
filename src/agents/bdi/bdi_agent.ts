import { IOConfig, IOTile, IOAgent, IOSensing } from "../../models/djs.js";
import { Beliefs } from "./belief/beliefs.js";
import { generateDesires } from "./desire/desire_generator.js";
import { Intentions } from "./intention/intentions.js";
import { Executor } from "./execution/executor.js";

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
    private executor: Executor;

    /**
     * @param socket - The socket connection to the Deliveroo.js server.
     * @param debug - Set to true to enable debug logging (dev mode).
     */
    constructor(socket: any, debug = false) {
        this.socket = socket;
        this.debug = debug;
        this.beliefs = new Beliefs();
        this.intentions = new Intentions();
        this.executor = new Executor(socket, this.beliefs, this.intentions, debug);

        // Initialize the agent info in the beliefs once the connection is established
        this.socket.once('you', (info : IOAgent) => {
            this.beliefs.agents.updateMe(info);
        });

        // Set game configuration in beliefs once received
        this.socket.on('config', (config : IOConfig) => {
            this.beliefs.setSettings(config);

            // If config change causes observation distance change, we need to recompute cluster weights for the map beliefs
            const obsDist = this.beliefs.agents.getObservationDistance();                                                                                                                                                         
            if (obsDist !== null) this.beliefs.map.computeClusterWeights(obsDist);                                                                                                                                                
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
            //NOTE: currently the server for an NxM map sends width=N-1 and height=M-1, so we add 1 to both to get the correct dimensions.
            // This is a temporary workaround until the server is fixed to send the correct dimensions.
            this.beliefs.map.updateMap(width +1, height +1, tiles);

            // Compute cluster weights for spawn tiles now that we have the map and observation distance (if already received in config)
            const obsDist = this.beliefs.agents.getObservationDistance();
            if (obsDist !== null) this.beliefs.map.computeClusterWeights(obsDist);
            
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

            // Record sensing times for all spawn tiles currently in sensor range
            this.beliefs.map.updateSpawnTilesSensingTimes(sensing.positions, Date.now());
            
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
        // Generate desires based on the current beliefs
        const desires = generateDesires(this.beliefs);
        if (this.debug) console.log("[DELIBERATE] Desires:", desires);

        // Update intentions based on the new desires and current beliefs
        this.intentions.update(this.beliefs, desires);
        if (this.debug) console.log("[DELIBERATE] Current intention:", this.intentions.getCurrentIntention());  
        
        // Start executing the current intention if not already doing so
        this.executor.start();
    }
}
