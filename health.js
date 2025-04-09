import fetch from 'node-fetch';
import { readFile } from 'fs/promises';

let lastPollTime = Date.now();
let lastEsiCall = Date.now();
let lastMatrixPost = Date.now();

// Load configuration
const config = JSON.parse(await readFile('./config.json', 'utf-8'));

export function updateHealthMetrics(type) {
    switch(type) {
        case 'poll':
            lastPollTime = Date.now();
            break;
        case 'esi':
            lastEsiCall = Date.now();
            break;
        case 'matrix':
            lastMatrixPost = Date.now();
            break;
    }
}

export function checkHealth() {
    const now = Date.now();
    const MAX_POLL_INTERVAL = 30000; // 30 seconds
    const MAX_ESI_INTERVAL = 60000;  // 1 minute
    const MAX_MATRIX_INTERVAL = 60000; // 1 minute

    const health = {
        status: 'healthy',
        details: {
            redisq: {
                status: 'healthy',
                lastPoll: now - lastPollTime
            },
            esi: {
                status: 'healthy',
                lastCall: now - lastEsiCall
            },
            matrix: {
                status: 'healthy',
                lastPost: now - lastMatrixPost
            }
        }
    };

    // Check RedisQ polling
    if (now - lastPollTime > MAX_POLL_INTERVAL) {
        health.status = 'unhealthy';
        health.details.redisq.status = 'unhealthy';
    }

    // Check ESI calls
    if (now - lastEsiCall > MAX_ESI_INTERVAL) {
        health.status = 'unhealthy';
        health.details.esi.status = 'unhealthy';
    }

    // Check Matrix posts
    if (now - lastMatrixPost > MAX_MATRIX_INTERVAL) {
        health.status = 'unhealthy';
        health.details.matrix.status = 'unhealthy';
    }

    return health;
} 