const mongoose = require('mongoose');

const LeaveTypeSchema = new mongoose.Schema({
    school: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'School',
        required: true,
    },
    name: { type: String, required: true, trim: true },
    code: { type: String, required: true, trim: true, uppercase: true },
    annualAllocation: { type: Number, required: true, default: 0 },
    monthlyAccrual: {
        enabled: { type: Boolean, default: false },
        daysPerMonth: { type: Number, default: 0 },
    },
    carryForward: {
        enabled: { type: Boolean, default: false },
        maxDays: { type: Number, default: 0 },
    },
    encashable: { type: Boolean, default: false },
    maxConsecutiveDays: { type: Number, default: 0 }, // 0 = no limit
    requiresDocument: { type: Boolean, default: false },
    // 0 = document always required; N > 0 = required only when leave exceeds N days
    documentRequiredAfterDays: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

LeaveTypeSchema.index({ school: 1, code: 1 }, { unique: true });
LeaveTypeSchema.index({ school: 1, isActive: 1 });

module.exports = mongoose.model('LeaveType', LeaveTypeSchema);
