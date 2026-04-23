const mongoose = require('mongoose');

const SchoolSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true,
    },
    address: {
        type: String,
        default: '',
    },
    email: {
        type: String,
        default: '',
        lowercase: true,
    },
    phone: {
        type: String,
        default: '',
    },
    website: {
        type: String,
        default: '',
    },
    logo: {
        type: String,
        default: '',
    },
    isActive: {
        type: Boolean,
        default: true,
    },
    // Per-school module feature flags — controlled by Super Admin
    modules: {
        attendance: {
            type: Boolean,
            default: false,
        },
        notification: {
            type: Boolean,
            default: false,
        },
        aptitudeExam: {
            type: Boolean,
            default: false,
        },
        result: {
            type: Boolean,
            default: false,
        },
        timetable: {
            type: Boolean,
            default: false,
        },
        holiday: {
            type: Boolean,
            default: false,
        },
        leave: {
            type: Boolean,
            default: false,
        },
        document: {
            type: Boolean,
            default: false,
        },
    },
    leaveSettings: {
        saturdayWorking: {
            type: Boolean,
            default: true,
        },
    },
    createdAt: {
        type: Date,
        default: Date.now,
    },
});

module.exports = mongoose.model('School', SchoolSchema);
