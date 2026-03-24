const mongoose = require('mongoose');

const AttendanceCorrectionSchema = new mongoose.Schema({
    student: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    school: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'School',
        required: true,
    },
    section: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'ClassSection',
        required: true,
    },
    attendance: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Attendance',
        required: true,
    },
    attendanceRecord: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'AttendanceRecord',
        default: null, // null if the student was not marked at all
    },
    date: {
        type: Date,
        required: true,
    },
    currentStatus: {
        type: String,
        enum: ['Present', 'Absent', 'Late', 'Not Marked'],
        required: true,
    },
    requestedStatus: {
        type: String,
        enum: ['Present', 'Absent', 'Late'],
        required: true,
    },
    reason: {
        type: String,
        required: true,
        trim: true,
        maxlength: 500,
    },
    status: {
        type: String,
        enum: ['Pending', 'Approved', 'Rejected'],
        default: 'Pending',
    },
    reviewedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null,
    },
    reviewedAt: {
        type: Date,
        default: null,
    },
    teacherRemarks: {
        type: String,
        default: '',
        trim: true,
    },
    createdAt: {
        type: Date,
        default: Date.now,
    },
});

// Prevent duplicate pending correction for the same day
AttendanceCorrectionSchema.index({ student: 1, date: 1, status: 1 });
AttendanceCorrectionSchema.index({ section: 1, status: 1 });
AttendanceCorrectionSchema.index({ school: 1, status: 1 });

module.exports = mongoose.model('AttendanceCorrection', AttendanceCorrectionSchema);
