const mongoose = require('mongoose');

const auditEntrySchema = new mongoose.Schema({
    action:  { type: String, required: true },
    by:      { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    at:      { type: Date, default: Date.now },
    notes:   { type: String, default: '' },
}, { _id: false });

const subjectConfigSchema = new mongoose.Schema({
    subject:        { type: mongoose.Schema.Types.ObjectId, ref: 'Subject', required: true },
    maxMarks:       { type: Number, required: true, min: 1 },
    passingMarks:   { type: Number, required: true, min: 0 },
    assignedTeacher:{ type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
}, { _id: false });

const FormalExamSchema = new mongoose.Schema({
    school:       { type: mongoose.Schema.Types.ObjectId, ref: 'School',       required: true },
    academicYear: { type: mongoose.Schema.Types.ObjectId, ref: 'AcademicYear', required: true },
    section:      { type: mongoose.Schema.Types.ObjectId, ref: 'ClassSection', required: true },

    title:    { type: String, required: true, trim: true },
    examType: { type: String, enum: ['MID_TERM', 'FINAL', 'UNIT_TEST'], required: true },

    subjects: { type: [subjectConfigSchema], default: [] },

    startDate:   { type: Date, required: true },
    endDate:     { type: Date, required: true },
    publishDate: { type: Date, required: true },

    // DRAFT → MARKS_PENDING → SUBMITTED → CLASS_APPROVED → FINAL_APPROVED | REJECTED | REOPENED
    status: {
        type: String,
        enum: ['DRAFT', 'MARKS_PENDING', 'SUBMITTED', 'CLASS_APPROVED', 'FINAL_APPROVED', 'REJECTED', 'REOPENED'],
        default: 'DRAFT',
    },

    rejectionReason: { type: String, default: '' },

    classApprovedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    classApprovedAt: { type: Date, default: null },
    finalApprovedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    finalApprovedAt: { type: Date, default: null },

    resultsGenerated: { type: Boolean, default: false },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    auditLog:  { type: [auditEntrySchema], default: [] },

    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
});

FormalExamSchema.pre('save', function (next) {
    this.updatedAt = new Date();
    next();
});

module.exports = mongoose.model('FormalExam', FormalExamSchema);
