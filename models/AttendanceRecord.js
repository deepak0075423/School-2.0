const mongoose = require('mongoose');

const AttendanceRecordSchema = new mongoose.Schema({
    attendance: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Attendance',
        required: true,
    },
    student: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    status: {
        type: String,
        enum: ['Present', 'Absent', 'Late'],
        required: true,
    },
    remarks: {
        type: String,
        default: '',
    },
});

// One record per student per attendance session
AttendanceRecordSchema.index({ attendance: 1, student: 1 }, { unique: true });

module.exports = mongoose.model('AttendanceRecord', AttendanceRecordSchema);
