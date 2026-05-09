const mongoose = require('mongoose');

const StudentConcessionSchema = new mongoose.Schema({
    school: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
    student: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    academicYear: { type: mongoose.Schema.Types.ObjectId, ref: 'AcademicYear', required: true },
    concession: { type: mongoose.Schema.Types.ObjectId, ref: 'FeeConcession', required: true },
    validFrom: { type: Date, default: null },
    validTo: { type: Date, default: null },
    remarks: { type: String, default: '' },
    isActive: { type: Boolean, default: true },
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

StudentConcessionSchema.index({ school: 1, student: 1, academicYear: 1 });
StudentConcessionSchema.index({ school: 1, academicYear: 1 });

module.exports = mongoose.model('StudentConcession', StudentConcessionSchema);
