const mongoose = require('mongoose');

const QuestionResultSchema = new mongoose.Schema({
    question:      { type: mongoose.Schema.Types.ObjectId, ref: 'AptitudeQuestion' },
    questionText:  String,
    questionType:  String,
    studentAnswers:  [String], // optionIds selected
    correctAnswers:  [String], // optionIds expected
    optionTexts:     mongoose.Schema.Types.Mixed, // { optionId: text } map for display
    isCorrect:       Boolean,
    marksAwarded:    Number,
    marksTotal:      Number,
}, { _id: false });

const ExamResultSchema = new mongoose.Schema({
    exam: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'AptitudeExam',
        required: true,
    },
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
    totalMarks:    { type: Number, required: true },
    obtainedMarks: { type: Number, required: true },
    percentage:    { type: Number, required: true },
    questionResults: [QuestionResultSchema],
}, { timestamps: true });

ExamResultSchema.index({ exam: 1, student: 1 }, { unique: true });
ExamResultSchema.index({ exam: 1, obtainedMarks: -1 });

module.exports = mongoose.model('ExamResult', ExamResultSchema);
