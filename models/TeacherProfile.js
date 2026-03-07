const mongoose = require('mongoose');

const TeacherProfileSchema = new mongoose.Schema({
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
    subjects: {
        type: [String],
        default: [],
    },
    classes: {
        type: [String],
        default: [],
    },
    qualification: {
        type: String,
        default: '',
    },
    experience: {
        type: String,
        default: '',
    },
    createdAt: {
        type: Date,
        default: Date.now,
    },
});

module.exports = mongoose.model('TeacherProfile', TeacherProfileSchema);
