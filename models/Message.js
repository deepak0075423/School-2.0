'use strict';
const mongoose = require('mongoose');

const AttachmentSchema = new mongoose.Schema(
    {
        originalName: { type: String, default: '' },
        fileName:     { type: String, default: '' },
        fileUrl:      { type: String, default: '' },
        fileType:     { type: String, default: '' },
        fileSize:     { type: Number, default: 0 },
    },
    { _id: false }
);

const MessageSchema = new mongoose.Schema(
    {
        chat: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Chat',
            required: true,
        },
        school: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'School',
            required: true,
        },
        sender: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
        },
        senderRole: {
            type: String,
            required: true,
        },
        content: {
            type: String,
            default: '',
            maxlength: 4000,
        },
        type: {
            type: String,
            enum: ['text', 'file', 'image'],
            default: 'text',
        },
        attachments: {
            type: [AttachmentSchema],
            default: [],
        },
        // FK to parent message for quote/reply
        replyTo: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Message',
            default: null,
        },
        isEdited: {
            type: Boolean,
            default: false,
        },
        editedAt: {
            type: Date,
            default: null,
        },
        isDeleted: {
            type: Boolean,
            default: false,
        },
        deletedAt: {
            type: Date,
            default: null,
        },
        deletedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            default: null,
        },
        mentions: [
            {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'User',
            },
        ],
    },
    { timestamps: true }
);

// Primary access pattern: paginated history per chat
MessageSchema.index({ chat: 1, createdAt: -1 });
// Full-text search
MessageSchema.index({ content: 'text' });
// Sender-based queries (e.g. "delete all messages from user X")
MessageSchema.index({ sender: 1, chat: 1 });

module.exports = mongoose.model('Message', MessageSchema);
