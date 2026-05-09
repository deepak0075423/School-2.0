'use strict';
const mongoose = require('mongoose');

const ChatMemberSchema = new mongoose.Schema(
    {
        chat: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Chat',
            required: true,
        },
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
        },
        school: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'School',
            required: true,
        },
        // 'admin' = group owner/creator; can update settings & remove members
        role: {
            type: String,
            enum: ['admin', 'member'],
            default: 'member',
        },
        isMuted: {
            type: Boolean,
            default: false,
        },
        muteUntil: {
            type: Date,
            default: null,
        },
        isArchived: {
            type: Boolean,
            default: false,
        },
        // Tracks read position for unread-count calculation
        lastReadMessage: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Message',
            default: null,
        },
        lastReadAt: {
            type: Date,
            default: null,
        },
        // Soft-delete: false = member left or was removed
        isActive: {
            type: Boolean,
            default: true,
        },
        joinedAt: {
            type: Date,
            default: Date.now,
        },
    },
    { timestamps: true }
);

ChatMemberSchema.index({ chat: 1, user: 1 }, { unique: true });
ChatMemberSchema.index({ user: 1, school: 1, isActive: 1 });
ChatMemberSchema.index({ chat: 1, isActive: 1 });

module.exports = mongoose.model('ChatMember', ChatMemberSchema);
