const mongoose = require('mongoose');

const ExamViolationSchema = new mongoose.Schema({
    attempt: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'ExamAttempt',
        required: true,
    },
    student: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    exam: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'AptitudeExam',
        required: true,
    },
    school: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'School',
        required: true,
    },
    violationType: {
        type: String,
        enum: ['tab_switch', 'window_blur'],
        required: true,
    },
    occurredAt: {
        type: Date,
        default: Date.now,
    },
});

ExamViolationSchema.index({ attempt: 1, occurredAt: -1 });

module.exports = mongoose.model('ExamViolation', ExamViolationSchema);
