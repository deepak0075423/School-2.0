const mongoose = require('mongoose');

const ClassSubjectSchema = new mongoose.Schema({
    class: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Class',
        required: true,
    },
    subject: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Subject',
        required: true,
    },
    createdAt: {
        type: Date,
        default: Date.now,
    },
});

// A subject can only be assigned once per class
ClassSubjectSchema.index({ class: 1, subject: 1 }, { unique: true });

module.exports = mongoose.model('ClassSubject', ClassSubjectSchema);
