import type { Position } from "../../../models/position.js";
import { manhattanDistance } from "../../../utils/metrics.js";

type Node = {
    pos: Position;       // Position of the node
    g: number;           // Cost from start to this node
    f: number;           // Estimated total cost from start to goal through this node (g + heuristic)
    parent: Node | null; // Parent node in the path, used for path reconstruction
};

function posKey(pos: Position): string {
    return `${pos.x},${pos.y}`;
}

const NEIGHBOURS: Position[] = [
    { x: 0, y: 1 },
    { x: 0, y: -1 },
    { x: -1, y: 0 },
    { x: 1, y: 0 },
];

/**
 * Find the shortest path from `start` to `goal` using A*.
 *
 * @param start      Starting position (not included in the returned path).
 * @param goal       Target position (included in the returned path).
 * @param isWalkable Predicate that returns true for passable tiles.
 * @returns          Ordered array of positions from the step after `start` to
 *                   `goal`, or `null` if no path exists.
 */
export function aStar(
    start: Position,
    goal: Position,
    isWalkable: (pos: Position) => boolean,
): Position[] | null {
    const open = new Map<string, Node>();
    const closed = new Set<string>();

    const startNode: Node = { pos: start, g: 0, f: manhattanDistance(start, goal), parent: null };
    open.set(posKey(start), startNode);

    while (open.size > 0) {
        // Pick node with lowest f
        let current: Node | null = null;
        for (const node of open.values()) {
            if (!current || node.f < current.f) current = node;
        }
        if (!current) break;

        const key = posKey(current.pos);
        open.delete(key);
        closed.add(key);

        if (current.pos.x === goal.x && current.pos.y === goal.y) {
            // Reconstruct path (exclude start)
            const path: Position[] = [];
            let node: Node | null = current;
            while (node && node.parent) {
                path.unshift(node.pos);
                node = node.parent;
            }
            return path;
        }

        for (const delta of NEIGHBOURS) {
            const neighbour: Position = { x: current.pos.x + delta.x, y: current.pos.y + delta.y };
            const nKey = posKey(neighbour);

            if (closed.has(nKey)) continue;
            if (!isWalkable(neighbour)) continue;

            const g = current.g + 1;
            const existing = open.get(nKey);
            if (existing && existing.g <= g) continue;

            open.set(nKey, { pos: neighbour, g, f: g + manhattanDistance(neighbour, goal), parent: current });
        }
    }

    return null; // no path found
}
