const mongoose = require('mongoose');

const StudentProfileSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    school: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'School',
        required: true,
    },
    gender: {
        type: String,
        enum: ['Male', 'Female', 'Other', ''],
        default: '',
    },
    bloodGroup: {
        type: String,
        default: '',
    },
    religion: {
        type: String,
        default: '',
    },
    category: {
        type: String,
        default: '',
    },
    // Legacy plain-text fields (kept for backward compat)
    class: {
        type: String,
        default: '',
    },
    section: {
        type: String,
        default: '',
    },
    // New FK — assigned section
    currentSection: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'ClassSection',
        default: null,
    },
    admissionNumber: {
        type: String,
        default: '',
        trim: true,
    },
    dob: {
        type: Date,
        default: null,
    },
    address: {
        type: String,
        default: '',
    },
    parent: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null,
    },
    rollNumber: {
        type: String,
        default: '',
    },
    createdAt: {
        type: Date,
        default: Date.now,
    },
});

module.exports = mongoose.model('StudentProfile', StudentProfileSchema);

