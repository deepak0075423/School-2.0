const mongoose = require('mongoose');

const ClassSchema = new mongoose.Schema({
    school: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'School',
        required: true,
    },
    academicYear: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'AcademicYear',
        required: true,
    },
    classNumber: {
        type: Number,
        required: true,
    },
    className: {
        type: String,
        required: true,
        trim: true,
    },
    status: {
        type: String,
        enum: ['active', 'inactive', 'archived'],
        default: 'active',
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null,
    },
    createdAt: {
        type: Date,
        default: Date.now,
    },
});

// Unique class number per school per academic year
ClassSchema.index({ school: 1, academicYear: 1, classNumber: 1 }, { unique: true });

module.exports = mongoose.model('Class', ClassSchema);
