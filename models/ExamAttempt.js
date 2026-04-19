const mongoose = require('mongoose');

// Stores per-student shuffled question/option order + saved answers
const ExamAttemptSchema = new mongoose.Schema({
    exam: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'AptitudeExam',
        required: true,
    },
    student: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    school: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'School',
        required: true,
    },
    section: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'ClassSection',
        required: true,
    },
    // Shuffled question IDs (consistent for the full session)
    questionOrder: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'AptitudeQuestion',
    }],
    // Per-question shuffled option order
    optionOrders: [{
        question: { type: mongoose.Schema.Types.ObjectId },
        options: [{
            optionId: String,
            text:     String,
        }],
    }],
    // Student's saved answers (upserted on each selection)
    answers: [{
        question:        { type: mongoose.Schema.Types.ObjectId },
        selectedOptions: [String], // optionIds
        savedAt:         { type: Date, default: Date.now },
    }],
    startedAt:     { type: Date, default: null },
    submittedAt:   { type: Date, default: null },
    serverEndTime: { type: Date, default: null }, // startedAt + duration
    status: {
        type: String,
        enum: ['not_started', 'in_progress', 'submitted', 'auto_submitted'],
        default: 'not_started',
    },
    violationCount: { type: Number, default: 0 },
}, { timestamps: true });

ExamAttemptSchema.index({ exam: 1, student: 1 }, { unique: true });

module.exports = mongoose.model('ExamAttempt', ExamAttemptSchema);
