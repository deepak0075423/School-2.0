const mongoose = require('mongoose');

const StudentSectionHistorySchema = new mongoose.Schema({
    student: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    oldSection: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'ClassSection',
        default: null,
    },
    newSection: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'ClassSection',
        required: true,
    },
    transferDate: {
        type: Date,
        default: Date.now,
    },
    transferReason: {
        type: String,
        default: '',
    },
    transferredBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
});

module.exports = mongoose.model('StudentSectionHistory', StudentSectionHistorySchema);
