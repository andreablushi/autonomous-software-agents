/**
 * Shared 2D grid coordinate used across internal and IO models.
 */
export type Position = { x: number; y: number };

/**
 * Utility class to track and predict enemy positions based on observed history.
 */
export type PositionPrediction = {
    position: Position; // Predicted position of the enemy
    confidence: number; // [0, 1]
};