const mongoose = require('mongoose');

const HolidaySchema = new mongoose.Schema({
    school: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'School',
        required: true,
    },
    name: {
        type: String,
        required: true,
        trim: true,
    },
    startDate: {
        type: Date,
        required: true,
    },
    endDate: {
        type: Date,
        required: true,
    },
    type: {
        type: String,
        enum: ['public', 'school_specific', 'optional', 'exam_break'],
        required: true,
    },
    description: {
        type: String,
        default: '',
        trim: true,
    },
    isRecurring: {
        type: Boolean,
        default: false,
    },
    applicability: {
        scope: {
            type: String,
            enum: ['all', 'specific_classes', 'specific_departments'],
            default: 'all',
        },
        classes: [{
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Class',
        }],
        departments: [{
            type: String,
            enum: ['teaching_staff', 'admin_staff'],
        }],
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    updatedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null,
    },
    academicYear: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'AcademicYear',
        default: null,
    },
}, { timestamps: true });

HolidaySchema.index({ school: 1, startDate: 1 });
HolidaySchema.index({ school: 1, academicYear: 1, startDate: 1 });

module.exports = mongoose.model('Holiday', HolidaySchema);
