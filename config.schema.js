import { z } from 'zod';

export const ConfigSchema = z.object({
    watchedIds: z.array(z.number())
        .default([])
        .describe("Array of corporation or alliance IDs to monitor. Empty array means monitor all kills."),
    
    matrix: z.object({
        homeserverUrl: z.string()
            .url("Must be a valid URL")
            .describe("Matrix homeserver URL"),
        accessToken: z.string()
            .min(1, "Access token must not be empty")
            .describe("Matrix access token"),
        roomId: z.string()
            .min(1, "Room ID must not be empty")
            .describe("Matrix room ID to post messages to")
    }).describe("Matrix configuration"),
    
    userAgent: z.string()
        .min(5, "User agent must be descriptive")
        .regex(/^.+\(.+@.+\)$/, "User agent must include contact email in parentheses")
        .describe("User agent string for ESI requests"),
    
    queueId: z.string()
        .min(1, "Queue ID must not be empty")
        .default(() => `zkill-matrix-${Math.random().toString(36).substring(7)}`)
        .describe("Unique identifier for RedisQ queue")
});

export const validateConfig = (config) => {
    try {
        return ConfigSchema.parse(config);
    } catch (error) {
        console.error("Configuration validation failed:");
        error.errors.forEach(err => {
            console.error(`- ${err.path.join('.')}: ${err.message}`);
        });
        process.exit(1);
    }
}; 