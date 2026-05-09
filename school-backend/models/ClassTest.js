const mongoose = require('mongoose');

const marksEntrySchema = new mongoose.Schema({
    student:       { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    marksObtained: { type: Number, default: null },
    isAbsent:      { type: Boolean, default: false },
    remarks:       { type: String, default: '' },
    grade:         { type: String, default: '' },
}, { _id: false });

const auditEntrySchema = new mongoose.Schema({
    action:  { type: String, required: true },
    by:      { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    at:      { type: Date, default: Date.now },
    notes:   { type: String, default: '' },
}, { _id: false });

const ClassTestSchema = new mongoose.Schema({
    school:       { type: mongoose.Schema.Types.ObjectId, ref: 'School',        required: true },
    section:      { type: mongoose.Schema.Types.ObjectId, ref: 'ClassSection',  required: true },
    subject:      { type: mongoose.Schema.Types.ObjectId, ref: 'Subject',       required: true },
    academicYear: { type: mongoose.Schema.Types.ObjectId, ref: 'AcademicYear',  required: true },

    title:       { type: String, required: true, trim: true },
    testDate:    { type: Date,   required: true },
    maxMarks:    { type: Number, required: true, min: 1 },
    passingMarks:{ type: Number, required: true, min: 0 },
    topic:       { type: String, default: '' },
    description: { type: String, default: '' },

    // DRAFT → SUBMITTED → FINAL_APPROVED | REJECTED | REOPENED
    status: {
        type: String,
        enum: ['DRAFT', 'SUBMITTED', 'FINAL_APPROVED', 'REJECTED', 'REOPENED'],
        default: 'DRAFT',
    },

    rejectionReason: { type: String, default: '' },

    marks: { type: [marksEntrySchema], default: [] },

    classStats: {
        average:     { type: Number, default: null },
        highest:     { type: Number, default: null },
        lowest:      { type: Number, default: null },
        passPercent: { type: Number, default: null },
    },

    createdBy:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    approvedBy:  { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    approvedAt:  { type: Date, default: null },
    auditLog:    { type: [auditEntrySchema], default: [] },

    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
});

ClassTestSchema.pre('save', async function () {
    this.updatedAt = new Date();
});

module.exports = mongoose.model('ClassTest', ClassTestSchema);
