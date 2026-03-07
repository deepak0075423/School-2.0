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
    class: {
        type: String,
        default: '',
    },
    section: {
        type: String,
        default: '',
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
