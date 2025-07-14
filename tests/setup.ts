/// <reference path="./jest-types.d.ts" />

// Jest setup file
import { config } from 'dotenv';

// Load test environment variables
config({ path: '.env.test' });

// Global test timeout (only if jest is available)
if (typeof jest !== 'undefined') {
    jest.setTimeout(30000);
}

// Mock external API calls by default (only if jest is available)
if (typeof jest !== 'undefined') {
    jest.mock('axios');
    jest.mock('node-binance-api');
    jest.mock('twitter-api-v2');
}
