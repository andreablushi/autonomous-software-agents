import type { GameMap, Tile } from "../../../models/map.js";
import type { Crate } from "../../../models/crate.js";
import type { Position } from "../../../models/position.js";
import type { IOTile, IOCrate } from "../../../models/djs.js";
import { TILE_TYPE, type TileType } from "../../../models/tile_type.js";
import { Tracker } from "./utils/tracker.js";
import { manhattanDistance } from "../../../utils/metrics.js";

/**
 * Beliefs about the static map layout and dynamic crate positions.
 */
export class MapBeliefs {
    private map: GameMap | null = null;              // Static map layout, set once at the start of the game
    private spawnTiles: Tile[] = [];                 // Precomputed on updateMap; map is static so this never changes
    private deliveryTiles: Tile[] = [];              // Precomputed on updateMap; map is static so this never changes
    
    private crates = new Tracker<Crate>();                           // Latest-only store; eviction is handled by MapBeliefs.evict()
    private spawnTilesSensingTimes = new Map<string, number>();      // Keep track of when spawn tiles were last sensed, keyed as "x,y"
    private spawnTilesClusterWeights = new Map<string, number>();    // Keep track of how many spawn tiles are in the cluster of each spawn tile, keyed as "x,y"
    private temporaryBlocked = new Map<string, number>();             // Temporary blockers for pathfinding, e.g. tiles that are currently occupied by other agents or crates but may become free soon
  
    /**
     * Initialize map beliefs from the given map info.
     * @param width Width of the map in tiles.
     * @param height Height of the map in tiles.
     * @param tiles Initial array of tiles from the server.
     * @returns void
     */
    updateMap(width: number, height: number, tiles: IOTile[]): void {
        // Normalize tile types to strings — the server may send numeric values (e.g. 1) instead of strings ('1')
        const normalizedTiles = tiles.map(t => ({ ...t, type: String(t.type) as TileType }));

        // Pre-fill with WALL so any tile absent from the server payload is treated as unwalkable
        const matrix = Array.from({ length: height }, () =>
            Array<TileType>(width).fill(TILE_TYPE.WALL)
        );
        for (const t of normalizedTiles) {
            matrix[t.y][t.x] = t.type;
        }
        this.map = { width, height, tiles: matrix };

        // Precompute static tile lists — map never changes after this point
        this.spawnTiles = normalizedTiles
            .filter(t => t.type === TILE_TYPE.SPAWN_POINT)
            .map(t => ({ x: t.x, y: t.y, type: t.type }));
        this.deliveryTiles = normalizedTiles
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
     * Check if a given position is walkable.
     * @param from The position from which the agent is trying to move
     * @param to The position the agent is trying to move to
     * @returns True if the position is walkable, false otherwise.
     */
    isWalkable(from: Position, to: Position): boolean {
        const tile = this.getTileAt(to);

        // If there's no tile (out of bounds) or it's a wall, it's not walkable
        if (tile === null || tile.type === TILE_TYPE.WALL) return false;

        // If it's temporary blocked (e.g. occupied by another agent or crate), it's not walkable
        if (this.isBlocked(to)) return false;

        // Conveyors block entry only from the direction that opposes their push.
        const dx = to.x - from.x;
        const dy = to.y - from.y;
        switch (tile.type) {
            case TILE_TYPE.CONVEYOR_LEFT:  return dx !== 1;   // blocked if moving right (dx+1 against left)
            case TILE_TYPE.CONVEYOR_RIGHT: return dx !== -1;  // blocked if moving left  (dx-1 against right)
            case TILE_TYPE.CONVEYOR_UP:    return dy !== -1;  // blocked if moving down  (dy-1 against up)
            case TILE_TYPE.CONVEYOR_DOWN:  return dy !== 1;   // blocked if moving up    (dy+1 against down)
        }



        // Otherwise, it's walkable
        return true;
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
    getSpawnTileSensingTime(position: Position): number | undefined {
        return this.spawnTilesSensingTimes.get(`${position.x},${position.y}`);
    }

    /**
     * Compute and cache a distance-weighted cluster weight for every spawn tile.
     * Weight = Σ (observationDistance - dist(tile, neighbor) + 1) for each neighbor within range.
     * Must be called once after observationDistance is known from the config event.
     * @param observationDistance The maximum distance at which the agent can sense tiles, used to determine which spawn tiles are in the same cluster.
     * @returns void
     */
    computeClusterWeights(observationDistance: number): void {
        for (const tile of this.spawnTiles) {
            const weight = this.spawnTiles.reduce((sum, neighbor) => {
                const distance = manhattanDistance(tile, neighbor);
                return distance <= observationDistance ? sum + (observationDistance - distance + 1) : sum;
            }, 0);
            this.spawnTilesClusterWeights.set(`${tile.x},${tile.y}`, weight);
        }
    }

    /**
     * Get the cluster weight for a given spawn tile position,
     * which represents how many spawn tiles are sensed by standing on that tile.
     * @param position The position of the spawn tile to query.
     * @returns The cluster weight of the spawn tile, or 0 if not yet computed.
     * Higher weights indicate tiles that can sense more spawn tiles when stood upon.
     */
    getSpawnTileClusterWeight(position: Position): number {
        return this.spawnTilesClusterWeights.get(`${position.x},${position.y}`) ?? 0;
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
     * Mark a tile as temporarily blocked for pathfinding purposes
     * @param pos The position to mark as blocked
     * @param ttl How long to keep the tile blocked in milliseconds (default 1500ms)
     */
    markBlocked(pos: Position, ttl = 1_500): void {
        this.temporaryBlocked.set(`${pos.x},${pos.y}`, Date.now() + ttl);
    }

    /**
     * Check if a tile is currently marked as temporarily blocked     
     * @param pos The position to check
     * @returns True if the tile is currently blocked, false otherwise
     */
    isBlocked(pos: Position): boolean {
        const key = `${pos.x},${pos.y}`;
        const exp = this.temporaryBlocked.get(key);
        if (exp === undefined) return false;
        if (Date.now() >= exp) { this.temporaryBlocked.delete(key); return false; }
        return true;
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
