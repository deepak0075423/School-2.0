'use strict';
const mongoose = require('mongoose');

const ChatSchema = new mongoose.Schema(
    {
        school: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'School',
            required: true,
        },
        type: {
            type: String,
            enum: ['direct', 'group', 'broadcast'],
            required: true,
        },
        name: {
            type: String,
            trim: true,
            default: '',
        },
        description: {
            type: String,
            default: '',
        },
        createdBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
        },
        // For announcement / read-only groups — only admins/teachers can post
        isReadOnly: {
            type: Boolean,
            default: false,
        },
        avatar: {
            type: String,
            default: '',
        },
        lastMessage: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Message',
            default: null,
        },
        lastActivity: {
            type: Date,
            default: Date.now,
        },
        // Optional FK for class-based groups
        classSection: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'ClassSection',
            default: null,
        },
    },
    { timestamps: true }
);

ChatSchema.index({ school: 1, lastActivity: -1 });
ChatSchema.index({ school: 1, type: 1 });
ChatSchema.index({ school: 1, createdBy: 1 });

module.exports = mongoose.model('Chat', ChatSchema);
