'use strict';
require('dotenv').config();
const session = require('express-session');

/**
 * Shared session middleware
 * ─────────────────────────
 * When REDIS_URL is present the session store is backed by Redis so that
 * the stand-alone WebSocket Gateway (separate process/machine) can read
 * the same sessions and authenticate socket connections without a round-
 * trip to the Chat Service.
 *
 * When REDIS_URL is absent (local dev, no Redis) the default in-memory
 * store is used and the system falls back to the monolithic single-server
 * mode (config/socket.js + chatSocketService.js).
 */

let store;

if (process.env.REDIS_URL) {
    try {
        // connect-redis v7+ uses named export
        const { default: RedisStore } = require('connect-redis');
        const Redis = require('ioredis');

        const sessionRedis = new Redis(process.env.REDIS_URL, {
            retryStrategy: times => Math.min(times * 100, 3000),
            enableReadyCheck: true,
        });

        sessionRedis.on('error', e => console.error('[Session:Redis]', e.message));
        sessionRedis.on('connect', () => console.log('✅ Session store: Redis'));

        store = new RedisStore({ client: sessionRedis, prefix: 'sess:' });
    } catch (e) {
        // connect-redis not installed or wrong version — harmless fallback
        console.warn('⚠️  connect-redis unavailable; falling back to in-memory session store.');
        console.warn('    Install with: npm install connect-redis');
    }
}

const sessionMiddleware = session({
    store,                                       // undefined = MemoryStore (single server)
    secret:            process.env.SESSION_SECRET || 'fallback_secret',
    resave:            false,
    saveUninitialized: false,
    cookie: {
        secure:  false,
        maxAge:  24 * 60 * 60 * 1000,
        sameSite: 'lax',                         // required for cross-origin gateway
    },
});

module.exports = sessionMiddleware;
