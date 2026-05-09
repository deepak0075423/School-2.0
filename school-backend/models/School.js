const mongoose = require('mongoose');

const SchoolSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true,
    },
    code: {
        type: String,
        trim: true,
        default: '',
    },
    email: {
        type: String,
        trim: true,
        default: '',
        lowercase: true,
    },
    phone: {
        type: String,
        trim: true,
        default: '',
    },
    address: {
        type: String,
        trim: true,
        default: '',
    },
    city: {
        type: String,
        trim: true,
        default: '',
    },
    state: {
        type: String,
        trim: true,
        default: '',
    },
    country: {
        type: String,
        trim: true,
        default: 'India',
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
        library: {
            type: Boolean,
            default: false,
        },
        payroll: {
            type: Boolean,
            default: false,
        },
        fees: {
            type: Boolean,
            default: false,
        },
        chat: {
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
