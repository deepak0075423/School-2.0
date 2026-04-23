const mongoose = require('mongoose');

const LibraryIssuanceSchema = new mongoose.Schema({
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
    },
    bookCopy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'LibraryBookCopy',
        required: true,
    },
    issuedTo: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true,
    },
    issuedToRole: {
        type: String,
        default: '',
    },
    issuedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    issueDate: {
        type: Date,
        default: Date.now,
    },
    dueDate: {
        type: Date,
        required: true,
    },
    returnDate: {
        type: Date,
        default: null,
    },
    renewalCount: {
        type: Number,
        default: 0,
    },
    status: {
        type: String,
        enum: ['issued', 'returned', 'overdue', 'lost'],
        default: 'issued',
        index: true,
    },
    fine: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'LibraryFine',
        default: null,
    },
    notes: {
        type: String,
        default: '',
        trim: true,
    },
    createdAt: {
        type: Date,
        default: Date.now,
    },
});

LibraryIssuanceSchema.index({ school: 1, status: 1 });
LibraryIssuanceSchema.index({ school: 1, issuedTo: 1, status: 1 });
LibraryIssuanceSchema.index({ bookCopy: 1, status: 1 });
LibraryIssuanceSchema.index({ dueDate: 1, status: 1 });

module.exports = mongoose.model('LibraryIssuance', LibraryIssuanceSchema);
