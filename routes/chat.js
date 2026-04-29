'use strict';
const express = require('express');
const router  = express.Router();

const { isAuthenticated, requirePasswordReset } = require('../middleware/auth');
const requireModule = require('../middleware/requireModule');
const uploadChat    = require('../middleware/uploadChat');
const ctrl          = require('../controllers/chatController');

// All chat routes require authentication + password-reset check + chat module enabled
const guard = [isAuthenticated, requirePasswordReset, requireModule('chat')];

// ── Page ──────────────────────────────────────────────────────────────────────
router.get('/', guard, ctrl.getIndex);

// ── Chat list + messages ──────────────────────────────────────────────────────
router.get('/api/chats',                     guard, ctrl.getChats);
router.get('/api/chats/:chatId/messages',    guard, ctrl.getMessages);
router.get('/api/chats/:chatId/members',     guard, ctrl.getChatMembers);

// ── Contacts & search ─────────────────────────────────────────────────────────
router.get('/api/contacts',                  guard, ctrl.getContacts);
router.get('/api/search',                    guard, ctrl.searchMessages);
router.get('/api/unread-count',              guard, ctrl.getUnreadCount);

// ── Create conversations ──────────────────────────────────────────────────────
router.post('/direct',                       guard, ctrl.createDirectChat);
router.post('/group',                        guard, ctrl.createGroup);

// ── Message operations ────────────────────────────────────────────────────────
router.patch('/api/messages/:msgId',         guard, ctrl.editMessage);
router.delete('/api/messages/:msgId',        guard, ctrl.deleteMessage);

// ── Group management ──────────────────────────────────────────────────────────
router.patch('/group/:chatId/settings',      guard, ctrl.updateGroupSettings);
router.delete('/group/:chatId/member/:memberId', guard, ctrl.removeMember);

// ── Per-chat actions ──────────────────────────────────────────────────────────
router.post('/:chatId/mute',                 guard, ctrl.toggleMute);
router.post('/:chatId/archive',              guard, ctrl.toggleArchive);

// ── File upload ───────────────────────────────────────────────────────────────
router.post('/upload', guard, uploadChat.single('file'), ctrl.uploadFile);

module.exports = router;
