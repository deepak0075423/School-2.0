const mongoose = require('mongoose');

const OptionSchema = new mongoose.Schema({
    optionId: { type: String, required: true }, // 'a', 'b', 'c', 'd', 'true', 'false'
    text:     { type: String, required: true, trim: true },
}, { _id: false });

const AptitudeQuestionSchema = new mongoose.Schema({
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
    questionText: {
        type: String,
        required: true,
        trim: true,
    },
    questionType: {
        type: String,
        enum: ['mcq_single', 'mcq_multiple', 'true_false'],
        required: true,
    },
    options: [OptionSchema],
    // optionIds of correct answers
    correctAnswers: [{
        type: String,
        required: true,
    }],
    marks: {
        type: Number,
        required: true,
        min: 0.5,
    },
    order: {
        type: Number,
        default: 0,
    },
}, { timestamps: true });

AptitudeQuestionSchema.index({ exam: 1, order: 1 });

module.exports = mongoose.model('AptitudeQuestion', AptitudeQuestionSchema);
