const mongoose = require('mongoose');

const TimetableEntrySchema = new mongoose.Schema({
    timetable: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Timetable',
        required: true,
    },
    dayOfWeek: {
        type: String,
        enum: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
        required: true,
    },
    periodNumber: {
        type: Number,
        required: true,
        min: 1,
    },
    subject: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Subject',
        required: true,
    },
    teacher: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null,
    },
});

// Unique period per day per timetable
TimetableEntrySchema.index({ timetable: 1, dayOfWeek: 1, periodNumber: 1 }, { unique: true });

module.exports = mongoose.model('TimetableEntry', TimetableEntrySchema);
