/**
 * Shared 2D grid coordinate used across internal and IO models.
 */
export type Position = { x: number; y: number };

/**
 * Direction type for movement and predictions, including a stationary option for no movement.
 */
export type Direction = 'up' | 'down' | 'left' | 'right' | 'stationary';

/**
 * Utility class to track and predict enemy positions based on observed history.
 */
export type DirectionPrediction = {
    direction: Direction;
    confidence: number; // [0, 1]
};