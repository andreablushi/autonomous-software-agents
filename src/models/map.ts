/**
 * Map model types for the delivery autonomous agents system.
 * These types represent the internal belief state about the game world's layout.
 */

export type Tile = {
    x: number;    // Tile's column index on the map
    y: number;    // Tile's row index on the map
    type:         // Tile type code indicating the nature of the tile
        '0'  |    // Blocked
        '1'  |    // Walkable
        '2'  |    // Spawn
        '3'  |    // Delivery
        '4'  |    // Crate
        '5'  |    // Special
        '5!' |    // Special-Active
        '←'  |    // Left Arrow
        '↑'  |    // Up Arrow
        '→'  |    // Right Arrow
        '↓';      // Down Arrow
};

export type GameMap = {
    width: number;   // Number of columns in the map grid
    height: number;  // Number of rows in the map grid
    tiles: Tile[];   // Array of all tiles composing the map
};
