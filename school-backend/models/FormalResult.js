const mongoose = require('mongoose');

const subjectResultSchema = new mongoose.Schema({
    subject:      { type: mongoose.Schema.Types.ObjectId, ref: 'Subject', required: true },
    marksObtained:{ type: Number, default: 0 },
    maxMarks:     { type: Number, required: true },
    passingMarks: { type: Number, required: true },
    grade:        { type: String, default: '' },
    isPassed:     { type: Boolean, default: false },
    isAbsent:     { type: Boolean, default: false },
    remarks:      { type: String, default: '' },
}, { _id: false });

const FormalResultSchema = new mongoose.Schema({
    exam:         { type: mongoose.Schema.Types.ObjectId, ref: 'FormalExam',    required: true },
    student:      { type: mongoose.Schema.Types.ObjectId, ref: 'User',          required: true },
    school:       { type: mongoose.Schema.Types.ObjectId, ref: 'School',        required: true },
    section:      { type: mongoose.Schema.Types.ObjectId, ref: 'ClassSection',  required: true },
    academicYear: { type: mongoose.Schema.Types.ObjectId, ref: 'AcademicYear',  required: true },

    subjects: { type: [subjectResultSchema], default: [] },

    totalMarks:    { type: Number, default: 0 },
    totalMaxMarks: { type: Number, default: 0 },
    percentage:    { type: Number, default: 0 },
    grade:         { type: String, default: '' },
    rank:          { type: Number, default: 0 },
    isPassed:      { type: Boolean, default: false },

    attendancePercentage: { type: Number, default: null },

    generatedAt: { type: Date, default: Date.now },
});

FormalResultSchema.index({ exam: 1, student: 1 }, { unique: true });

module.exports = mongoose.model('FormalResult', FormalResultSchema);
