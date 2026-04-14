const mongoose = require('mongoose');

const TimetableSchema = new mongoose.Schema({
    section: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'ClassSection',
        required: true,
    },
    academicYear: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'AcademicYear',
        required: true,
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    schoolStartTime: {
        type: String,
        required: true,
    },
    schoolEndTime: {
        type: String,
        required: true,
    },
    periodsStructure: [
        {
            periodNumber: { type: Number },
            startTime: { type: String, required: true },
            endTime: { type: String, required: true },
            isRecess: { type: Boolean, default: false },
            recessName: { type: String, default: 'Break' }
        }
    ],
    createdAt: {
        type: Date,
        default: Date.now,
    },
});

// One timetable per section per academic year
TimetableSchema.index({ section: 1, academicYear: 1 }, { unique: true });

module.exports = mongoose.model('Timetable', TimetableSchema);
