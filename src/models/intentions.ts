import type { DesireType } from "./desires.js";
import type { Position } from "./position.js";

/**
 * An intention is a navigation desire the agent has committed to, with a computed A* path to its target.
 */
export type Intention = {
    desire: DesireType;     // The desire this intention is based on (e.g. REACH_PARCEL with a specific target)
    path: Position[];       // Steps from A* (excludes start, includes goal)
};

/**
 * IntentionQueueEntry represents a desire along with its computed score, used for sorting and selection in the BDI deliberation process.
 */
export type IntentionQueueEntry = {
    desire: DesireType;     // The type of desire
    score: number;          // A computed score representing the desirability of this intention
};

export type IntentionQueue = IntentionQueueEntry[];

