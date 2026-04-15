import type { Beliefs } from "../belief/beliefs.js";
import type { DesireType } from "../../../models/desires.js";
import { generateDesires } from "./desire_generator.js";
import { filterDesires } from "./desire_filter.js";

/**
 * Get desires based on the current beliefs of the agent.
 * This function generates potential desires and then filters them to ensure uniqueness and relevance.
 * @param beliefs - The current beliefs of the agent
 * @returns An array of DesireType representing the agent's current desires based on its beliefs.
 */
export function getDesires(beliefs: Beliefs): DesireType[] {
    const desires = generateDesires(beliefs);
    return filterDesires(desires);
}
