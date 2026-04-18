import type { GameMap, Tile } from "../../../models/map.js";
import type { Crate } from "../../../models/crate.js";
import type { Position } from "../../../models/position.js";
import type { IOTile, IOCrate } from "../../../models/djs.js";
import { TILE_TYPE, type TileType } from "../../../models/tile_type.js";
import { Tracker } from "./utils/tracker.js";

/**
 * Beliefs about the static map layout and dynamic crate positions.
 */
export class MapBeliefs {
    private map: GameMap | null = null;              // Static map layout, set once at the start of the game
    private spawnTiles: Tile[] = [];                 // Precomputed on updateMap; map is static so this never changes
    private deliveryTiles: Tile[] = [];              // Precomputed on updateMap; map is static so this never changes
    
    private crates = new Tracker<Crate>();                           // Latest-only store; eviction is handled by MapBeliefs.evict()
    private spawnTilesSensingTimes = new Map<string, number>();      // Keep track of when spawn tiles were last sensed, keyed as "x,y"

    
    /**
     * Initialize map beliefs from the given map info.
     * @param width Width of the map in tiles.
     * @param height Height of the map in tiles.
     * @param tiles Initial array of tiles from the server.
     * @returns void
     */
    updateMap(width: number, height: number, tiles: IOTile[]): void {
        // Pre-fill with WALL so any tile absent from the server payload is treated as unwalkable
        const matrix = Array.from({ length: height }, () =>
            Array<TileType>(width).fill(TILE_TYPE.WALL)
        );
        for (const t of tiles) {
            matrix[t.y][t.x] = t.type;
        }
        this.map = { width, height, tiles: matrix };

        // Precompute static tile lists — map never changes after this point
        this.spawnTiles = tiles
            .filter(t => t.type === TILE_TYPE.SPAWN_POINT)
            .map(t => ({ x: t.x, y: t.y, type: t.type }));
        this.deliveryTiles = tiles
            .filter(t => t.type === TILE_TYPE.DELIVERY_POINT)
            .map(t => ({ x: t.x, y: t.y, type: t.type }));
    }

    /**
     * Retrieve the tile at a given position, or null if the position is out of bounds or the map is not yet initialized.
     * @param position The position to query for the tile.
     * @returns The tile at the given position, or null if not found or map not initialized.
     */
    getTileAt(position: Position): Tile | null {
        if (!this.map) return null;
        const { x, y } = position;
        // Check bounds
        if (y < 0 || y >= this.map.height || x < 0 || x >= this.map.width) return null;
        return { x, y, type: this.map.tiles[y][x] };
    }

    /**
     * Check if a given position is walkable (not a wall nor crate).
     * @param position The position to check for walkability.
     * @returns True if the position is walkable, false otherwise.
     */
    isWalkable(position: Position): boolean {
        const tile = this.getTileAt(position);
        return tile !== null && tile.type !== TILE_TYPE.WALL;
    }
    
    /**
     * All parcel spawn tiles.
     * @return An array of spawn tiles
     */
    getSpawnTiles(): Tile[] {
        return this.spawnTiles;
    }

    /**
     * Update the sensing times for all spawn tiles based on the positions sensed.
     * @param sensedPositions Array of positions that are currently sensed.
     * @param currentTime The current time to update the sensing times.
     */
    updateSpawnTilesSensingTimes(sensedPositions: Position[], currentTime: number): void {
        // For each sensed position, if it's a spawn tile, update its last sensing time
        sensedPositions.forEach(position => {
            const tile = this.getTileAt(position);
            if (tile && tile.type === TILE_TYPE.SPAWN_POINT) {
                this.spawnTilesSensingTimes.set(`${position.x},${position.y}`, currentTime);
            }
        });
    }

    /**
     * Get the last sensing time for a given spawn tile position, or undefined if it has never been sensed.
     * @param position The position of the spawn tile to query.
     * @returns The timestamp of the last sensing of the spawn tile, or undefined if never sensed.
     */
    getSpawnTilesSensingTime(position: Position): number | undefined {
        return this.spawnTilesSensingTimes.get(`${position.x},${position.y}`);
    }
    /**
     * All parcel delivery tiles.
     * @return An array of delivery tiles
     */
    getDeliveryTiles(): Tile[] {
        return this.deliveryTiles;
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
        return neighbours.filter(pos => {
            const { x: nx, y: ny } = pos;
            if (ny < 0 || ny >= this.map!.height || nx < 0 || nx >= this.map!.width) return false;
            return this.map!.tiles[ny][nx] === TILE_TYPE.CRATE_SPACE;
        });
    }

}
