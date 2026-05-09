const mongoose = require('mongoose');

const NotificationReceiptSchema = new mongoose.Schema({
    notification: { type: mongoose.Schema.Types.ObjectId, ref: 'Notification', required: true },
    recipient:    { type: mongoose.Schema.Types.ObjectId, ref: 'User',         required: true },
    school:       { type: mongoose.Schema.Types.ObjectId, ref: 'School',       default: null },
    isRead:       { type: Boolean, default: false },
    readAt:       { type: Date,    default: null },
    isCleared:    { type: Boolean, default: false },
    clearedAt:    { type: Date,    default: null },
}, { timestamps: true });

// One receipt per (notification × recipient)
NotificationReceiptSchema.index({ notification: 1, recipient: 1 }, { unique: true });
// Bell icon query — uncleared receipts for a user, newest first
NotificationReceiptSchema.index({ recipient: 1, isCleared: 1, createdAt: -1 });
// Unread count query
NotificationReceiptSchema.index({ recipient: 1, isRead: 1, isCleared: 1 });

module.exports = mongoose.model('NotificationReceipt', NotificationReceiptSchema);
