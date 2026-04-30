'use strict';
/**
 * Socket.io Event Handler Service
 * ────────────────────────────────
 * All real-time chat events are handled here.
 * Controllers call getIO() for out-of-band pushes (e.g. after REST create).
 *
 * Room naming: `chat:<chatId>`  (one room per conversation)
 * Presence map: userId → Set<socketId>  (for online/offline tracking)
 */

const Chat            = require('../models/Chat');
const ChatMember      = require('../models/ChatMember');
const Message         = require('../models/Message');
const MessageReceipt  = require('../models/MessageReceipt');

// In-process online user tracking.
// For PM2 cluster use the Redis adapter handles cross-process fanout;
// this map is only used for per-process presence queries.
const onlineUsers = new Map(); // userId → Set<socketId>

// ─── Init ─────────────────────────────────────────────────────────────────────

function init(io) {
    io.on('connection', async (socket) => {
        const { userId, userRole, schoolId } = socket;

        // Track presence
        if (!onlineUsers.has(userId)) onlineUsers.set(userId, new Set());
        onlineUsers.get(userId).add(socket.id);

        // Join all rooms for chats this user belongs to
        await _joinUserRooms(socket);

        // Announce online status to school peers
        socket.to(`school:${schoolId}`).emit('chat:user_online', { userId });
        socket.join(`school:${schoolId}`);

        // ── Inbound events ────────────────────────────────────────────────
        socket.on('chat:send',          (d) => _onSend(io, socket, d));
        socket.on('chat:typing_start',  (d) => _onTyping(socket, d, true));
        socket.on('chat:typing_stop',   (d) => _onTyping(socket, d, false));
        socket.on('chat:read',          (d) => _onRead(io, socket, d));
        socket.on('chat:edit',          (d) => _onEdit(io, socket, d));
        socket.on('chat:delete',        (d) => _onDelete(io, socket, d));
        socket.on('chat:react',         (d) => _onReact(io, socket, d));
        socket.on('chat:join_room',     (d) => _onJoinRoom(socket, d));

        socket.on('disconnect', () => {
            const sockets = onlineUsers.get(userId);
            if (sockets) {
                sockets.delete(socket.id);
                if (sockets.size === 0) {
                    onlineUsers.delete(userId);
                    socket.to(`school:${schoolId}`).emit('chat:user_offline', { userId });
                }
            }
        });
    });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function _joinUserRooms(socket) {
    try {
        const memberships = await ChatMember.find({
            user: socket.userId,
            school: socket.schoolId,
            isActive: true,
        }).select('chat').lean();
        for (const m of memberships) {
            socket.join(`chat:${m.chat}`);
        }
    } catch (err) {
        console.error('[Socket] _joinUserRooms:', err.message);
    }
}

async function _verifyMembership(chatId, userId, schoolId) {
    return ChatMember.findOne({ chat: chatId, user: userId, school: schoolId, isActive: true }).lean();
}

// ─── Event handlers ───────────────────────────────────────────────────────────

async function _onSend(io, socket, data) {
    try {
        const { chatId, content, type = 'text', replyTo, attachments = [], tempId, isForwarded = false } = data || {};
        if (!chatId) return _err(socket, 'chatId required');
        if (!content && type === 'text') return _err(socket, 'Empty message');

        const member = await _verifyMembership(chatId, socket.userId, socket.schoolId);
        if (!member) return _err(socket, 'Not a member of this chat');

        const chat = await Chat.findOne({ _id: chatId, school: socket.schoolId }).lean();
        if (!chat) return _err(socket, 'Chat not found');

        // Read-only check: only admin-level or teacher may post in broadcast chats
        if (chat.isReadOnly && !['school_admin', 'super_admin', 'teacher'].includes(socket.userRole)) {
            return _err(socket, 'This is a read-only channel — you cannot reply');
        }

        const msg = await Message.create({
            chat:        chatId,
            school:      socket.schoolId,
            sender:      socket.userId,
            senderRole:  socket.userRole,
            content:     (content || '').trim(),
            type,
            attachments,
            replyTo:     replyTo || null,
            isForwarded: !!isForwarded,
        });

        await Chat.findByIdAndUpdate(chatId, {
            lastMessage:  msg._id,
            lastActivity: new Date(),
        });

        const populated = await Message.findById(msg._id)
            .populate('sender', 'name role profileImage')
            .populate({ path: 'replyTo', select: 'content isDeleted', populate: { path: 'sender', select: 'name' } })
            .lean();

        // Deliver to everyone in the room (including sender — simplifies client state)
        io.to(`chat:${chatId}`).emit('chat:message', { ...populated, tempId });

        // Write delivery receipts for every other active member (background, non-blocking)
        _writeDeliveryReceipts(msg._id, chatId, socket.userId, socket.schoolId);

    } catch (err) {
        console.error('[Socket] _onSend:', err.message);
        _err(socket, 'Failed to send message');
    }
}

function _onTyping(socket, data, isTyping) {
    const { chatId } = data || {};
    if (!chatId) return;
    socket.to(`chat:${chatId}`).emit('chat:typing', {
        userId: socket.userId,
        chatId,
        isTyping,
    });
}

async function _onRead(io, socket, data) {
    try {
        const { chatId, messageId } = data || {};
        if (!chatId) return;

        await ChatMember.findOneAndUpdate(
            { chat: chatId, user: socket.userId },
            { lastReadMessage: messageId || null, lastReadAt: new Date() }
        );

        await MessageReceipt.updateMany(
            { chat: chatId, user: socket.userId, readAt: null },
            { readAt: new Date() }
        );

        socket.to(`chat:${chatId}`).emit('chat:message_read', {
            chatId,
            userId:    socket.userId,
            messageId: messageId || null,
            readAt:    new Date(),
        });
    } catch (err) {
        console.error('[Socket] _onRead:', err.message);
    }
}

async function _onEdit(io, socket, data) {
    try {
        const { messageId, content } = data || {};
        if (!messageId || !content) return _err(socket, 'messageId and content required');

        const msg = await Message.findOne({
            _id: messageId,
            sender: socket.userId,
            isDeleted: false,
        }).lean();
        if (!msg) return _err(socket, 'Message not found or not authorised');

        // Disallow edit after 24 h
        if (Date.now() - new Date(msg.createdAt).getTime() > 86_400_000) {
            return _err(socket, 'Cannot edit messages older than 24 hours');
        }

        await Message.findByIdAndUpdate(messageId, {
            content:  content.trim(),
            isEdited: true,
            editedAt: new Date(),
        });

        io.to(`chat:${msg.chat}`).emit('chat:message_edited', {
            messageId,
            chatId:   String(msg.chat),
            content:  content.trim(),
            editedAt: new Date(),
        });
    } catch (err) {
        console.error('[Socket] _onEdit:', err.message);
    }
}

async function _onDelete(io, socket, data) {
    try {
        const { messageId } = data || {};
        if (!messageId) return _err(socket, 'messageId required');

        const msg = await Message.findOne({ _id: messageId, isDeleted: false }).lean();
        if (!msg) return _err(socket, 'Message not found');

        const isOwner = String(msg.sender) === socket.userId;
        const isAdmin = ['school_admin', 'super_admin'].includes(socket.userRole);
        if (!isOwner && !isAdmin) return _err(socket, 'Not authorised to delete this message');

        await Message.findByIdAndUpdate(messageId, {
            isDeleted: true,
            deletedAt: new Date(),
            deletedBy: socket.userId,
        });

        io.to(`chat:${msg.chat}`).emit('chat:message_deleted', {
            messageId,
            chatId: String(msg.chat),
        });
    } catch (err) {
        console.error('[Socket] _onDelete:', err.message);
    }
}

async function _onReact(io, socket, data) {
    try {
        const { messageId, emoji } = data || {};
        if (!messageId || !emoji) return _err(socket, 'messageId and emoji required');

        const msg = await Message.findOne({ _id: messageId, isDeleted: false }).lean();
        if (!msg) return _err(socket, 'Message not found');

        const userId   = socket.userId;
        const existing = msg.reactions.find(r => String(r.user) === userId);

        let update;
        if (existing && existing.emoji === emoji) {
            // Same emoji — toggle off
            update = { $pull: { reactions: { user: userId } } };
        } else if (existing) {
            // Different emoji — replace
            update = {
                $pull: { reactions: { user: userId } },
            };
            await Message.findByIdAndUpdate(messageId, update);
            update = { $push: { reactions: { emoji, user: userId, userName: socket.userName || '' } } };
        } else {
            // New reaction
            update = { $push: { reactions: { emoji, user: userId, userName: socket.userName || '' } } };
        }

        const updated = await Message.findByIdAndUpdate(messageId, update, { new: true }).lean();

        io.to(`chat:${msg.chat}`).emit('chat:reaction', {
            messageId,
            chatId:    String(msg.chat),
            reactions: updated.reactions,
        });
    } catch (err) {
        console.error('[Socket] _onReact:', err.message);
    }
}

async function _onJoinRoom(socket, data) {
    const { chatId } = data || {};
    if (!chatId) return;
    const member = await _verifyMembership(chatId, socket.userId, socket.schoolId);
    if (member) socket.join(`chat:${chatId}`);
}

// ─── Background helpers ───────────────────────────────────────────────────────

async function _writeDeliveryReceipts(messageId, chatId, senderUserId, schoolId) {
    try {
        const members = await ChatMember.find({
            chat: chatId,
            user: { $ne: senderUserId },
            isActive: true,
        }).select('user').lean();

        if (!members.length) return;

        await MessageReceipt.insertMany(
            members.map(m => ({
                message:     messageId,
                chat:        chatId,
                user:        m.user,
                school:      schoolId,
                deliveredAt: new Date(),
            })),
            { ordered: false }
        );
    } catch { /* non-fatal */ }
}

function _err(socket, message) {
    socket.emit('chat:error', { message });
}

// ─── Presence helpers (used by controller) ───────────────────────────────────

function isUserOnline(userId) {
    return onlineUsers.has(String(userId));
}

/**
 * Join a newly created socket room on behalf of a user.
 * Called by the HTTP controller after creating a chat so the user's
 * existing socket connections immediately receive messages.
 */
function joinRoom(io, userId, chatId) {
    for (const [, socket] of io.sockets.sockets) {
        if (socket.userId === String(userId)) {
            socket.join(`chat:${chatId}`);
        }
    }
}

module.exports = { init, isUserOnline, joinRoom };
