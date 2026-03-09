const mongoose = require('mongoose');

const ActivityLogSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    school: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'School',
        default: null,
    },
    actionType: {
        type: String,
        required: true,
        // e.g. 'CREATE_CLASS', 'UPDATE_SECTION', 'ASSIGN_STUDENT', 'MARK_ATTENDANCE'
    },
    entityType: {
        type: String,
        required: true,
        // e.g. 'Class', 'ClassSection', 'Student'
    },
    entityId: {
        type: mongoose.Schema.Types.ObjectId,
        default: null,
    },
    oldValue: {
        type: mongoose.Schema.Types.Mixed,
        default: null,
    },
    newValue: {
        type: mongoose.Schema.Types.Mixed,
        default: null,
    },
    createdAt: {
        type: Date,
        default: Date.now,
    },
});

// Index for fast lookup by school/user/time
ActivityLogSchema.index({ school: 1, createdAt: -1 });
ActivityLogSchema.index({ user: 1, createdAt: -1 });

module.exports = mongoose.model('ActivityLog', ActivityLogSchema);
