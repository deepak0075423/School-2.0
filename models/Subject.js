const mongoose = require('mongoose');

const SubjectSchema = new mongoose.Schema({
    school: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'School',
        required: true,
    },
    subjectName: {
        type: String,
        required: true,
        trim: true,
    },
    subjectCode: {
        type: String,
        required: true,
        trim: true,
        uppercase: true,
    },
    description: {
        type: String,
        default: '',
    },
    teachers: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }],
    createdAt: {
        type: Date,
        default: Date.now,
    },
});

// Unique subject code per school
SubjectSchema.index({ school: 1, subjectCode: 1 }, { unique: true });

module.exports = mongoose.model('Subject', SubjectSchema);
