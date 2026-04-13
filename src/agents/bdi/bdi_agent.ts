import { IOConfig, IOTile, IOAgent, IOSensing } from "../../models/djs.js";
import { Beliefs } from "./belief/beliefs.js";

/**
 * BDI Agent Implementation
 *
 * This class represents a Belief-Desire-Intention (BDI) agent that connects to a Deliveroo.js server using Socket.IO.
 */
export class BDIAgent {
    private socket: any;
    private debug: boolean;
    private beliefs: Beliefs;
    private desires: string[];
    private intentions: string[];

    /**
     * @param socket - The socket connection to the Deliveroo.js server.
     * @param debug - Set to true to enable debug logging (dev mode).
     */
    constructor(socket: any, debug = false) {
        this.socket = socket;
        this.debug = debug;
        this.beliefs = new Beliefs();
        this.desires = [];
        this.intentions = [];

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

        // Set map information in beliefs once received
        this.socket.on('map', (width: number, height: number, tiles: IOTile[]) => {
            this.beliefs.map.updateMap(width, height, tiles);
        });

        // Listen for sensing events
        this.socket.on('sensing', (sensing : IOSensing) => {
            // Update beliefs about other agents based on the sensing event data
            this.beliefs.agents.updateOtherAgents(sensing.agents);

            // Update beliefs about parcels based on the sensing event data
            this.beliefs.parcels.updateParcels(sensing.parcels);

            // Update beliefs about crates based on the sensing event data
            this.beliefs.map.updateCrates(sensing.crates);
            
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
            //#TODO: After updating beliefs, deliberate to form desires and intentions
        });
    }

    /**
     * Deliberate method processes the current beliefs to form desires and intentions.
     */
    deliberate() {
        if (this.debug) console.log(
            "[DELIBERATE] Beliefs snapshot — me:", this.beliefs.agents.getCurrentMe()?.id ?? "unknown",
            "| friends:", this.beliefs.agents.getCurrentFriends().length,
            "| enemies:", this.beliefs.agents.getCurrentEnemies().length,
            "| parcels:", this.beliefs.parcels.getCurrentParcels().length,
            "| crates:", this.beliefs.map.getCurrentCrates().length
        );
        // Placeholder: always desire to move up
        this.desires = ["moveUp"];
        if (this.debug) console.log("[DELIBERATE] Desires:", this.desires);
        this.intention();
    }

    /**
     * This method filters the desires to form intentions.
     */
    intention() {
        // Placeholder: turn every desire directly into an intention
        this.intentions = [...this.desires];
        if (this.debug) console.log("[INTENTIONS] Intentions:", this.intentions);
        // Execute the intentions immediately for demonstration purposes
        this.execute();
    }

    /**
     * Execute Intentions method performs actions based on the current intentions.
     */
    execute() {
        this.intentions.forEach(async (intention) => {
            if (this.debug) console.log("[EXECUTE] Executing intention:", intention);
            //const result = await this.socket.emitMove("down");
        });
    }
}
