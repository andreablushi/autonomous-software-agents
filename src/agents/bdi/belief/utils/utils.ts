import type { Position } from "../../../../models/position.js";

/**
 * Calculates the Manhattan distance between two positions.
 * @param a First position. 
 * @param b Second position.
 * @returns The Manhattan distance between positions a and b.
 */
export function manhattan(a: Position, b: Position): number {
    return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}
