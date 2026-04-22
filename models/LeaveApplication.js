const mongoose = require('mongoose');

const LeaveApplicationSchema = new mongoose.Schema({
    teacher: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    school: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'School',
        required: true,
    },
    leaveType: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'LeaveType',
        required: true,
    },
    fromDate: { type: Date, required: true },
    toDate: { type: Date, required: true },
    totalDays: { type: Number, required: true },
    leaveMode: {
        type: String,
        enum: ['full_day', 'half_day'],
        default: 'full_day',
    },
    reason: { type: String, required: true, trim: true },
    document: { type: String, default: null }, // file path
    status: {
        type: String,
        enum: ['pending', 'approved', 'rejected', 'modification_requested', 'cancelled'],
        default: 'pending',
    },
    adminComment: { type: String, default: '' },
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    appliedAt: { type: Date, default: Date.now },
    approvedAt: { type: Date, default: null },
    rejectedAt: { type: Date, default: null },
    modificationRequestedAt: { type: Date, default: null },
    cancelledAt: { type: Date, default: null },
}, { timestamps: true });

LeaveApplicationSchema.index({ teacher: 1, school: 1, status: 1 });
LeaveApplicationSchema.index({ school: 1, status: 1, fromDate: -1 });
LeaveApplicationSchema.index({ teacher: 1, fromDate: 1, toDate: 1 });

module.exports = mongoose.model('LeaveApplication', LeaveApplicationSchema);
