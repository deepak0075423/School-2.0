const mongoose = require('mongoose');

const SectionSubjectTeacherSchema = new mongoose.Schema({
    section: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'ClassSection',
        required: true,
    },
    subject: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Subject',
        required: true,
    },
    teacher: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    createdAt: {
        type: Date,
        default: Date.now,
    },
});

// One teacher entry per section+subject+teacher combination
SectionSubjectTeacherSchema.index({ section: 1, subject: 1, teacher: 1 }, { unique: true });

module.exports = mongoose.model('SectionSubjectTeacher', SectionSubjectTeacherSchema);
