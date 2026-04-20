const mongoose = require('mongoose');

const marksEntrySchema = new mongoose.Schema({
    student:       { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    marksObtained: { type: Number, default: null },
    isAbsent:      { type: Boolean, default: false },
    remarks:       { type: String, default: '' },
}, { _id: false });

const auditEntrySchema = new mongoose.Schema({
    action:  { type: String, required: true },
    by:      { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    at:      { type: Date, default: Date.now },
    notes:   { type: String, default: '' },
    changes: { type: mongoose.Schema.Types.Mixed, default: null },
}, { _id: false });

const ExamMarksSheetSchema = new mongoose.Schema({
    exam:    { type: mongoose.Schema.Types.ObjectId, ref: 'FormalExam', required: true },
    subject: { type: mongoose.Schema.Types.ObjectId, ref: 'Subject',    required: true },
    section: { type: mongoose.Schema.Types.ObjectId, ref: 'ClassSection', required: true },

    // DRAFT → SUBMITTED (by subject teacher); admin can override marks anytime before FINAL_APPROVED
    status: {
        type: String,
        enum: ['DRAFT', 'SUBMITTED'],
        default: 'DRAFT',
    },

    submittedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    submittedAt: { type: Date, default: null },

    entries:  { type: [marksEntrySchema], default: [] },
    auditLog: { type: [auditEntrySchema], default: [] },

    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
});

ExamMarksSheetSchema.index({ exam: 1, subject: 1 }, { unique: true });

ExamMarksSheetSchema.pre('save', async function () {
    this.updatedAt = new Date();
});

module.exports = mongoose.model('ExamMarksSheet', ExamMarksSheetSchema);
