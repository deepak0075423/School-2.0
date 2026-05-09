const mongoose = require('mongoose');

const ClassMonitorSchema = new mongoose.Schema({
    section: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'ClassSection',
        required: true,
    },
    student: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    assignedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    assignedDate: {
        type: Date,
        default: Date.now,
    },
    status: {
        type: String,
        enum: ['active', 'inactive'],
        default: 'active',
    },
});

// A student can only be an active monitor once per section
ClassMonitorSchema.index({ section: 1, student: 1 }, { unique: true });

module.exports = mongoose.model('ClassMonitor', ClassMonitorSchema);
