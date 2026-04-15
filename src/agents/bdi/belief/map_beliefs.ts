import type { GameMap, Tile } from "../../../models/map.js";
import type { Agent } from "../../../models/agent.js";
import type { Crate } from "../../../models/crate.js";
import type { Position } from "../../../models/position.js";
import type { IOTile, IOCrate } from "../../../models/djs.js";
import { TILE_TYPE } from "../../../models/tile_type.js";
import { Tracker } from "./utils/tracker.js";

/**
 * Beliefs about the static map layout and dynamic crate positions.
 */
export class MapBeliefs {

    private map: GameMap | null = null;             // Static map layout, set once at the start of the game
    private crates = new Tracker<Crate>();          // Latest-only store; eviction is handled by MapBeliefs.evict()

    /**
     * Initialize map beliefs from the given map info.
     * @param width Width of the map in tiles.
     * @param height Height of the map in tiles.
     * @param tiles Initial array of tiles from the server, converted to internal Tile type.
     * @returns void
     */
    updateMap(width: number, height: number, tiles: IOTile[]): void {
        this.map = { width, height, tiles: tiles as Tile[] };
    }

    /**
     * Update crate beliefs with the latest observed crates.
     * @param crates Array of crates from the server, converted to internal Crates type and stored in memory.
     * @param sensedPositions Array of positions that are currently sensed.
     * @returns void
     */
    updateCrates(sensedCrates: IOCrate[], sensedPositions: Position[]): void {
        sensedCrates.forEach(crate => {
            this.crates.update(crate.id, { id: crate.id, lastPosition: { x: crate.x, y: crate.y } });
        });

        // Invalidate lastPosition for crates not currently visible but whose last known position is in view
        this.crates.invalidateAtSensedPositions(sensedCrates, sensedPositions);
    }

    /**
     * Get the current believed positions of all crates.
     * @returns An array of all crates with their current believed state
     */
    getCurrentCrates(): Crate[] {
        return this.crates.getCurrentAll();
    }

    /** 
     * All parcel spawn tiles.
     * @return An array of spawn tiles
     */
    getSpawnTiles(): Tile[] {
        return this.map?.tiles.filter(t => t.type === TILE_TYPE.SPAWN_POINT) ?? [];
    }

    /**
     * Get the nearest spawn tile to the agent's last known position.
     * @param agent The agent for which to find the nearest spawn tile.
     * @returns The nearest spawn tile, or null if no free spawn tiles are available.
     */
    getNearestSpawnTile(agent : Agent): Tile {
        // Get all spawn tiles (i.e. those not currently occupied by crates)
        const spawn = this.getSpawnTiles();
        // Find the nearest spawn tile to the agent's last known position
        const agentPos = agent.lastPosition;
        // If we don't know the agent's position, just return the first spawn tile
        if (!agentPos) return spawn[0];   
        
        // Compute the Manhattan distance from the agent's position 
        const nearest = spawn.reduce((nearest, spawn) => {
            const d = Math.abs(spawn.x - agentPos.x) + Math.abs(spawn.y - agentPos.y);
            const nd = Math.abs(nearest.x - agentPos.x) + Math.abs(nearest.y - agentPos.y);
            return d < nd ? spawn : nearest;
        }, spawn[0]);   // Start with the first spawn tile as the nearest
        return nearest;
    }

    /** 
     * All parcel delivery tiles.
     * @return An array of delivery tiles
     */
    getDeliveryTiles(): Tile[] {
        return this.map?.tiles.filter(t => t.type === TILE_TYPE.DELIVERY_POINT) ?? [];
    }

    /**
     * Possible tile positions a crate can move into, based on adjacent free crate spaces.
     * @param crate The crate to query.
     * @returns Array of positions the crate can legally move to.
     */
    getCratePossibleMoves(crate: Crate): Position[] {
        if (!this.map || !crate.lastPosition) return [];
        // Define the four adjacent positions around the crate
        const { x, y } = crate.lastPosition;
        const neighbours: Position[] = [
            { x: x - 1, y },
            { x: x + 1, y },
            { x, y: y - 1 },
            { x, y: y + 1 },
        ];
        // Filter the adjacent positions to only include those that are valid crate spaces (i.e. not walls or occupied by other crates)
        return neighbours.filter(pos =>
            this.map!.tiles.some(t =>
                t.type === TILE_TYPE.CRATE_SPACE &&
                t.x === pos.x && t.y === pos.y)
        );
    }

}
