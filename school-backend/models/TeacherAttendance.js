const mongoose = require('mongoose');

const TeacherAttendanceSchema = new mongoose.Schema({
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
    date: {
        type: Date,
        required: true,
    },
    status: {
        type: String,
        enum: ['Present', 'Absent', 'Half-Day', 'Leave'],
        required: true,
    },
    remarks: {
        type: String,
        default: '',
        trim: true,
    },
    markedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true, // self or admin override
    },
    createdAt: {
        type: Date,
        default: Date.now,
    },
    updatedAt: {
        type: Date,
        default: Date.now,
    },
});

// One attendance record per teacher per day
TeacherAttendanceSchema.index({ teacher: 1, date: 1 }, { unique: true });
TeacherAttendanceSchema.index({ school: 1, date: 1 });

TeacherAttendanceSchema.pre('save', function (next) {
    this.updatedAt = new Date();
    next();
});

module.exports = mongoose.model('TeacherAttendance', TeacherAttendanceSchema);
