const mongoose = require('mongoose');

const LibraryAuditLogSchema = new mongoose.Schema({
    school: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'School',
        index: true,
    },
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
    },
    role: {
        type: String,
        default: '',
    },
    actionType: {
        type: String,
        required: true,
        // BOOK_CREATED, BOOK_UPDATED, BOOK_DELETED
        // COPY_ADDED, COPY_UPDATED, COPY_STATUS_CHANGED
        // BOOK_ISSUED, BOOK_RETURNED, BOOK_RENEWED
        // RESERVATION_CREATED, RESERVATION_READY, RESERVATION_COLLECTED, RESERVATION_EXPIRED, RESERVATION_CANCELLED
        // FINE_GENERATED, FINE_PAID, FINE_WAIVED
        // POLICY_UPDATED
    },
    entityType: {
        type: String,
        required: true,
        enum: ['Book', 'BookCopy', 'Issuance', 'Reservation', 'Fine', 'Policy'],
    },
    entityId: {
        type: mongoose.Schema.Types.ObjectId,
    },
    oldValue: {
        type: mongoose.Schema.Types.Mixed,
        default: null,
    },
    newValue: {
        type: mongoose.Schema.Types.Mixed,
        default: null,
    },
    timestamp: {
        type: Date,
        default: Date.now,
        index: true,
    },
});

// Immutable — never allow updates or deletes via application code
LibraryAuditLogSchema.index({ school: 1, timestamp: -1 });
LibraryAuditLogSchema.index({ school: 1, actionType: 1 });
LibraryAuditLogSchema.index({ school: 1, entityType: 1, entityId: 1 });

module.exports = mongoose.model('LibraryAuditLog', LibraryAuditLogSchema);
