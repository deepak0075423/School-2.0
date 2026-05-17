'use strict';
const express    = require('express');
const router     = express.Router();
const { verifyToken, requirePasswordReset } = require('../../middleware/auth');
const Chat       = require('../../models/Chat');
const ChatMember = require('../../models/ChatMember');
const Message    = require('../../models/Message');
const User       = require('../../models/User');

const guard = [verifyToken, requirePasswordReset];

// ── GET /api/chat/chats — list the user's chats ───────────────────────────────
router.get('/chats', guard, async (req, res) => {
    try {
        const memberships = await ChatMember.find({
            user: req.userId, school: req.schoolId, isActive: true,
        })
        .populate({
            path: 'chat',
            populate: {
                path: 'lastMessage',
                select: 'content type sender isDeleted createdAt',
                populate: { path: 'sender', select: 'name' },
            },
        })
        .lean();

        const unreadCounts = await Promise.all(
            memberships.map(async (m) => {
                const filter = { chat: m.chat?._id, school: req.schoolId, isDeleted: false };
                if (m.lastReadAt) filter.createdAt = { $gt: m.lastReadAt };
                const count = m.lastReadAt ? await Message.countDocuments(filter) : 0;
                return { chatId: String(m.chat?._id), unread: count };
            })
        );
        const unreadMap = Object.fromEntries(unreadCounts.map(u => [u.chatId, u.unread]));

        const chats = memberships
            .filter(m => m.chat)
            .map(m => ({
                ...m.chat,
                memberRole:    m.role,
                isMuted:       m.isMuted,
                isArchived:    m.isArchived,
                lastReadAt:    m.lastReadAt,
                unreadCount:   unreadMap[String(m.chat._id)] || 0,
            }))
            .sort((a, b) => new Date(b.lastActivity) - new Date(a.lastActivity));

        res.json({ success: true, data: chats });
    } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// ── GET /api/chat/chats/:chatId/messages — paginated messages ─────────────────
router.get('/chats/:chatId/messages', guard, async (req, res) => {
    try {
        const { chatId } = req.params;
        const { before, limit = 50 } = req.query;

        const member = await ChatMember.findOne({ chat: chatId, user: req.userId, isActive: true });
        if (!member) return res.status(403).json({ success: false, message: 'Not a member of this chat' });

        const filter = { chat: chatId, school: req.schoolId };
        if (before) filter.createdAt = { $lt: new Date(before) };

        const messages = await Message.find(filter)
            .populate('sender', 'name role')
            .populate('replyTo', 'content sender')
            .sort({ createdAt: -1 })
            .limit(+limit)
            .lean();

        // Mark as read — update lastReadAt and lastReadMessage
        const latest = messages[0];
        if (latest) {
            await ChatMember.updateOne(
                { chat: chatId, user: req.userId },
                { lastReadAt: new Date(), lastReadMessage: latest._id }
            );
        }

        res.json({ success: true, data: messages.reverse() });
    } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// ── POST /api/chat/chats/:chatId/messages — send a message ───────────────────
router.post('/chats/:chatId/messages', guard, async (req, res) => {
    try {
        const { chatId } = req.params;
        const { content, type = 'text', replyTo } = req.body;

        if (!content?.trim()) return res.status(400).json({ success: false, message: 'Content is required' });

        const member = await ChatMember.findOne({ chat: chatId, user: req.userId, isActive: true });
        if (!member) return res.status(403).json({ success: false, message: 'Not a member of this chat' });

        const chat = await Chat.findOne({ _id: chatId, school: req.schoolId });
        if (!chat) return res.status(404).json({ success: false, message: 'Chat not found' });

        if (chat.isReadOnly && !['school_admin', 'teacher'].includes(req.userRole)) {
            return res.status(403).json({ success: false, message: 'This chat is read-only' });
        }

        const message = await Message.create({
            chat:       chatId,
            school:     req.schoolId,
            sender:     req.userId,
            senderRole: req.userRole,
            content:    content.trim(),
            type,
            replyTo:    replyTo || null,
        });

        await Chat.updateOne({ _id: chatId }, { lastMessage: message._id, lastActivity: new Date() });
        await ChatMember.updateOne(
            { chat: chatId, user: req.userId },
            { lastReadAt: new Date(), lastReadMessage: message._id }
        );

        const populated = await Message.findById(message._id)
            .populate('sender', 'name role')
            .lean();

        res.status(201).json({ success: true, data: populated });
    } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// ── GET /api/chat/contacts — school users the current user can start a chat with
router.get('/contacts', guard, async (req, res) => {
    try {
        const { q } = req.query;
        const filter = { school: req.schoolId, isActive: true, _id: { $ne: req.userId } };
        if (q) filter.name = { $regex: q, $options: 'i' };

        const users = await User.find(filter)
            .select('name email role')
            .limit(30)
            .lean();

        res.json({ success: true, data: users });
    } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// ── POST /api/chat/direct — start or find a direct chat with another user ─────
router.post('/direct', guard, async (req, res) => {
    try {
        const { targetUserId } = req.body;
        if (!targetUserId) return res.status(400).json({ success: false, message: 'targetUserId required' });

        // Check if a direct chat already exists between these two users in this school
        const myChats = await ChatMember.find({ user: req.userId, school: req.schoolId, isActive: true }).select('chat');
        const theirChats = await ChatMember.find({ user: targetUserId, school: req.schoolId, isActive: true }).select('chat');

        const myIds = myChats.map(m => String(m.chat));
        const theirIds = theirChats.map(m => String(m.chat));
        const commonIds = myIds.filter(id => theirIds.includes(id));

        if (commonIds.length) {
            const existingDirect = await Chat.findOne({ _id: { $in: commonIds }, type: 'direct' }).lean();
            if (existingDirect) return res.json({ success: true, data: existingDirect });
        }

        // Create new direct chat
        const chat = await Chat.create({
            school:      req.schoolId,
            type:        'direct',
            createdBy:   req.userId,
            lastActivity: new Date(),
        });

        await ChatMember.insertMany([
            { chat: chat._id, user: req.userId,     school: req.schoolId, role: 'member' },
            { chat: chat._id, user: targetUserId,   school: req.schoolId, role: 'member' },
        ]);

        res.status(201).json({ success: true, data: chat });
    } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// ── GET /api/chat/chats/:chatId/members ──────────────────────────────────────
router.get('/chats/:chatId/members', guard, async (req, res) => {
    try {
        const members = await ChatMember.find({ chat: req.params.chatId, school: req.schoolId, isActive: true })
            .populate('user', 'name email role')
            .lean();
        res.json({ success: true, data: members });
    } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

module.exports = router;
