'use strict';
const mongoose = require('mongoose');

const MessageReceiptSchema = new mongoose.Schema(
    {
        message: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Message',
            required: true,
        },
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
        deliveredAt: {
            type: Date,
            default: Date.now,
        },
        readAt: {
            type: Date,
            default: null,
        },
    },
    { timestamps: true }
);

// One receipt per (message, user) pair
MessageReceiptSchema.index({ message: 1, user: 1 }, { unique: true });
// Unread count query: chat + user + readAt null
MessageReceiptSchema.index({ chat: 1, user: 1, readAt: 1 });

module.exports = mongoose.model('MessageReceipt', MessageReceiptSchema);
