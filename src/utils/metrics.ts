import type { Position } from "../models/position.js";

/** Manhattan distance between two grid positions. */
export function manhattanDistance(a: Position, b: Position): number {
    return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

/** Given the current position and a target position, computes the direction of next step. */
export function posToDirection(from: Position, to: Position): string {
    if (to.x > from.x) return "right";
    if (to.x < from.x) return "left";
    if (to.y > from.y) return "up";
    return "down";
}