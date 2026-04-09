
/**
 * BDI Agent Implementation
 * 
 * This class represents a Belief-Desire-Intention (BDI) agent that connects to a Deliveroo.js server using Socket.IO.
*/
export class BDIAgent {
    /**
     * @param {object} socket - The socket connection to the Deliveroo.js server.
     * @param {boolean} debug - Set to true to enable debug logging (dev mode).
     */
    constructor(socket, debug = false) {
        this.socket = socket;
        this.debug = debug;
        this.beliefs = {};
        this.desires = {};
        this.intentions = {};
        // Running it makes it move every time it receives a sensing event, it works like a while loop
        this.perceive();
    }

    /**
     * Perceive method listens for various events from the server to update the agent's beliefs about itself, the map, and its surroundings.
    */
    perceive() {
        this.socket.onYou((me) => {
            this.beliefs.me = me;
        });

        this.socket.onMap((width, height, tiles) => {
            this.beliefs.map = { width, height, tiles };
        });
        
        this.socket.onSensing(({ agents, parcels, crates }) => {
            if (this.debug) console.log("[SENSING] Agents:", agents, "Parcels:", parcels, "Crates:", crates);
            this.beliefs.agents = agents;
            this.beliefs.parcels = parcels;
            this.beliefs.crates = crates;
            this.deliberate();
        });
    }

    /**
     * Deliberate method processes the current beliefs to form desires and intentions. 
    */
    deliberate() {
        if (this.debug) console.log("[DELIBERATE] Current beliefs:", this.beliefs);
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
        // Placeholder: execute each intention
        this.intentions.forEach(async (intention) => {
            if (this.debug) console.log("[EXECUTE] Executing intention:", intention);
            //const result = await this.socket.emitMove("down");
        });
    }

}