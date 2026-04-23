const mongoose = require('mongoose');

const LibraryReservationSchema = new mongoose.Schema({
    school: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'School',
        required: true,
        index: true,
    },
    book: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'LibraryBook',
        required: true,
        index: true,
    },
    reservedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true,
    },
    // FIFO position in the queue (1 = next to be served)
    queuePosition: {
        type: Number,
        required: true,
    },
    status: {
        type: String,
        enum: ['pending', 'ready', 'collected', 'expired', 'cancelled'],
        default: 'pending',
        index: true,
    },
    reservedAt: {
        type: Date,
        default: Date.now,
    },
    // Set when librarian marks a copy is ready for pickup
    readyAt: {
        type: Date,
        default: null,
    },
    // Set when status becomes 'ready' — user has reservationExpiryDays to collect
    expiresAt: {
        type: Date,
        default: null,
    },
    notifiedAt: {
        type: Date,
        default: null,
    },
    createdAt: {
        type: Date,
        default: Date.now,
    },
});

// Prevent duplicate active reservations for same user+book
LibraryReservationSchema.index(
    { book: 1, reservedBy: 1, status: 1 },
    { unique: false }
);
LibraryReservationSchema.index({ school: 1, book: 1, status: 1, queuePosition: 1 });

module.exports = mongoose.model('LibraryReservation', LibraryReservationSchema);
