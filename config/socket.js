'use strict';
const { Server } = require('socket.io');
const sessionMiddleware = require('./sessionMiddleware');

let _io = null;

async function initSocket(httpServer) {
    _io = new Server(httpServer, {
        cors: { origin: false },
        maxHttpBufferSize: 10 * 1024 * 1024, // 10 MB for file uploads over socket
    });

    // Share the same express-session store so socket auth reads the same sessions
    _io.use((socket, next) => {
        sessionMiddleware(socket.request, socket.request.res || {}, next);
    });

    // Authenticate every connection
    _io.use((socket, next) => {
        const sess = socket.request.session;
        if (!sess || !sess.userId) {
            return next(new Error('AUTH_REQUIRED'));
        }
        socket.userId   = String(sess.userId);
        socket.userRole = sess.userRole;
        socket.schoolId = String(sess.schoolId || '');
        next();
    });

    // Attempt Redis adapter for multi-server / PM2 cluster mode
    await _tryRedisAdapter(_io);

    // Register domain event handlers
    const chatSocketService = require('../services/chatSocketService');
    chatSocketService.init(_io);

    console.log('✅ Socket.io initialised');
    return _io;
}

async function _tryRedisAdapter(io) {
    const redisUrl = process.env.REDIS_URL;
    if (!redisUrl) return;
    try {
        const { createAdapter } = require('@socket.io/redis-adapter');
        const Redis = require('ioredis');
        const pub = new Redis(redisUrl);
        const sub = pub.duplicate();
        io.adapter(createAdapter(pub, sub));
        console.log('✅ Socket.io Redis adapter connected');
    } catch {
        console.log('ℹ️  Redis adapter unavailable — using in-memory (single-server mode)');
    }
}

function getIO() {
    if (!_io) throw new Error('Socket.io not yet initialised');
    return _io;
}

module.exports = { initSocket, getIO };
