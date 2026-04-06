const mongoose = require('mongoose');

const ClassSectionSchema = new mongoose.Schema({
    school: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'School',
        required: true,
    },
    class: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Class',
        required: true,
    },
    academicYear: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'AcademicYear',
        required: true,
    },
    sectionName: {
        type: String,
        required: true,
        trim: true,
        uppercase: true,
    },
    classTeacher: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null,
    },
    substituteTeacher: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null,
    },
    maxStudents: {
        type: Number,
        required: true,
        min: 1,
        default: 40,
    },
    currentCount: {
        type: Number,
        default: 0,
        min: 0,
    },
    status: {
        type: String,
        enum: ['active', 'inactive', 'archived'],
        default: 'active',
    },
    createdAt: {
        type: Date,
        default: Date.now,
    },
});

// Unique section name within a class
ClassSectionSchema.index({ class: 1, sectionName: 1 }, { unique: true });

// Validate classTeacher != substituteTeacher
ClassSectionSchema.pre('save', async function () {
    if (
        this.classTeacher &&
        this.substituteTeacher &&
        this.classTeacher.toString() === this.substituteTeacher.toString()
    ) {
        throw new Error('Class teacher and substitute teacher cannot be the same person.');
    }
});

module.exports = mongoose.model('ClassSection', ClassSectionSchema);
