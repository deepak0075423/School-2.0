const mongoose = require('mongoose');

const LeaveBalanceSchema = new mongoose.Schema({
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
    academicYear: { type: String, required: true }, // e.g. "2025-26"
    totalAllocated: { type: Number, default: 0 },
    carriedForward: { type: Number, default: 0 },
    used: { type: Number, default: 0 },
    pending: { type: Number, default: 0 }, // awaiting approval
}, { timestamps: true });

LeaveBalanceSchema.index(
    { teacher: 1, school: 1, leaveType: 1, academicYear: 1 },
    { unique: true }
);
LeaveBalanceSchema.index({ school: 1, academicYear: 1 });

// Virtual: remaining days available
LeaveBalanceSchema.virtual('remaining').get(function () {
    return Math.max(0, this.totalAllocated + this.carriedForward - this.used - this.pending);
});

module.exports = mongoose.model('LeaveBalance', LeaveBalanceSchema);
