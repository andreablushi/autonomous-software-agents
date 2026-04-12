import type { GameMap, Tile } from "../../../models/map.js";
import type { Agent } from "../../../models/agent.js";
import type { Crates } from "../../../models/crates.js";
import type { IOTile, IOCrate } from "../../../models/djs.js";
import { TILE_TYPES } from "../../../models/tile_type.js";
import { Memory } from "./utils/memory.js";

/**
 * Beliefs about the static map layout and dynamic crate positions.
 */
export class MapBeliefs {

    map: GameMap | null = null;             // Static map layout, set once at the start of the game
    crates = new Memory<Crates>(30_000);    // Memory of crates, keyed by ID, with TTL-based eviction to handle dynamic changes

    /**
     * Initialize map beliefs from the given map info.
     * @param width Width of the map in tiles.
     * @param height Height of the map in tiles.
     * @param tiles Initial array of tiles from the server, converted to internal Tile type.
     */
    setMap(width: number, height: number, tiles: IOTile[]): void {
        this.map = { width, height, tiles: tiles as Tile[] };
    }

    /**
     * Update crate beliefs with the latest observed crates.
     * @param crates Array of crates from the server, converted to internal Crates type and stored in memory.
     */
    updateCrates(crates: IOCrate[]): void {
        crates.forEach(crate => {
            this.crates.update(crate.id, { id: crate.id, lastPosition: { x: crate.x, y: crate.y } });
        });
    }

    /** 
     * All parcel spawn tiles.
     */
    spawnTiles(): Tile[] {
        return this.map?.tiles.filter(t => t.type === TILE_TYPES.SPAWN_POINT) ?? [];
    }

    /** 
     * All parcel delivery tiles.
     */
    deliveryTiles(): Tile[] {
        return this.map?.tiles.filter(t => t.type === TILE_TYPES.DELIVERY_POINT) ?? [];
    }

    /** 
     * All walkable (non-wall) tiles.
     */
    walkableTiles(): Tile[] {
        return this.map?.tiles.filter(t => t.type !== TILE_TYPES.WALL) ?? [];
    }

    /** 
     * Tile at the given grid coordinates, or undefined if not found.
     */
    tileAt(x: number, y: number): Tile | undefined {
        return this.map?.tiles.find(t => t.x === x && t.y === y);
    }

    /**
     * All spawn tiles currently occupied by the list of agents
     * @returns An array of spawn tiles that are currently occupied by agents, based on the latest beliefs about agent positions.
     */
    occupiedSpawnTiles(agents: Agent[]): Tile[] {
        const spawns = this.spawnTiles();
        // Get spawn tiles that are currently occupied by agents based on their last known positions
        return spawns.filter(s => agents.some(a => a.lastPosition && a.lastPosition.x === s.x && a.lastPosition.y === s.y));
    }
}
