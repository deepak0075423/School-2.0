'use strict';
/**
 * Internal API Routes
 * ────────────────────
 * Called exclusively by the WebSocket Gateway — never exposed to the browser.
 * Protected by the INTERNAL_SECRET env var (pre-shared key).
 *
 * Mount point (app.js): /internal
 */
const express    = require('express');
const router     = express.Router();
const ChatMember = require('../models/ChatMember');

// ── Auth guard ────────────────────────────────────────────────────────────────
function requireInternalSecret(req, res, next) {
    const secret = process.env.INTERNAL_SECRET;
    if (!secret) return res.status(503).json({ error: 'INTERNAL_SECRET not configured' });
    if (req.headers['x-internal-secret'] !== secret) {
        return res.status(403).json({ error: 'Forbidden' });
    }
    next();
}

/**
 * GET /internal/user-chats?userId=<id>&schoolId=<id>
 *
 * Returns the list of chatIds that a user is an active member of.
 * The WebSocket Gateway calls this once per socket connection to determine
 * which Socket.io rooms to join the new socket into.
 */
router.get('/user-chats', requireInternalSecret, async (req, res) => {
    const { userId, schoolId } = req.query;
    if (!userId || !schoolId) {
        return res.status(400).json({ error: 'userId and schoolId are required' });
    }
    try {
        const memberships = await ChatMember.find({
            user:     userId,
            school:   schoolId,
            isActive: true,
        }).select('chat').lean();

        res.json({ chatIds: memberships.map(m => String(m.chat)) });
    } catch (err) {
        console.error('[internal] user-chats error:', err);
        res.status(500).json({ error: 'Internal error' });
    }
});

module.exports = router;
