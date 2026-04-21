import { IOConfig, IOTile, IOAgent, IOSensing } from "../../models/djs.js";
import type { Position } from "../../models/position.js";
import { Beliefs } from "./belief/beliefs.js";
import { generateDesires } from "./desire/desire_generator.js";
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
    private executing = false;

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
        if (!this.executing) {
            this.executeLoop();
        }
    }

    /**
     * Execute one step of the current intention by emitting a move to the socket.
     */
    async execute(): Promise<boolean> {
        // Get current position from beliefs to compute the next step direction
        const me = this.beliefs.agents.getCurrentMe();
        if (!me?.lastPosition) return false;

        // Get the next step from the intentions manager
        const move = this.intentions.getNextAction(me.lastPosition, this.beliefs);
        if (move === null) {
            if (this.debug) console.log("[EXECUTE] No safe move to execute.");
            this.intentions.invalidatePath(this.beliefs);
            return this.intentions.getCurrentIntention() !== null;
        }

        let succeeded = false;

        // Handle action desires (pickup/putdown) immediately without pathfinding
        if (move === 'pickup') {
            const pickedUp = await this.socket.emitPickup() as Array<{ id: string }>;
            succeeded = pickedUp.length > 0;
            if (this.debug) console.log("[EXECUTE] Picking up parcel.");
            if (succeeded) {
                this.beliefs.parcels.markPickedUpParcels(
                    pickedUp.map(parcel => parcel.id),
                    me.id,
                    me.lastPosition,
                );
            }
        }
        else if (move === 'putdown') {
            const putDown = await this.socket.emitPutdown() as Array<{ id: string }>;
            if (this.debug) console.log("[EXECUTE] Put down parcel.");
            succeeded = putDown.length > 0;
            if (succeeded) {
                this.beliefs.parcels.cleanDeliveredParcels(
                    this.beliefs.parcels.getCarriedByAgent(me.id)
                );
            }
        }
        // For movement desires, emit the move and update beliefs based on the result
        else {
            const result = await this.socket.emitMove(move) as Position | false;
            if (this.debug) console.log("[EXECUTE] Moving to next step:", move);
            succeeded = result !== false;
            if (result !== false) {
                this.beliefs.agents.updateMyPosition(result);
            }
        }

        // Update intentions based on whether the action succeeded or failed
        if (succeeded) {
            this.intentions.shiftPath(this.beliefs);
        }
        else {
            this.intentions.invalidatePath(this.beliefs);
        }
        // Return whether we still have an intention to execute after this step
        return this.intentions.getCurrentIntention() !== null;
    }

    /**
     * Execute loop continuously executes steps of the current intention until there are no more steps to execute.
     */
    private async executeLoop(): Promise<void> {
        // Prevent multiple concurrent execution loops
        if (this.executing) return;
        this.executing = true;
        try {
            while (this.executing) {
                const shouldContinue = await this.execute();
                if (!shouldContinue) break;
            }
        }
        catch (err) {
            if (this.debug) console.error("[EXECUTE] Execution error:", err);
        }
        finally {
            this.executing = false;
        }
    }
}
