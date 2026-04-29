'use strict';
const Chat            = require('../models/Chat');
const ChatMember      = require('../models/ChatMember');
const Message         = require('../models/Message');
const MessageReceipt  = require('../models/MessageReceipt');
const User            = require('../models/User');
const perm            = require('../services/chatPermissionService');
const socketSvc       = require('../services/chatSocketService');
const broker          = require('../services/chatBrokerService');

// ─── Page ─────────────────────────────────────────────────────────────────────

/** GET /chat  — render the single-page chat shell */
exports.getIndex = async (req, res) => {
    try {
        const role = req.session.userRole;
        res.render('chat/index', {
            title:          'Chat',
            layout:         'layouts/main',
            canCreateGroup: perm.canCreateGroup(role),
            gatewayUrl:     process.env.GATEWAY_URL || '',
        });
    } catch (err) {
        console.error('[chatCtrl] getIndex:', err);
        req.flash('error', 'Could not open chat.');
        res.redirect('back');
    }
};

// ─── Chat list ────────────────────────────────────────────────────────────────

/** GET /chat/api/chats */
exports.getChats = async (req, res) => {
    try {
        const userId   = req.session.userId;
        const schoolId = req.session.schoolId;

        const memberships = await ChatMember.find({
            user: userId, school: schoolId, isActive: true,
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

        const results = await Promise.all(
            memberships
                .filter(m => m.chat && m.chat._id)
                .map(m => _enrichChat(m, userId, schoolId))
        );

        results.sort((a, b) => new Date(b.lastActivity) - new Date(a.lastActivity));

        res.json({ success: true, chats: results });
    } catch (err) {
        console.error('[chatCtrl] getChats:', err);
        res.status(500).json({ success: false, message: 'Failed to load chats' });
    }
};

async function _enrichChat(membership, userId, schoolId) {
    const chat = membership.chat;
    let displayName   = chat.name;
    let displayAvatar = chat.avatar;
    let otherUser     = null;

    if (chat.type === 'direct') {
        const other = await ChatMember.findOne({
            chat: chat._id, user: { $ne: userId }, isActive: true,
        }).populate('user', 'name role profileImage').lean();
        if (other && other.user) {
            otherUser     = other.user;
            displayName   = other.user.name;
            displayAvatar = other.user.profileImage || '';
        }
    }

    const unreadCount = await Message.countDocuments({
        chat:      chat._id,
        sender:    { $ne: userId },
        isDeleted: false,
        createdAt: { $gt: membership.lastReadAt || new Date(0) },
    });

    return {
        ...chat,
        displayName,
        displayAvatar,
        otherUser,
        unreadCount,
        isMuted:    membership.isMuted,
        isArchived: membership.isArchived,
        memberRole: membership.role,
        lastReadAt: membership.lastReadAt,
    };
}

// ─── Messages ─────────────────────────────────────────────────────────────────

/** GET /chat/api/chats/:chatId/messages?before=<iso>&limit=40 */
exports.getMessages = async (req, res) => {
    try {
        const { chatId }        = req.params;
        const { before, limit = 40 } = req.query;
        const userId   = req.session.userId;
        const schoolId = req.session.schoolId;

        const member = await ChatMember.findOne({ chat: chatId, user: userId, isActive: true }).lean();
        if (!member) return res.status(403).json({ success: false, message: 'Not a member' });

        const filter = { chat: chatId, school: schoolId };
        if (before) filter.createdAt = { $lt: new Date(before) };

        const lim  = Math.min(parseInt(limit) || 40, 100);
        const msgs = await Message.find(filter)
            .populate('sender', 'name role profileImage')
            .populate({
                path: 'replyTo',
                select: 'content isDeleted type',
                populate: { path: 'sender', select: 'name' },
            })
            .sort({ createdAt: -1 })
            .limit(lim)
            .lean();

        // Mark delivered messages as read (async — no await so response is fast)
        _markRead(chatId, userId, msgs).catch(() => {});

        res.json({
            success:  true,
            messages: msgs.reverse(),
            hasMore:  msgs.length >= lim,
        });
    } catch (err) {
        console.error('[chatCtrl] getMessages:', err);
        res.status(500).json({ success: false, message: 'Failed to load messages' });
    }
};

async function _markRead(chatId, userId, msgs) {
    if (!msgs.length) return;
    const latest = msgs[0]; // sorted desc, so first = newest
    await ChatMember.findOneAndUpdate(
        { chat: chatId, user: userId },
        { lastReadMessage: latest._id, lastReadAt: new Date() }
    );
    await MessageReceipt.updateMany(
        { chat: chatId, user: userId, readAt: null },
        { readAt: new Date() }
    );
}

// ─── Create direct chat ───────────────────────────────────────────────────────

/** POST /chat/direct  body: { receiverId } */
exports.createDirectChat = async (req, res) => {
    try {
        const { receiverId }  = req.body;
        const userId   = req.session.userId;
        const userRole = req.session.userRole;
        const schoolId = req.session.schoolId;

        if (!receiverId) return res.status(400).json({ success: false, message: 'receiverId required' });
        if (String(receiverId) === String(userId)) {
            return res.status(400).json({ success: false, message: 'Cannot chat with yourself' });
        }

        const receiver = await User.findOne({ _id: receiverId, school: schoolId }).select('role').lean();
        if (!receiver) return res.status(404).json({ success: false, message: 'User not found' });

        const check = await perm.canMessage(userId, userRole, receiverId, receiver.role, schoolId);
        if (!check.allowed) return res.status(403).json({ success: false, message: check.reason });

        // Find existing direct chat between these two users
        const myMemberships = await ChatMember.find({ user: userId, school: schoolId, isActive: true })
            .select('chat').lean();
        const myChatIds = myMemberships.map(m => m.chat);

        const existing = await ChatMember.findOne({
            chat:     { $in: myChatIds },
            user:     receiverId,
            isActive: true,
        })
        .populate({ path: 'chat', match: { type: 'direct', school: schoolId } })
        .lean();

        if (existing && existing.chat) {
            return res.json({ success: true, chatId: existing.chat._id });
        }

        // Create fresh direct chat
        const chat = await Chat.create({
            school: schoolId, type: 'direct', createdBy: userId,
        });
        await ChatMember.insertMany([
            { chat: chat._id, user: userId,     school: schoolId, role: 'admin' },
            { chat: chat._id, user: receiverId, school: schoolId, role: 'member' },
        ]);

        const io = req.app.get('io');
        if (io) {
            socketSvc.joinRoom(io, userId, chat._id);
            socketSvc.joinRoom(io, receiverId, chat._id);
        } else {
            await broker.publishMembership('join', userId, chat._id);
            await broker.publishMembership('join', receiverId, chat._id);
        }

        res.json({ success: true, chatId: chat._id });
    } catch (err) {
        console.error('[chatCtrl] createDirectChat:', err);
        res.status(500).json({ success: false, message: 'Failed to create chat' });
    }
};

// ─── Create group ─────────────────────────────────────────────────────────────

/** POST /chat/group  body: { name, description, memberIds (JSON array), isReadOnly, type } */
exports.createGroup = async (req, res) => {
    try {
        const { name, description = '', isReadOnly = false } = req.body;
        let   { memberIds, type = 'group' }                  = req.body;
        const userId   = req.session.userId;
        const userRole = req.session.userRole;
        const schoolId = req.session.schoolId;

        if (!perm.canCreateGroup(userRole)) {
            return res.status(403).json({ success: false, message: 'You cannot create groups' });
        }
        if (!name || !name.trim()) {
            return res.status(400).json({ success: false, message: 'Group name is required' });
        }

        if (typeof memberIds === 'string') {
            try { memberIds = JSON.parse(memberIds); } catch { memberIds = []; }
        }
        memberIds = (Array.isArray(memberIds) ? memberIds : [])
            .map(String)
            .filter(id => id !== String(userId));

        // Validate every proposed member
        for (const memberId of memberIds) {
            const rx = await User.findOne({ _id: memberId, school: schoolId }).select('role').lean();
            if (!rx) continue;
            const c = await perm.canMessage(userId, userRole, memberId, rx.role, schoolId);
            if (!c.allowed) {
                const u = await User.findById(memberId).select('name').lean();
                return res.status(403).json({
                    success: false,
                    message: `Cannot add ${u ? u.name : memberId}: ${c.reason}`,
                });
            }
        }

        const chatType = type === 'broadcast' ? 'broadcast' : 'group';
        const chat = await Chat.create({
            school:     schoolId,
            type:       chatType,
            name:       name.trim(),
            description,
            createdBy:  userId,
            isReadOnly: isReadOnly === true || isReadOnly === 'true',
        });

        const allMembers = [String(userId), ...memberIds];
        await ChatMember.insertMany(
            allMembers.map(mid => ({
                chat:   chat._id,
                user:   mid,
                school: schoolId,
                role:   mid === String(userId) ? 'admin' : 'member',
            }))
        );

        const io = req.app.get('io');
        if (io) {
            allMembers.forEach(mid => socketSvc.joinRoom(io, mid, chat._id));
            io.to(`chat:${chat._id}`).emit('chat:group_created', {
                chatId: chat._id, name: chat.name, type: chat.type,
            });
        } else {
            for (const mid of allMembers) await broker.publishMembership('join', mid, chat._id);
            await broker.publishToRoom(chat._id, 'chat:group_created', {
                chatId: chat._id, name: chat.name, type: chat.type,
            });
        }

        res.json({ success: true, chatId: chat._id });
    } catch (err) {
        console.error('[chatCtrl] createGroup:', err);
        res.status(500).json({ success: false, message: 'Failed to create group' });
    }
};

// ─── Contacts ─────────────────────────────────────────────────────────────────

/** GET /chat/api/contacts?q=<search> */
exports.getContacts = async (req, res) => {
    try {
        const { q } = req.query;
        let contacts = await perm.getAllowedContacts(
            req.session.userId,
            req.session.userRole,
            req.session.schoolId,
        );
        if (q) {
            const s = q.toLowerCase();
            contacts = contacts.filter(
                c => c.name.toLowerCase().includes(s) || c.role.toLowerCase().includes(s)
            );
        }
        res.json({ success: true, contacts });
    } catch (err) {
        console.error('[chatCtrl] getContacts:', err);
        res.status(500).json({ success: false, message: 'Failed to load contacts' });
    }
};

// ─── Message search ───────────────────────────────────────────────────────────

/** GET /chat/api/search?q=<text>&chatId=<optional> */
exports.searchMessages = async (req, res) => {
    try {
        const { q, chatId } = req.query;
        const userId   = req.session.userId;
        const schoolId = req.session.schoolId;

        if (!q || q.trim().length < 2) return res.json({ success: true, messages: [] });

        const memberships = await ChatMember.find({ user: userId, school: schoolId, isActive: true })
            .select('chat').lean();
        const chatIds = memberships.map(m => m.chat);

        const filter = {
            school:    schoolId,
            chat:      chatId ? chatId : { $in: chatIds },
            isDeleted: false,
            $text:     { $search: q.trim() },
        };

        const msgs = await Message.find(filter, { score: { $meta: 'textScore' } })
            .populate('sender', 'name role profileImage')
            .populate('chat', 'name type')
            .sort({ score: { $meta: 'textScore' } })
            .limit(30)
            .lean();

        res.json({ success: true, messages: msgs });
    } catch (err) {
        console.error('[chatCtrl] searchMessages:', err);
        res.status(500).json({ success: false, message: 'Search failed' });
    }
};

// ─── Edit / Delete messages ───────────────────────────────────────────────────

/** PATCH /chat/api/messages/:msgId  body: { content } */
exports.editMessage = async (req, res) => {
    try {
        const { msgId }  = req.params;
        const { content } = req.body;
        const userId = req.session.userId;

        if (!content || !content.trim()) {
            return res.status(400).json({ success: false, message: 'Content required' });
        }

        const msg = await Message.findOne({ _id: msgId, sender: userId, isDeleted: false }).lean();
        if (!msg) return res.status(403).json({ success: false, message: 'Not authorised' });

        if (Date.now() - new Date(msg.createdAt).getTime() > 86_400_000) {
            return res.status(400).json({ success: false, message: 'Cannot edit messages older than 24 hours' });
        }

        await Message.findByIdAndUpdate(msgId, {
            content: content.trim(), isEdited: true, editedAt: new Date(),
        });

        const io = req.app.get('io');
        if (io) {
            io.to(`chat:${msg.chat}`).emit('chat:message_edited', {
                messageId: msgId, chatId: String(msg.chat),
                content: content.trim(), editedAt: new Date(),
            });
        } else {
            await broker.publishToRoom(msg.chat, 'chat:message_edited', {
                messageId: msgId, chatId: String(msg.chat),
                content: content.trim(), editedAt: new Date(),
            });
        }
        res.json({ success: true });
    } catch (err) {
        console.error('[chatCtrl] editMessage:', err);
        res.status(500).json({ success: false, message: 'Failed to edit' });
    }
};

/** DELETE /chat/api/messages/:msgId */
exports.deleteMessage = async (req, res) => {
    try {
        const { msgId }  = req.params;
        const userId   = req.session.userId;
        const userRole = req.session.userRole;

        const msg = await Message.findOne({ _id: msgId, isDeleted: false }).lean();
        if (!msg) return res.status(404).json({ success: false, message: 'Message not found' });

        const isOwner = String(msg.sender) === String(userId);
        const isAdmin = ['school_admin', 'super_admin'].includes(userRole);
        if (!isOwner && !isAdmin) {
            return res.status(403).json({ success: false, message: 'Not authorised' });
        }

        await Message.findByIdAndUpdate(msgId, {
            isDeleted: true, deletedAt: new Date(), deletedBy: userId,
        });

        const io = req.app.get('io');
        if (io) {
            io.to(`chat:${msg.chat}`).emit('chat:message_deleted', {
                messageId: msgId, chatId: String(msg.chat),
            });
        } else {
            await broker.publishToRoom(msg.chat, 'chat:message_deleted', {
                messageId: msgId, chatId: String(msg.chat),
            });
        }
        res.json({ success: true });
    } catch (err) {
        console.error('[chatCtrl] deleteMessage:', err);
        res.status(500).json({ success: false, message: 'Failed to delete' });
    }
};

// ─── Group management ─────────────────────────────────────────────────────────

/** PATCH /chat/group/:chatId/settings  body: { name, description, isReadOnly } */
exports.updateGroupSettings = async (req, res) => {
    try {
        const { chatId }               = req.params;
        const { name, description, isReadOnly } = req.body;
        const userId = req.session.userId;

        const adminCheck = await ChatMember.findOne({
            chat: chatId, user: userId, role: 'admin', isActive: true,
        }).lean();
        if (!adminCheck) {
            return res.status(403).json({ success: false, message: 'Only group admins can update settings' });
        }

        const update = {};
        if (name !== undefined)        update.name        = name.trim();
        if (description !== undefined) update.description = description;
        if (isReadOnly !== undefined)  update.isReadOnly  = isReadOnly === true || isReadOnly === 'true';

        await Chat.findByIdAndUpdate(chatId, update);

        const io = req.app.get('io');
        if (io) {
            io.to(`chat:${chatId}`).emit('chat:group_updated', { chatId, ...update });
        } else {
            await broker.publishToRoom(chatId, 'chat:group_updated', { chatId, ...update });
        }

        res.json({ success: true });
    } catch (err) {
        console.error('[chatCtrl] updateGroupSettings:', err);
        res.status(500).json({ success: false, message: 'Failed to update group' });
    }
};

/** DELETE /chat/group/:chatId/member/:memberId */
exports.removeMember = async (req, res) => {
    try {
        const { chatId, memberId } = req.params;
        const userId = req.session.userId;

        if (String(memberId) !== String(userId)) {
            const check = await ChatMember.findOne({
                chat: chatId, user: userId, role: 'admin', isActive: true,
            }).lean();
            if (!check) return res.status(403).json({ success: false, message: 'Only admins can remove members' });
        }

        await ChatMember.findOneAndUpdate({ chat: chatId, user: memberId }, { isActive: false });

        const io = req.app.get('io');
        if (io) {
            io.to(`chat:${chatId}`).emit('chat:member_removed', { chatId, userId: memberId });
        } else {
            await broker.publishToRoom(chatId, 'chat:member_removed', { chatId, userId: memberId });
        }

        res.json({ success: true });
    } catch (err) {
        console.error('[chatCtrl] removeMember:', err);
        res.status(500).json({ success: false, message: 'Failed to remove member' });
    }
};

// ─── Mute / Archive ───────────────────────────────────────────────────────────

/** POST /chat/:chatId/mute  body: { muteUntil? } */
exports.toggleMute = async (req, res) => {
    try {
        const { chatId }   = req.params;
        const { muteUntil } = req.body;
        const userId = req.session.userId;

        const member = await ChatMember.findOne({ chat: chatId, user: userId }).lean();
        if (!member) return res.status(403).json({ success: false, message: 'Not a member' });

        const update = member.isMuted
            ? { isMuted: false, muteUntil: null }
            : { isMuted: true,  muteUntil: muteUntil ? new Date(muteUntil) : null };

        await ChatMember.findOneAndUpdate({ chat: chatId, user: userId }, update);
        res.json({ success: true, isMuted: !member.isMuted });
    } catch (err) {
        console.error('[chatCtrl] toggleMute:', err);
        res.status(500).json({ success: false, message: 'Failed to toggle mute' });
    }
};

/** POST /chat/:chatId/archive */
exports.toggleArchive = async (req, res) => {
    try {
        const { chatId } = req.params;
        const userId = req.session.userId;

        const member = await ChatMember.findOne({ chat: chatId, user: userId }).lean();
        if (!member) return res.status(403).json({ success: false, message: 'Not a member' });

        await ChatMember.findOneAndUpdate({ chat: chatId, user: userId }, {
            isArchived: !member.isArchived,
        });
        res.json({ success: true, isArchived: !member.isArchived });
    } catch (err) {
        console.error('[chatCtrl] toggleArchive:', err);
        res.status(500).json({ success: false, message: 'Failed to toggle archive' });
    }
};

// ─── File upload ──────────────────────────────────────────────────────────────

/** POST /chat/upload  multipart: file */
exports.uploadFile = async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded' });

        const isImage = req.file.mimetype.startsWith('image/');
        res.json({
            success: true,
            attachment: {
                originalName: req.file.originalname,
                fileName:     req.file.filename,
                fileUrl:      `/uploads/chat/${req.file.filename}`,
                fileType:     req.file.mimetype,
                fileSize:     req.file.size,
            },
            type: isImage ? 'image' : 'file',
        });
    } catch (err) {
        console.error('[chatCtrl] uploadFile:', err);
        res.status(500).json({ success: false, message: 'Upload failed' });
    }
};

// ─── Unread count (for topbar badge) ─────────────────────────────────────────

/** GET /chat/api/unread-count */
exports.getUnreadCount = async (req, res) => {
    try {
        const userId   = req.session.userId;
        const schoolId = req.session.schoolId;

        const memberships = await ChatMember.find({
            user: userId, school: schoolId, isActive: true, isMuted: false,
        }).select('chat lastReadAt').lean();

        let total = 0;
        for (const m of memberships) {
            total += await Message.countDocuments({
                chat:      m.chat,
                sender:    { $ne: userId },
                isDeleted: false,
                createdAt: { $gt: m.lastReadAt || new Date(0) },
            });
        }

        res.json({ success: true, count: total });
    } catch {
        res.json({ success: true, count: 0 });
    }
};

// ─── Chat info (for group member list) ───────────────────────────────────────

/** GET /chat/api/chats/:chatId/members */
exports.getChatMembers = async (req, res) => {
    try {
        const { chatId } = req.params;
        const userId   = req.session.userId;

        const me = await ChatMember.findOne({ chat: chatId, user: userId, isActive: true }).lean();
        if (!me) return res.status(403).json({ success: false, message: 'Not a member' });

        const members = await ChatMember.find({ chat: chatId, isActive: true })
            .populate('user', 'name role profileImage email')
            .lean();

        res.json({ success: true, members });
    } catch (err) {
        console.error('[chatCtrl] getChatMembers:', err);
        res.status(500).json({ success: false, message: 'Failed to load members' });
    }
};
